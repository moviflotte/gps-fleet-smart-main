// server.js  (ESM)

import dotenv from "dotenv";
dotenv.config(); // IMPORTANT: avant toute lecture de process.env

import express from "express";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
const { Pool } = pkg;

/* =========================
   PostgreSQL Pool
========================= */
export const pg = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: String(process.env.PGPASSWORD ?? ""),   // <-- force string
  database: process.env.PGDATABASE || "postgres",
  max: 10,
});

// Test connexion au démarrage
pg.connect()
  .then((c) => c.query("SELECT 1").finally(() => c.release()))
  .then(() => console.log("[✅ PostgreSQL] Connected"))
  .catch((err) => console.error("[❌ PostgreSQL] Connection failed:", err.message));

/* =========================
   Express & constants
========================= */
const app = express();
app.use(express.json());

/* =========================
   CORS
========================= */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow =
    ALLOWED_ORIGINS.length === 0 ||          // no restriction set → allow all
    ALLOWED_ORIGINS.includes("*") ||
    (origin && ALLOWED_ORIGINS.includes(origin));

  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* =========================
   Request logger (errors only)
========================= */
app.use((req, _res, next) => { next(); });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const BASE = (process.env.UPSTREAM_BASE || "https://api.pinme.io/api").replace(/\/+$/, "");
const TEST_PATH = process.env.TEST_PATH || "/devices";

const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";

/* =========================
   Upstream fetch helpers (PinMe)
========================= */
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 40000);

async function upstreamFetch(fullUrl, init, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(fullUrl, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`upstream timeout after ${timeoutMs}ms: ${fullUrl}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function upstreamGet(urlPath, { headers = {}, params, timeoutMs } = {}) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const fullUrl = BASE + urlPath + qs;
  return upstreamFetch(fullUrl, { headers, redirect: "follow" }, timeoutMs);
}
async function upstreamPost(urlPath, body, { headers = {}, timeoutMs } = {}) {
  const fullUrl = BASE + urlPath;
  return upstreamFetch(fullUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "follow",
  }, timeoutMs);
}
async function upstreamPut(urlPath, body, { headers = {}, timeoutMs } = {}) {
  const fullUrl = BASE + urlPath;
  return upstreamFetch(fullUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "follow",
  }, timeoutMs);
}

/* =========================
   Helpers
========================= */
function makeBasicHeader(u, p) {
  if (!p) return null;
  return "JSESSIONID=" + p;
}
const asArr = (d) => (Array.isArray(d) ? d : d ? [d] : []);
function companyFromUsername(u = "") {
  const base = String(u).split("@")[0] || "";
  return (
    base
      .normalize("NFKD")
      .replace(/[^\w]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .toLowerCase() || "default"
  );
}

/* =========================
   Pool concurrency
========================= */
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async function runner() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}
const CONCURRENCY = Number(process.env.UPSTREAM_CONCURRENCY || 10);

/* =========================
   Shared fetchers PinMe
========================= */
async function getDevices(auth) {
  const r = await upstreamGet("/devices", { headers: { Cookie: auth } });
  if (r.status >= 400) throw new Error(`devices ${r.status}`);
  return asArr(r.data);
}
async function getGroups(auth) {
  const r = await upstreamGet("/groups", { headers: { Cookie: auth }, params: { all: true } });
  if (r.status >= 400) throw new Error(`groups ${r.status}`);
  return asArr(r.data);
}
async function getGeofences(auth) {
  const r = await upstreamGet("/geofences", { headers: { Cookie: auth }, params: { all: true } });
  if (r.status >= 400) {
    const body = typeof r.data === 'string' ? r.data.slice(0, 200) : JSON.stringify(r.data).slice(0, 200);
    console.warn(`[geofences] upstream ${r.status}: ${body}`);
    return [];
  }
  return asArr(r.data);
}
async function getEvents(auth, deviceId, from, to) {
  const r = await upstreamGet("/reports/events", { headers: { Cookie: auth }, params: { deviceId, from, to } });
  if (r.status >= 400) {
    const body = typeof r.data === 'string' ? r.data.slice(0, 200) : JSON.stringify(r.data).slice(0, 200);
    console.warn(`[events] upstream ${r.status} device=${deviceId}: ${body}`);
    return [];
  }
  return asArr(r.data);
}
const EVENTS_CHUNK_MS = 15 * 24 * 60 * 60 * 1000; // 15-day windows
async function getEventsSplit(auth, deviceId, from, to) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (toMs - fromMs <= EVENTS_CHUNK_MS) return getEvents(auth, deviceId, from, to);
  const chunks = [];
  let cursor = fromMs;
  while (cursor < toMs) {
    const end = Math.min(cursor + EVENTS_CHUNK_MS, toMs);
    chunks.push({ from: new Date(cursor).toISOString(), to: new Date(end).toISOString() });
    cursor = end;
  }
  const results = await Promise.all(chunks.map(c => getEvents(auth, deviceId, c.from, c.to)));
  return results.flat();
}
async function getMaint(auth, deviceId) {
  const r = await upstreamGet("/maintenance", { headers: { Cookie: auth }, params: { deviceId } });
  if (r.status >= 400) return [];
  return asArr(r.data);
}

/* =========================
   AUTH + basic resources
========================= */
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  try {
    const r = await upstreamGet(TEST_PATH, { headers: { Cookie: auth }, params: { all: true } });
    if (r.status >= 400) {
      const status = r.status;
      if (status === 401 || status === 403) return res.status(status).json({ ok: false, error: "invalid_credentials", status });
      return res.status(status).json({ ok: false, error: "upstream_error", status, detail: r.data });
    }
    res.json({ ok: true, status: r.status });
  } catch (e) {
    console.error(`[login] error:`, e.message);
    res.status(500).json({ ok: false, error: "network_error", detail: e.message });
  }
});

app.post("/api/devices", async (req, res) => {
  const { username, password } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  try {
    const data = await getDevices(auth);
    res.json(data);
  } catch (e) {
    console.error(`[devices] error:`, e.message);
    res.status(500).json({ ok: false, error: "devices_failed", detail: e.message });
  }
});

app.post("/api/groups", async (req, res) => {
  const { username, password } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  try {
    const data = await getGroups(auth);
    res.json(data);
  } catch (e) {
    console.error(`[groups] error:`, e.message);
    res.status(500).json({ ok: false, error: "groups_failed", detail: e.message });
  }
});

/* =========================
   AllInOne bulk fetcher
========================= */
const ALLINONE_CHUNK = Number(process.env.ALLINONE_CHUNK || 1);
const ALLINONE_PARALLEL = Number(process.env.ALLINONE_PARALLEL || 25);
const ALLINONE_RETRIES = Number(process.env.ALLINONE_RETRIES || 1);
const ALLINONE_DATE_CHUNK_DAYS = Number(process.env.ALLINONE_DATE_CHUNK_DAYS || 6);

function splitDateRange(from, to, days) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs || !(days > 0)) {
    return [{ from, to }];
  }
  const windowMs = days * 24 * 60 * 60 * 1000;
  const out = [];
  for (let start = fromMs; start < toMs; start += windowMs) {
    const end = Math.min(start + windowMs, toMs);
    out.push({ from: new Date(start).toISOString(), to: new Date(end).toISOString() });
  }
  return out;
}

async function fetchAllInOneChunk(auth, deviceIds, from, to, types, label = "") {
  const params = new URLSearchParams();
  for (const id of deviceIds) params.append("deviceId", String(id));
  for (const t of types) params.append("type", t);
  params.append("from", from);
  params.append("to", to);
  const url = "/reports/allinone?" + params.toString();
  const tag = `[allinone${label ? " " + label : ""}] devices=${deviceIds.length} types=${types.join("+")}`;
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    console.log(`${tag} attempt=${attempt + 1} → start ids=${JSON.stringify(deviceIds)}`);
    try {
      const r = await upstreamGet(url, { headers: { Cookie: auth } });
      const ms = Date.now() - t0;
      if (r.status >= 400) {
        const body = typeof r.data === 'string' ? r.data.slice(0, 300) : JSON.stringify(r.data).slice(0, 300);
        throw new Error(`allinone ${r.status} ${url}: ${body}`);
      }
      const shape = r.data && typeof r.data === 'object'
        ? Object.fromEntries(Object.keys(r.data).map(k => [k, Array.isArray(r.data[k]) ? r.data[k].length : typeof r.data[k]]))
        : { _type: typeof r.data };
      console.log(`${tag} attempt=${attempt + 1} ✓ ${ms}ms shape=${JSON.stringify(shape)}`);
      return r.data;
    } catch (err) {
      const ms = Date.now() - t0;
      if (attempt < ALLINONE_RETRIES) {
        const delay = (attempt + 1) * 200;
        console.log(`${tag} attempt=${attempt + 1} ✗ ${ms}ms — retrying in ${delay}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.log(`${tag} attempt=${attempt + 1} ✗ ${ms}ms — giving up: ${err.message}`);
      throw err;
    }
  }
}

async function fetchAllInOne(auth, deviceIds, from, to, types) {
  const deviceChunks = [];
  for (let i = 0; i < deviceIds.length; i += ALLINONE_CHUNK) {
    deviceChunks.push(deviceIds.slice(i, i + ALLINONE_CHUNK));
  }
  const dateWindows = splitDateRange(from, to, ALLINONE_DATE_CHUNK_DAYS);
  const tasks = [];
  for (let di = 0; di < deviceChunks.length; di++) {
    for (let wi = 0; wi < dateWindows.length; wi++) {
      tasks.push({
        deviceChunk: deviceChunks[di],
        window: dateWindows[wi],
        label: `${di + 1}/${deviceChunks.length}|${wi + 1}/${dateWindows.length}`,
      });
    }
  }
  console.log(`[allinone] plan: ${deviceIds.length} devices × ${dateWindows.length} date-windows (${ALLINONE_DATE_CHUNK_DAYS}d) → ${deviceChunks.length} device-chunks of ≤${ALLINONE_CHUNK} → ${tasks.length} calls, ${ALLINONE_PARALLEL} in parallel, types=${types.join("+")}`);
  const planT0 = Date.now();
  const merged = {};
  const totalBatches = Math.ceil(tasks.length / ALLINONE_PARALLEL);
  for (let i = 0; i < tasks.length; i += ALLINONE_PARALLEL) {
    const batch = tasks.slice(i, i + ALLINONE_PARALLEL);
    const batchT0 = Date.now();
    const batchNum = Math.floor(i / ALLINONE_PARALLEL) + 1;
    console.log(`[allinone] batch ${batchNum}/${totalBatches} → ${batch.length} calls starting`);
    const results = await Promise.all(
      batch.map(t => fetchAllInOneChunk(auth, t.deviceChunk, t.window.from, t.window.to, types, t.label))
    );
    console.log(`[allinone] batch ${batchNum}/${totalBatches} ✓ ${Date.now() - batchT0}ms`);
    for (const r of results) {
      for (const key of Object.keys(r)) {
        if (Array.isArray(r[key])) {
          if (!merged[key]) merged[key] = [];
          merged[key].push(...r[key]);
        }
      }
    }
  }
  const mergedShape = Object.fromEntries(Object.keys(merged).map(k => [k, merged[k].length]));
  console.log(`[allinone] all calls done in ${Date.now() - planT0}ms — merged=${JSON.stringify(mergedShape)}`);
  return merged;
}

/* =========================
   KPIs helpers
========================= */
function groupBy(arr, field) {
  const map = new Map();
  for (const item of asArr(arr)) {
    const key = Number(item?.[field]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
async function fetchTripsForDevices(auth, deviceIds, from, to) {
  const data = await fetchAllInOne(auth, deviceIds, from, to, ["trips"]);
  return groupBy(data?.trips, "deviceId");
}
async function fetchSummaryForDevices(auth, deviceIds, from, to) {
  const data = await fetchAllInOne(auth, deviceIds, from, to, ["summary"]);
  return groupBy(data?.summary, "deviceId");
}

/* =========================
   Unified dashboard endpoint
========================= */
app.post("/api/reports/dashboard", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const t0 = Date.now();
    const timed = (label, promise) => promise.then(r => { console.log(`[dashboard] ${label} done in ${Date.now() - t0}ms`); return r; });

    // Fetch trips+summary and maintenance in parallel (events fetched separately by the frontend)
    const [allInOne, maintLists] = await Promise.all([
      timed("allinone(trips+summary)", fetchAllInOne(auth, deviceIds, from, to, ["trips", "summary"])),
      timed(`maint(${deviceIds.length} devices)`, runPool(deviceIds, CONCURRENCY, async (id) => [id, await getMaint(auth, id)])),
    ]);
    const allInOneShape = allInOne && typeof allInOne === 'object'
      ? Object.fromEntries(Object.keys(allInOne).map(k => [k, Array.isArray(allInOne[k]) ? allInOne[k].length : typeof allInOne[k]]))
      : { _type: typeof allInOne };
    console.log(`[dashboard] allinone shape: ${JSON.stringify(allInOneShape)} | range from=${from} to=${to}`);
    console.log(`[dashboard] all fetches done in ${Date.now() - t0}ms`);

    const tripsByDevice = groupBy(allInOne?.trips, "deviceId");
    const summaryByDevice = groupBy(allInOne?.summary, "deviceId");

    // ---- average-speed ----
    const allTrips = [];
    const tripsUsed = new Set();
    for (const [id, trips] of tripsByDevice) {
      tripsUsed.add(id);
      allTrips.push(...trips);
    }
    const speedValues = allTrips.map(item => Math.round(item.averageSpeed * 1.85200) * (item.distance / 1000));
    const totalTripKms = allTrips.reduce((a, b) => a + (b.distance / 1000), 0);
    const averageSpeed = totalTripKms > 0 ? Math.round(speedValues.reduce((a, b) => a + b, 0) / totalTripKms) : 0;

    // ---- max-speed ----
    let maxSpeed = 0, maxSpeedMeta = null;
    for (const [id, trips] of tripsByDevice) {
      for (const t of trips) {
        const v = Number(t?.maxSpeed);
        if (Number.isFinite(v) && v > maxSpeed) {
          maxSpeed = v;
          maxSpeedMeta = { deviceId: t?.deviceId ?? id, deviceName: t?.deviceName ?? String(id), startTime: t?.startTime || null, endTime: t?.endTime || null };
        }
      }
    }

    // ---- avg-fuel + perDevice ----
    const clamp = (x) => { const v = Number(x); if (!Number.isFinite(v)) return null; return v < 0 ? 0 : v; };
    let totalFuel = 0, totalFuelDist = 0;
    const fuelPerDevice = [];
    for (const [id, summaries] of summaryByDevice) {
      let devFuel = 0, devDist = 0;
      for (const s of summaries) {
        const fuel = clamp(s?.spentFuel);
        const distance = clamp(s?.distance);
        if (fuel !== null && distance !== null) { totalFuel += fuel; totalFuelDist += distance; devFuel += fuel; devDist += distance; }
      }
      const devDistKm = devDist / 1000;
      fuelPerDevice.push({ deviceId: id, totalFuel: devFuel, totalDistanceKm: devDistKm, avgConsumption: devDistKm > 0 ? (devFuel * 100) / devDistKm : 0 });
    }
    const fuelDistKm = totalFuelDist / 1000;
    const avgConsumption = fuelDistKm > 0 ? (totalFuel * 100) / fuelDistKm : 0;

    // ---- active-devices ----
    const activeSet = new Set();
    for (const [id, trips] of tripsByDevice) if (trips.length > 0) activeSet.add(id);

    // ---- total-distance ----
    let totalDistance = 0;
    for (const [, summaries] of summaryByDevice) {
      for (const s of summaries) {
        const d = Number(s?.distance);
        if (Number.isFinite(d) && d > 0) totalDistance += d;
      }
    }

    // ---- maintenance-efficiency ----
    let maintTotal = 0, maintOk = 0;
    for (const [, maints] of maintLists) {
      maintTotal++;
      const overdue = Array.isArray(maints) ? maints.some((m) => Number(m?.attributes?.due) <= 0) : false;
      if (!overdue) maintOk++;
    }
    const efficiency = maintTotal > 0 ? (maintOk / maintTotal) * 100 : 0;

    console.log(`[dashboard] compute done in ${Date.now() - t0}ms | ${deviceIds.length} devices`);

    res.json({
      ok: true,
      averageSpeed: { averageSpeed },
      maxSpeed: { maxSpeed: maxSpeed * 1.852, meta: maxSpeedMeta },
      avgFuel: { avgConsumption, totalFuel, totalDistanceKm: fuelDistKm, perDevice: fuelPerDevice },
      activeDevices: { count: activeSet.size, activeDeviceIds: Array.from(activeSet) },
      totalDistance: { totalKm: totalDistance / 1000 },
      maintenance: { efficiency },
    });
  } catch (e) {
    console.error(`[dashboard] error:`, e.message);
    res.status(500).json({ ok: false, error: "dashboard_failed", detail: e.message });
  }
});

app.post("/api/reports/average-speed", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    const allTrips = [];
    const used = new Set();
    for (const [id, trips] of tripsByDevice) {
      used.add(id);
      allTrips.push(...trips);
    }
    const values = allTrips.map(item => Math.round(item.averageSpeed * 1.85200) * (item.distance/1000));
    const totalKms = allTrips.reduce((a, b) => a + (b.distance/1000), 0);
    const averageSpeed = totalKms > 0 ? Math.round((values.reduce((a, b) => a + b, 0)) / totalKms) : 0;
    res.json({ ok: true, averageSpeed, summaryCount: allTrips.length, devicesCountUsed: used.size });
  } catch (e) {
    console.error(`[average-speed] error:`, e.message);
    res.status(500).json({ ok: false, error: "max_speed_failed", detail: e.message });
  }
});

app.post("/api/reports/max-speed", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    let maxSpeed = 0, meta = null, tripsCount = 0, used = new Set();
    for (const [id, trips] of tripsByDevice) {
      used.add(id);
      for (const t of trips) {
        const v = Number(t?.maxSpeed);
        if (Number.isFinite(v)) {
          tripsCount++;
          if (v > maxSpeed) {
            maxSpeed = v;
            meta = {
              deviceId: t?.deviceId ?? id,
              deviceName: t?.deviceName ?? String(id),
              startTime: t?.startTime || null,
              endTime: t?.endTime || null,
            };
          }
        }
      }
    }
    res.json({ ok: true, maxSpeed: maxSpeed*1.852, tripsCount, devicesCountUsed: used.size, meta });
  } catch (e) {
    console.error(`[max-speed] error:`, e.message);
    res.status(500).json({ ok: false, error: "max_speed_failed", detail: e.message });
  }
});

app.post("/api/reports/avg-fuel", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const summaryByDevice = await fetchSummaryForDevices(auth, deviceIds, from, to);
    let totalFuel = 0, totalDistance = 0, summaryCount = 0, used = new Set();
    const perDevice = [];
    const clamp = (x) => {
      const v = Number(x);
      if (!Number.isFinite(v)) return null;
      return v < 0 ? 0 : v;
    };
    for (const [id, summaries] of summaryByDevice) {
      let devFuel = 0, devDist = 0;
      if (summaries.length) used.add(id);
      for (const s of summaries) {
        const fuel = clamp(s?.spentFuel);
        const distance = clamp(s?.distance);
        if (fuel !== null && distance !== null) {
          totalFuel += fuel;
          totalDistance += distance;
          devFuel += fuel;
          devDist += distance;
          summaryCount++;
        }
      }
      const devDistKm = devDist / 1000;
      perDevice.push({ deviceId: id, totalFuel: devFuel, totalDistanceKm: devDistKm, avgConsumption: devDistKm > 0 ? (devFuel * 100) / devDistKm : 0 });
    }
    // Calculate L/100km: (totalFuel * 100) / (totalDistance / 1000)
    const distanceKm = totalDistance / 1000;
    const avgConsumption = distanceKm > 0 ? (totalFuel * 100) / distanceKm : 0;
    res.json({ ok: true, avgConsumption, totalFuel, totalDistanceKm: distanceKm, summaryCount, devicesCountUsed: used.size, perDevice });
  } catch (e) {
    console.error(`[avg-fuel] error:`, e.message);
    res.status(500).json({ ok: false, error: "avg_fuel_failed", detail: e.message });
  }
});

app.post("/api/reports/active-devices", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    const activeSet = new Set();
    for (const [id, trips] of tripsByDevice) if (trips.length > 0) activeSet.add(id);
    res.json({ ok: true, activeDeviceIds: Array.from(activeSet), count: activeSet.size });
  } catch (e) {
    console.error(`[active-devices] error:`, e.message);
    res.status(500).json({ ok: false, error: "active_devices_failed", detail: e.message });
  }
});

/* =========================
   Vehicle alerts (PinMe)
========================= */
app.post("/api/reports/vehicle-alerts", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const geofences = await getGeofences(auth);
    const geofenceMap = new Map();
    for (const g of asArr(geofences)) {
      const id = Number(g?.id);
      const name = g?.name || `geofence:${id}`;
      if (Number.isFinite(id)) geofenceMap.set(id, String(name));
    }

    const stateLabel = (s) => (s === "en_service" ? "En service" : s === "arret" ? "Arrêt" : s === "idle" ? "Idle" : "Hors service");
    const inferStateFromEvent = (ev) => {
      const t = (ev?.type || "").toLowerCase();
      if (t === "ignitionon") return "en_service";
      if (t === "ignitionoff") return "arret";
      if (t === "alarm") {
        const al = (ev?.attributes?.alarm || "").toLowerCase();
        if (al.includes("idle")) return "idle";
      }
      return null;
    };

    const rows = [];
    const lists = await runPool(deviceIds, CONCURRENCY, async (id) => [id, await getEventsSplit(auth, id, from, to)]);
    for (const [id, arr0] of lists) {
      const arr = arr0.slice().sort((a, b) => (Date.parse(a?.serverTime) || 0) - (Date.parse(b?.serverTime) || 0));
      const alertsMap = new Map();
      const geosSet = new Set();
      let alertOccurrences = 0;
      let lastState = null;
      let lastTs = 0;

      for (const ev of arr) {
        const evTime = ev?.serverTime || null;
        if (ev?.type && ev.type !== "alarm") {
          const lbl = String(ev.type);
          if (!alertsMap.has(lbl) || evTime > alertsMap.get(lbl)) alertsMap.set(lbl, evTime);
          alertOccurrences += 1;
        }
        if (ev?.type === "alarm" && ev?.attributes?.alarm) {
          const lbl = String(ev.attributes.alarm);
          if (!alertsMap.has(lbl) || evTime > alertsMap.get(lbl)) alertsMap.set(lbl, evTime);
        }
        if (ev?.type === "alarm") alertOccurrences += 1;
        const gid = Number(ev?.geofenceId);
        if (Number.isFinite(gid) && gid > 0) geosSet.add(geofenceMap.get(gid) || `geofence:${gid}`);

        const st = inferStateFromEvent(ev);
        const ts = Date.parse(ev?.serverTime) || 0;
        if (st && ts >= lastTs) { lastState = st; lastTs = ts; }
      }
      if (!lastState) lastState = arr.length ? "en_service" : "hors_service";

      const alertEntries = Array.from(alertsMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, time]) => ({ label, time }));

      rows.push({
        deviceId: id,
        alerts: alertEntries.map(e => e.label),
        alertTimes: Object.fromEntries(alertEntries.map(e => [e.label, e.time])),
        geofences: Array.from(geosSet).sort((a, b) => a.localeCompare(b)),
        alertCount: alertOccurrences,
        geofenceCount: geosSet.size,
        state: lastState,
        stateLabel: stateLabel(lastState),
      });
    }
    res.json({ ok: true, rows, count: rows.length });
  } catch (e) {
    console.error(`[vehicle-alerts] error:`, e.message);
    res.status(500).json({ ok: false, error: "vehicle_alerts_failed", detail: e.message });
  }
});

/* =========================================================
   PERSISTENCE PinMe (/attributes/computed)
========================================================= */
function adminAuthHeader() {
  const h = makeBasicHeader(ADMIN_USER, ADMIN_PASS);
  if (!h) throw new Error("admin_credentials_missing");
  return h;
}
function keyForCompany(company) {
  return `fleet.alerts.state.${String(company || "default").toLowerCase()}`;
}
async function loadCompanyState(company) {
  const key = keyForCompany(company);
  const auth = adminAuthHeader();

  const list = await upstreamGet("/attributes/computed", { headers: { Cookie: auth }, params: { all: true } });
  if (list.status >= 400) throw new Error(`pinme_list_failed_${list.status}`);

  const found = asArr(list.data).find((a) => String(a?.attribute) === key);
  if (!found) return { id: null, state: {} };

  let parsed = {};
  try { parsed = JSON.parse(found.expression || "{}"); } catch {}
  return { id: Number(found.id), state: parsed || {} };
}
async function createCompanyState(company, initialObj = {}) {
  const key = keyForCompany(company);
  const auth = adminAuthHeader();
  const payload = { attribute: key, description: "Fleet Alerts State (shared by company)", expression: JSON.stringify(initialObj || {}) };
  const r = await upstreamPost("/attributes/computed", payload, { headers: { Cookie: auth } });
  if (r.status >= 400) throw new Error(`pinme_create_failed_${r.status}`);
  const id = Number(r.data?.id);
  return { id: Number.isFinite(id) ? id : null, state: initialObj || {} };
}
async function updateCompanyState(id, obj) {
  const auth = adminAuthHeader();
  const r = await upstreamPut(`/attributes/computed/${id}`, { expression: JSON.stringify(obj || {}) }, { headers: { Cookie: auth } });
  if (r.status >= 400) throw new Error(`pinme_update_failed_${r.status}`);
  return true;
}

app.post("/api/alerts/state/get", async (req, res) => {
  try {
    const { company: rawCompany, ids = [], username } = req.body || {};
    const company = rawCompany || companyFromUsername(username || "");
    if (!ADMIN_USER || !ADMIN_PASS) return res.status(403).json({ ok: false, error: "admin_required" });

    const { state } = await loadCompanyState(company);
    const out = {};
    const list = Array.isArray(ids) && ids.length ? ids : Object.keys(state || {});
    for (const id of list) out[id] = state[id];
    res.json({ ok: true, states: out, company });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/alerts/state/patch", async (req, res) => {
  try {
    const { company: rawCompany, patches = [], username } = req.body || {};
    const company = rawCompany || companyFromUsername(username || "");
    if (!ADMIN_USER || !ADMIN_PASS) return res.status(403).json({ ok: false, error: "admin_required" });

    let { id, state } = await loadCompanyState(company);
    if (!id) {
      const created = await createCompanyState(company, {});
      id = created.id;
      state = created.state;
    }
    if (!id) return res.status(500).json({ ok: false, error: "create_state_failed" });

    const now = new Date().toISOString();
    for (const p of asArr(patches)) {
      const aid = String(p?.id || "").trim();
      if (!aid) continue;
      const patch = p?.patch && typeof p.patch === "object" ? p.patch : {};
      const prev = state[aid] && typeof state[aid] === "object" ? state[aid] : {};

      state[aid] = {
        ...prev,
        ...patch,
        updatedAt: now,
        updatedBy: username || prev.updatedBy || null,
        takenBy: prev.takenBy || (patch.status === "in_progress" ? username || null : prev.takenBy || null),
        takenAt: prev.takenAt || (patch.status === "in_progress" ? now : prev.takenAt || null),
      };
    }

    await updateCompanyState(id, state);
    res.json({ ok: true, company, count: asArr(patches).length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* =========================================================
   PERSISTENCE EN BASE (PostgreSQL)
========================================================= */

// PATCH: upsert state + actions + add comments
app.post("/api/db/alerts/state/patch", async (req, res) => {
  const { company, patches = [], username } = req.body || {};
  if (!company) return res.status(400).json({ ok: false, error: "missing_company" });

  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    const now = new Date().toISOString();

    for (const p of Array.isArray(patches) ? patches : []) {
      const alertId = String(p?.id || "").trim();
      if (!alertId) continue;
      const patch = (p && p.patch) || {};

      const status = patch.status || null;
      const type = patch.type || null;
      const title = patch.title || null;
      const vehicle = patch.vehicle || null;
      const driver = patch.driver || null;
      const location = patch.location || null;
      const takenBy = status === "in_progress" ? (username || null) : null;
      const takenAt = status === "in_progress" ? now : null;

      await client.query(
        `
        INSERT INTO alerts.alert_states (company, alert_id, status, type, title, vehicle, driver, location, taken_by, taken_at, updated_at)
        VALUES ($1,$2, COALESCE($3,'new'), COALESCE($4,'success'), $5, $6, $7, $8, $9, $10, now())
        ON CONFLICT (company, alert_id)
        DO UPDATE SET
          status     = COALESCE(EXCLUDED.status,   alerts.alert_states.status),
          type       = COALESCE(EXCLUDED.type,     alerts.alert_states.type),
          title      = COALESCE(EXCLUDED.title,    alerts.alert_states.title),
          vehicle    = COALESCE(EXCLUDED.vehicle,   alerts.alert_states.vehicle),
          driver     = COALESCE(EXCLUDED.driver,    alerts.alert_states.driver),
          location   = COALESCE(EXCLUDED.location,  alerts.alert_states.location),
          taken_by   = COALESCE(alerts.alert_states.taken_by, EXCLUDED.taken_by),
          taken_at   = COALESCE(alerts.alert_states.taken_at, EXCLUDED.taken_at),
          updated_at = now()
        `,
        [company, alertId, status, type, title, vehicle, driver, location, takenBy, takenAt]
      );

      if (Array.isArray(patch.actionPlan)) {
        for (let i = 0; i < patch.actionPlan.length; i++) {
          const s = patch.actionPlan[i];
          if (!s || !s.id) continue;
          await client.query(
            `
            INSERT INTO alerts.alert_actions
              (company, alert_id, action_id, label, done, position, created_by, created_at, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
            ON CONFLICT (company, alert_id, action_id)
            DO UPDATE SET
              label      = EXCLUDED.label,
              done       = EXCLUDED.done,
              position   = EXCLUDED.position,
              updated_at = now()
            `,
            [
              company,
              alertId,
              String(s.id),
              String(s.label || ""),
              !!s.done,
              Number.isFinite(+s.position) ? +s.position : i,
              username || null,
            ]
          );
        }
      }

      if (Array.isArray(patch.comments)) {
        for (const c of patch.comments) {
          if (!c || !c.id) continue;
          await client.query(
            `
            INSERT INTO alerts.alert_comments
              (company, alert_id, comment_id, text, author, at_local, created_at)
            VALUES ($1,$2,$3,$4,$5,$6, now())
            ON CONFLICT (company, alert_id, comment_id) DO NOTHING
            `,
            [
              company,
              alertId,
              String(c.id),
              String(c.text || ""),
              c.author || username || null,
              c.date || c.at_local || null,
            ]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, company, count: patches.length });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[DB patch] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

// GET: assemblage states + actions + comments
app.post("/api/db/alerts/state/get", async (req, res) => {
  const { company, ids = [] } = req.body || {};
  if (!company) return res.status(400).json({ ok: false, error: "missing_company" });
  const list = Array.isArray(ids) ? ids.map(String) : [];

  try {
    const st = await pg.query(
      `SELECT company, alert_id, status, type, title, vehicle, driver, location, taken_by, taken_at, updated_at
       FROM alerts.alert_states
       WHERE company=$1 AND ($2::text[] IS NULL OR alert_id = ANY($2))`,
      [company, list.length ? list : null]
    );

    const ac = await pg.query(
      `SELECT company, alert_id, action_id, label, done, position
       FROM alerts.alert_actions
       WHERE company=$1 AND ($2::text[] IS NULL OR alert_id = ANY($2))
       ORDER BY position ASC, created_at ASC`,
      [company, list.length ? list : null]
    );

    const cm = await pg.query(
      `SELECT company, alert_id, comment_id, text, author, at_local, created_at
       FROM alerts.alert_comments
       WHERE company=$1 AND ($2::text[] IS NULL OR alert_id = ANY($2))
       ORDER BY created_at ASC`,
      [company, list.length ? list : null]
    );

    const out = {};
    for (const r of st.rows) {
      out[r.alert_id] = {
        status: r.status,
        type: r.type,
        title: r.title || null,
        vehicle: r.vehicle || null,
        driver: r.driver || null,
        location: r.location || null,
        takenBy: r.taken_by,
        takenAt: r.taken_at,
        updatedAt: r.updated_at,
        actionPlan: [],
        comments: [],
      };
    }
    for (const r of ac.rows) {
      if (!out[r.alert_id]) out[r.alert_id] = { actionPlan: [], comments: [] };
      out[r.alert_id].actionPlan.push({
        id: r.action_id,
        label: r.label,
        done: r.done,
        position: r.position,
      });
    }
    for (const r of cm.rows) {
      if (!out[r.alert_id]) out[r.alert_id] = { actionPlan: [], comments: [] };
      out[r.alert_id].comments.push({
        id: r.comment_id,
        text: r.text,
        author: r.author || "",
        date: r.at_local || new Date(r.created_at).toLocaleString(),
      });
    }

    res.json({ ok: true, states: out, company });
  } catch (e) {
    console.error("[DB get] error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* =========================================================
   ENDPOINTS DÉDIÉS : "en cours" & "traitées" (DB PostgreSQL)
========================================================= */

// Helpers dédiés
function getCompanyFromBody(body = {}) {
  const raw = body.company || companyFromUsername(body.username || "");
  return String(raw || "default").toLowerCase();
}
function normIds(arr) {
  return Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
}

/**
 * POST /api/db/alerts/in-progress
 * Body: { company?, username?, ids: string[], type? }
 */
app.post("/api/db/alerts/in-progress", async (req, res) => {
  const company = getCompanyFromBody(req.body);
  const username = req.body?.username || null;
  const ids = normIds(req.body?.ids);
  const type = req.body?.type || null;

  if (!company) return res.status(400).json({ ok: false, error: "missing_company" });
  if (!ids.length) return res.status(400).json({ ok: false, error: "no_ids" });

  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    const now = new Date().toISOString();

    for (const alertId of ids) {
      await client.query(
        `
        INSERT INTO alerts.alert_states
          (company, alert_id, status, type, taken_by, taken_at, updated_at)
        VALUES ($1,$2,'in_progress', COALESCE($3,'success'), $4, $5, now())
        ON CONFLICT (company, alert_id)
        DO UPDATE SET
          status     = 'in_progress',
          type       = COALESCE($3, alerts.alert_states.type),
          taken_by   = COALESCE(alerts.alert_states.taken_by, $4),
          taken_at   = COALESCE(alerts.alert_states.taken_at, $5),
          updated_at = now()
        `,
        [company, alertId, type, username, now]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, company, count: ids.length, status: "in_progress" });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/db/alerts/done
 * Body: { company?, username?, ids: string[], type? }
 *
 * ⚠️ IMPORTANT: on enregistre **resolved** (et plus done) pour coller à la DB existante.
 */
app.post("/api/db/alerts/done", async (req, res) => {
  const company = getCompanyFromBody(req.body);
  const username = req.body?.username || null;
  const ids = normIds(req.body?.ids);
  const type = req.body?.type || null;

  if (!company) return res.status(400).json({ ok: false, error: "missing_company" });
  if (!ids.length) return res.status(400).json({ ok: false, error: "no_ids" });

  const client = await pg.connect();
  try {
    await client.query("BEGIN");

    for (const alertId of ids) {
      await client.query(
        `
        INSERT INTO alerts.alert_states
          (company, alert_id, status, type, taken_by, taken_at, updated_at)
        VALUES ($1,$2,'resolved', COALESCE($3,'success'), $4, $5, now())
        ON CONFLICT (company, alert_id)
        DO UPDATE SET
          status     = 'resolved',
          type       = COALESCE($3, alerts.alert_states.type),
          taken_by   = COALESCE(alerts.alert_states.taken_by, $4),
          taken_at   = COALESCE(alerts.alert_states.taken_at, EXCLUDED.taken_at),
          updated_at = now()
        `,
        [company, alertId, type, username, null]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, company, count: ids.length, status: "resolved" });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/db/alerts/in-progress
 * Query: ?company=...&q=...&since=ISO&until=ISO&limit=50&offset=0
 */
app.get("/api/db/alerts/in-progress", async (req, res) => {
  try {
    const company =
      (req.query.company && String(req.query.company).toLowerCase()) || null;
    if (!company) return res.status(400).json({ ok: false, error: "missing_company" });

    const q = req.query.q ? `%${String(req.query.q)}%` : null;
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const until = req.query.until ? new Date(String(req.query.until)) : null;
    const limit = Math.min(Number(req.query.limit || 50), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const rows = await pg.query(
      `
      SELECT alert_id, status, type, taken_by, taken_at, updated_at
      FROM alerts.alert_states
      WHERE company = $1
        AND status = 'in_progress'
        AND ($2::timestamp IS NULL OR updated_at >= $2)
        AND ($3::timestamp IS NULL OR updated_at <= $3)
        AND ($4::text IS NULL OR alert_id ILIKE $4)
      ORDER BY updated_at DESC
      LIMIT $5 OFFSET $6
      `,
      [company, since, until, q, limit, offset]
    );

    res.json({ ok: true, company, rows: rows.rows, count: rows.rowCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/db/alerts/done
 * Query: ?company=...&q=...&since=ISO&until=ISO&limit=50&offset=0
 *
 * ⚠️ IMPORTANT: on retourne les lignes en `resolved`
 * (et on accepte aussi `done` pour compatibilité ascendante).
 */
app.get("/api/db/alerts/done", async (req, res) => {
  try {
    const company =
      (req.query.company && String(req.query.company).toLowerCase()) || null;
    if (!company) return res.status(400).json({ ok: false, error: "missing_company" });

    const q = req.query.q ? `%${String(req.query.q)}%` : null;
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const until = req.query.until ? new Date(String(req.query.until)) : null;
    const limit = Math.min(Number(req.query.limit || 50), 500);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const rows = await pg.query(
      `
      SELECT alert_id, status, type, taken_by, taken_at, updated_at
      FROM alerts.alert_states
      WHERE company = $1
        AND status IN ('resolved','done')
        AND ($2::timestamp IS NULL OR updated_at >= $2)
        AND ($3::timestamp IS NULL OR updated_at <= $3)
        AND ($4::text IS NULL OR alert_id ILIKE $4)
      ORDER BY updated_at DESC
      LIMIT $5 OFFSET $6
      `,
      [company, since, until, q, limit, offset]
    );

    res.json({ ok: true, company, rows: rows.rows, count: rows.rowCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.post("/api/reports/total-distance", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const summaryByDevice = await fetchSummaryForDevices(auth, deviceIds, from, to);
    let totalDistance = 0, summaryCount = 0, used = new Set();

    for (const [id, summaries] of summaryByDevice) {
      if (summaries.length) used.add(id);
      for (const s of summaries) {
        const distance = Number(s?.distance);
        if (Number.isFinite(distance) && distance > 0) {
          totalDistance += distance;
          summaryCount++;
        }
      }
    }
    const totalKm = totalDistance / 1000;
    res.json({ ok: true, totalKm: Math.max(0, totalKm), summaryCount, devicesCountUsed: used.size });
  } catch (e) {
    console.error(`[total-distance] error:`, e.message);
    res.status(500).json({ ok: false, error: "total_distance_failed", detail: e.message });
  }
});
app.post("/api/reports/maintenance-efficiency", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const lists = await runPool(deviceIds, CONCURRENCY, async (id) => [id, await getMaint(auth, id)]);
    let total = 0, ok = 0;

    for (const [, maints] of lists) {
      total++;
      const overdue = Array.isArray(maints)
        ? maints.some((m) => Number(m?.attributes?.due) <= 0)
        : false;
      if (!overdue) ok++;
    }

    const efficiency = total > 0 ? (ok / total) * 100 : 0;
    res.json({ ok: true, efficiency, total });
  } catch (e) {
    console.error(`[maintenance-efficiency] error:`, e.message);
    res.status(500).json({ ok: false, error: "maint_eff_failed", detail: e.message });
  }
});


/* =========================
   Reports: trips list + per-vehicle summary
========================= */
app.post("/api/reports/trips-list", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });
  try {
    const devs = await getDevices(auth);
    const nameById = new Map();
    for (const d of devs) nameById.set(Number(d.id), d.name || String(d.id));

    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    const trips = [];
    for (const [id, deviceTrips] of tripsByDevice) {
      const name = nameById.get(Number(id)) || String(id);
      for (const t of asArr(deviceTrips)) {
        trips.push({
          deviceId: id,
          deviceName: t.deviceName || name,
          startTime: t.startTime || null,
          endTime: t.endTime || null,
          startAddress: t.startAddress || null,
          endAddress: t.endAddress || null,
          distanceKm: Number(((t.distance || 0) / 1000).toFixed(2)),
          durationMin: Math.round((t.duration || 0) / 60000),
          avgSpeedKmh: Math.round((t.averageSpeed || 0) * 1.852),
          maxSpeedKmh: Math.round((t.maxSpeed || 0) * 1.852),
          spentFuel: Number((t.spentFuel || 0).toFixed(2)),
        });
      }
    }
    trips.sort((a, b) => ((b.startTime || "") > (a.startTime || "") ? 1 : -1));
    res.json({ ok: true, trips, count: trips.length });
  } catch (e) {
    console.error(`[trips-list] error:`, e.message);
    res.status(500).json({ ok: false, error: "trips_list_failed", detail: e.message });
  }
});

app.post("/api/reports/per-vehicle", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });
  try {
    const devs = await getDevices(auth);
    const deviceMap = new Map();
    for (const d of devs) deviceMap.set(Number(d.id), d);

    const [summaryByDevice, tripsByDevice] = await Promise.all([
      fetchSummaryForDevices(auth, deviceIds, from, to),
      fetchTripsForDevices(auth, deviceIds, from, to),
    ]);

    const rows = deviceIds.map((id) => {
      const dev = deviceMap.get(Number(id));
      const name = dev?.name || String(id);
      const summaries = asArr(summaryByDevice.get(id));
      const trips = asArr(tripsByDevice.get(id));
      let totalDistanceM = 0, totalFuel = 0;
      for (const s of summaries) {
        totalDistanceM += Number(s?.distance) || 0;
        totalFuel += Number(s?.spentFuel) || 0;
      }
      const distanceKm = totalDistanceM / 1000;
      const avgConsumption = distanceKm > 0 ? (totalFuel * 100) / distanceKm : 0;
      return {
        deviceId: id,
        name,
        distanceKm: Number(distanceKm.toFixed(1)),
        totalFuel: Number(totalFuel.toFixed(2)),
        avgConsumption: Number(avgConsumption.toFixed(1)),
        tripCount: trips.length,
      };
    });

    res.json({ ok: true, rows });
  } catch (e) {
    console.error(`[per-vehicle] error:`, e.message);
    res.status(500).json({ ok: false, error: "per_vehicle_failed", detail: e.message });
  }
});

/* =========================
   Static
========================= */
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   Start (HTTP + optional HTTPS)
========================= */
const SSL_CERT = process.env.SSL_CERT || "/etc/letsencrypt/live/hetzner.moviflotte.com/fullchain.pem";
const SSL_KEY = process.env.SSL_KEY || "/etc/letsencrypt/live/hetzner.moviflotte.com/privkey.pem";

console.log(`[config] ALLINONE_CHUNK=${ALLINONE_CHUNK} ALLINONE_PARALLEL=${ALLINONE_PARALLEL} ALLINONE_RETRIES=${ALLINONE_RETRIES} ALLINONE_DATE_CHUNK_DAYS=${ALLINONE_DATE_CHUNK_DAYS} UPSTREAM_CONCURRENCY=${CONCURRENCY} UPSTREAM_TIMEOUT_MS=${UPSTREAM_TIMEOUT_MS}`);

app.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});

if (fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)) {
  const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);
  https.createServer({
    cert: fs.readFileSync(SSL_CERT),
    key: fs.readFileSync(SSL_KEY),
  }, app).listen(HTTPS_PORT, () => {
    console.log(`HTTPS server running on https://localhost:${HTTPS_PORT}`);
  });
}
