// server.js  (ESM)

import dotenv from "dotenv";
dotenv.config(); // IMPORTANT: avant toute lecture de process.env

import express from "express";
import axios from "axios";
import http from "http";
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
   Axios upstream (PinMe)
========================= */
const upstream = axios.create({
  baseURL: BASE,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 64 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 64 }),
  decompress: true,
  validateStatus: () => true,   // never throw on HTTP status — each fetcher checks r.status
});

/* =========================
   Upstream interceptors
========================= */
upstream.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error(`[upstream ✗] ${err.config?.url} — ${err.message}`);
    return Promise.reject(err);
  }
);

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
  const r = await upstream.get("/devices", { headers: { Cookie: auth } });
  if (r.status >= 400) throw new Error(`devices ${r.status}`);
  return asArr(r.data);
}
async function getGroups(auth) {
  const r = await upstream.get("/groups", { headers: { Cookie: auth }, params: { all: true } });
  if (r.status >= 400) throw new Error(`groups ${r.status}`);
  return asArr(r.data);
}
async function getNotifications(auth) {
  const r = await upstream.get("/notifications", { headers: { Cookie: auth }, params: { all: true } });
  if (r.status >= 400) return [];
  return asArr(r.data);
}
async function getGeofences(auth) {
  const r = await upstream.get("/geofences", { headers: { Cookie: auth }, params: { all: true } });
  if (r.status >= 400) return [];
  return asArr(r.data);
}
async function getEvents(auth, deviceId, from, to) {
  const r = await upstream.get("/reports/events", { headers: { Cookie: auth }, params: { deviceId, from, to } });
  if (r.status >= 400) return [];
  return asArr(r.data);
}
async function getMaint(auth, deviceId) {
  const r = await upstream.get("/maintenance", { headers: { Cookie: auth }, params: { deviceId } });
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
    const r = await upstream.get(TEST_PATH, { headers: { Cookie: auth }, params: { all: true } });
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
const ALLINONE_CHUNK = Number(process.env.ALLINONE_CHUNK || 10);
const ALLINONE_RETRIES = 2;

async function fetchAllInOneChunk(auth, deviceIds, from, to, types) {
  const params = new URLSearchParams();
  for (const id of deviceIds) params.append("deviceId", String(id));
  for (const t of types) params.append("type", t);
  params.append("from", from);
  params.append("to", to);
  const url = "/reports/allinone?" + params.toString();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await upstream.get(url, {
        headers: { Cookie: auth },
        maxRedirects: 5,
      });
      if (r.status >= 400) {
        const body = typeof r.data === 'string' ? r.data.slice(0, 300) : JSON.stringify(r.data).slice(0, 300);
        throw new Error(`allinone ${r.status}: ${body}`);
      }
      return r.data;
    } catch (err) {
      if (attempt < ALLINONE_RETRIES) {
        console.log(`[allinone] attempt ${attempt + 1} failed, retrying in ${(attempt + 1) * 500}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 500));
        continue;
      }
      throw err;
    }
  }
}

async function fetchAllInOne(auth, deviceIds, from, to, types) {
  if (deviceIds.length <= ALLINONE_CHUNK) {
    return fetchAllInOneChunk(auth, deviceIds, from, to, types);
  }
  // Split into chunks and fetch sequentially to avoid overwhelming upstream
  const chunks = [];
  for (let i = 0; i < deviceIds.length; i += ALLINONE_CHUNK) {
    chunks.push(deviceIds.slice(i, i + ALLINONE_CHUNK));
  }
  const merged = {};
  for (const chunk of chunks) {
    const r = await fetchAllInOneChunk(auth, chunk, from, to, types);
    for (const key of Object.keys(r)) {
      if (Array.isArray(r[key])) {
        if (!merged[key]) merged[key] = [];
        merged[key].push(...r[key]);
      }
    }
  }
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

    // Fetch all upstream data in parallel: trips+summary+events (one allinone call),
    // maintenance (per device), notifications, geofences
    const [allInOne, maintLists, notifs, geofences] = await Promise.all([
      timed("allinone(trips+summary+events)", fetchAllInOne(auth, deviceIds, from, to, ["trips", "summary", "events"])),
      timed(`maint(${deviceIds.length} devices)`, runPool(deviceIds, CONCURRENCY, async (id) => [id, await getMaint(auth, id)])),
      timed("notifications", getNotifications(auth)),
      timed("geofences", getGeofences(auth)),
    ]);
    console.log(`[dashboard] all fetches done in ${Date.now() - t0}ms`);

    const tripsByDevice = groupBy(allInOne?.trips, "deviceId");
    const summaryByDevice = groupBy(allInOne?.summary, "deviceId");
    const eventsByDevice = groupBy(allInOne?.events, "deviceId");

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

    // ---- vehicle-alerts ----
    const notifMap = new Map();
    for (const n of asArr(notifs)) {
      const id = Number(n?.id);
      const label = n?.attributes?.name || n?.attributes?.alarms || n?.type || `notif:${id}`;
      if (Number.isFinite(id)) notifMap.set(id, String(label));
    }
    const geofenceMap = new Map();
    for (const g of asArr(geofences)) {
      const id = Number(g?.id);
      const name = g?.name || `geofence:${id}`;
      if (Number.isFinite(id)) geofenceMap.set(id, String(name));
    }
    const parseNotifIds = (v) => (v ? String(v).split(/[,\s]+/).map(Number).filter(Number.isFinite) : []);
    const stateLabel = (s) => (s === "en_service" ? "En service" : s === "arret" ? "Arrêt" : s === "idle" ? "Idle" : "Hors service");
    const inferStateFromEvent = (ev) => {
      const t = (ev?.type || "").toLowerCase();
      if (t === "ignitionon") return "en_service";
      if (t === "ignitionoff") return "arret";
      if (t === "alarm") { const al = (ev?.attributes?.alarm || "").toLowerCase(); if (al.includes("idle")) return "idle"; }
      const nids = parseNotifIds(ev?.attributes?.notifications || ev?.attributes?.notificationId);
      for (const nid of nids) {
        const lbl = (notifMap.get(nid) || "").toLowerCase();
        if (lbl.includes("idle")) return "idle";
        if (lbl.includes("engineoff") || lbl.includes("engine off") || lbl.includes("arrêt") || lbl.includes("arret")) return "arret";
      }
      return null;
    };
    const alertRows = [];
    for (const [id, arr0] of eventsByDevice) {
      const arr = arr0.slice().sort((a, b) => (Date.parse(a?.serverTime) || 0) - (Date.parse(b?.serverTime) || 0));
      const alertsMap = new Map();
      const geosSet = new Set();
      let alertOccurrences = 0, lastState = null, lastTs = 0;
      for (const ev of arr) {
        const evTime = ev?.serverTime || null;
        if (ev?.type && ev.type !== "alarm") { const lbl = String(ev.type); if (!alertsMap.has(lbl) || evTime > alertsMap.get(lbl)) alertsMap.set(lbl, evTime); alertOccurrences += 1; }
        if (ev?.type === "alarm" && ev?.attributes?.alarm) { const lbl = String(ev.attributes.alarm); if (!alertsMap.has(lbl) || evTime > alertsMap.get(lbl)) alertsMap.set(lbl, evTime); }
        const nids = parseNotifIds(ev?.attributes?.notifications || ev?.attributes?.notificationId);
        nids.forEach((nid) => { const lbl = notifMap.get(nid) || `notif:${nid}`; if (!alertsMap.has(lbl) || evTime > alertsMap.get(lbl)) alertsMap.set(lbl, evTime); });
        if (ev?.type === "alarm") alertOccurrences += nids.length > 0 ? nids.length : 1;
        const gid = Number(ev?.geofenceId);
        if (Number.isFinite(gid) && gid > 0) geosSet.add(geofenceMap.get(gid) || `geofence:${gid}`);
        const st = inferStateFromEvent(ev);
        const ts = Date.parse(ev?.serverTime) || 0;
        if (st && ts >= lastTs) { lastState = st; lastTs = ts; }
      }
      if (!lastState) lastState = arr.length ? "en_service" : "hors_service";
      const alertEntries = Array.from(alertsMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, time]) => ({ label, time }));
      alertRows.push({ deviceId: id, alerts: alertEntries.map(e => e.label), alertTimes: Object.fromEntries(alertEntries.map(e => [e.label, e.time])), geofences: Array.from(geosSet).sort((a, b) => a.localeCompare(b)), alertCount: alertOccurrences, geofenceCount: geosSet.size, state: lastState, stateLabel: stateLabel(lastState) });
    }

    console.log(`[dashboard] compute done in ${Date.now() - t0}ms | ${deviceIds.length} devices`);

    res.json({
      ok: true,
      averageSpeed: { averageSpeed },
      maxSpeed: { maxSpeed: maxSpeed * 1.852, meta: maxSpeedMeta },
      avgFuel: { avgConsumption, totalFuel, totalDistanceKm: fuelDistKm, perDevice: fuelPerDevice },
      activeDevices: { count: activeSet.size, activeDeviceIds: Array.from(activeSet) },
      totalDistance: { totalKm: totalDistance / 1000 },
      maintenance: { efficiency },
      vehicleAlerts: { rows: alertRows, count: alertRows.length },
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
    const [notifs, geofences] = await Promise.all([getNotifications(auth), getGeofences(auth)]);
    const notifMap = new Map();
    for (const n of asArr(notifs)) {
      const id = Number(n?.id);
      const label = n?.attributes?.name || n?.attributes?.alarms || n?.type || `notif:${id}`;
      if (Number.isFinite(id)) notifMap.set(id, String(label));
    }
    const geofenceMap = new Map();
    for (const g of asArr(geofences)) {
      const id = Number(g?.id);
      const name = g?.name || `geofence:${id}`;
      if (Number.isFinite(id)) geofenceMap.set(id, String(name));
    }

    const parseNotifIds = (v) => (v ? String(v).split(/[,\s]+/).map(Number).filter(Number.isFinite) : []);
    const stateLabel = (s) => (s === "en_service" ? "En service" : s === "arret" ? "Arrêt" : s === "idle" ? "Idle" : "Hors service");
    const inferStateFromEvent = (ev) => {
      const t = (ev?.type || "").toLowerCase();
      if (t === "ignitionon") return "en_service";
      if (t === "ignitionoff") return "arret";
      if (t === "alarm") {
        const al = (ev?.attributes?.alarm || "").toLowerCase();
        if (al.includes("idle")) return "idle";
      }
      const ids = parseNotifIds(ev?.attributes?.notifications || ev?.attributes?.notificationId);
      for (const id of ids) {
        const lbl = (notifMap.get(id) || "").toLowerCase();
        if (lbl.includes("idle")) return "idle";
        if (lbl.includes("engineoff") || lbl.includes("engine off") || lbl.includes("arrêt") || lbl.includes("arret")) return "arret";
      }
      return null;
    };

    const rows = [];
    const lists = await runPool(deviceIds, CONCURRENCY, async (id) => [id, await getEvents(auth, id, from, to)]);
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
        const ids = parseNotifIds(ev?.attributes?.notifications || ev?.attributes?.notificationId);
        ids.forEach((nid) => {
          const lbl = notifMap.get(nid) || `notif:${nid}`;
          if (!alertsMap.has(lbl) || evTime > alertsMap.get(lbl)) alertsMap.set(lbl, evTime);
        });
        if (ev?.type === "alarm") alertOccurrences += ids.length > 0 ? ids.length : 1;
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

  const list = await upstream.get("/attributes/computed", { headers: { Cookie: auth }, params: { all: true } });
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
  const r = await upstream.post("/attributes/computed", payload, { headers: { Cookie: auth } });
  if (r.status >= 400) throw new Error(`pinme_create_failed_${r.status}`);
  const id = Number(r.data?.id);
  return { id: Number.isFinite(id) ? id : null, state: initialObj || {} };
}
async function updateCompanyState(id, obj) {
  const auth = adminAuthHeader();
  const r = await upstream.put(`/attributes/computed/${id}`, { expression: JSON.stringify(obj || {}) }, { headers: { Cookie: auth } });
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
