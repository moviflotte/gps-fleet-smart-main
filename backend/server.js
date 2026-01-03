// server.js  (ESM)

import dotenv from "dotenv";
dotenv.config(); // IMPORTANT: avant toute lecture de process.env

import express from "express";
import axios from "axios";
import http from "http";
import https from "https";
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
  timeout: 30000,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 64 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 64 }),
  decompress: true,
  validateStatus: (s) => s >= 200 && s < 500,
});

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
   Tiny cache + pool concur.
========================= */
const cache = new Map();
const DEFAULT_TTL = {
  trips: 60_000,
  events: 45_000,
  maint: 120_000,
  meta: 5 * 60_000,
};
const cacheKey = (...parts) => parts.join("|");
async function memo(key, ttl, fetcher) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.value && hit.expire > now) return hit.value;
  if (hit && typeof hit.then === "function") return hit;

  const p = (async () => {
    try {
      const value = await fetcher();
      cache.set(key, { value, expire: now + ttl });
      return value;
    } finally {
      const entry = cache.get(key);
      if (entry && typeof entry.then === "function") cache.delete(key);
    }
  })();

  cache.set(key, p);
  return p;
}

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
  const key = cacheKey("devices", auth);
  return memo(key, DEFAULT_TTL.meta, async () => {
    const r = await upstream.get("/devices", { headers: { Cookie: auth }, params: { all: true } });
    if (r.status >= 400) throw new Error(`devices ${r.status}`);
    return asArr(r.data);
  });
}
async function getGroups(auth) {
  const key = cacheKey("groups", auth);
  return memo(key, DEFAULT_TTL.meta, async () => {
    const r = await upstream.get("/groups", { headers: { Cookie: auth }, params: { all: true } });
    if (r.status >= 400) throw new Error(`groups ${r.status}`);
    return asArr(r.data);
  });
}
async function getNotifications(auth) {
  const key = cacheKey("notifications", auth);
  return memo(key, DEFAULT_TTL.meta, async () => {
    const r = await upstream.get("/notifications", { headers: { Cookie: auth }, params: { all: true } });
    if (r.status >= 400) return [];
    return asArr(r.data);
  });
}
async function getGeofences(auth) {
  const key = cacheKey("geofences", auth);
  return memo(key, DEFAULT_TTL.meta, async () => {
    const r = await upstream.get("/geofences", { headers: { Cookie: auth }, params: { all: true } });
    if (r.status >= 400) return [];
    return asArr(r.data);
  });
}
async function getTrips(auth, deviceId, from, to) {
  const key = cacheKey("trips", auth, deviceId, from, to);
  return memo(key, DEFAULT_TTL.trips, async () => {
    const r = await upstream.get("/reports/trips", { headers: { Cookie: auth }, params: { deviceId, from, to } });
    if (r.status >= 400) return [];
    return asArr(r.data);
  });
}
async function getEvents(auth, deviceId, from, to) {
  const key = cacheKey("events", auth, deviceId, from, to);
  return memo(key, DEFAULT_TTL.events, async () => {
    const r = await upstream.get("/reports/events", { headers: { Cookie: auth }, params: { deviceId, from, to } });
    if (r.status >= 400) return [];
    return asArr(r.data);
  });
}
async function getMaint(auth, deviceId) {
  const key = cacheKey("maint", auth, deviceId);
  return memo(key, DEFAULT_TTL.maint, async () => {
    const r = await upstream.get("/maintenance", { headers: { Cookie: auth }, params: { deviceId } });
    if (r.status >= 400) return [];
    return asArr(r.data);
  });
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
    res.status(500).json({ ok: false, error: "groups_failed", detail: e.message });
  }
});

/* =========================
   KPIs endpoints (résumé)
========================= */
async function fetchTripsForDevices(auth, deviceIds, from, to) {
  const entries = await runPool(deviceIds, CONCURRENCY, async (id) => [id, await getTrips(auth, id, from, to)]);
  return new Map(entries);
}

app.post("/api/reports/average-speed", async (req, res) => {
  const { username, password, deviceIds, from, to } = req.body || {};
  const auth = makeBasicHeader(username, password);
  if (!auth) return res.status(400).json({ ok: false, error: "missing_credentials" });
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return res.status(400).json({ ok: false, error: "no_devices" });
  if (!from || !to) return res.status(400).json({ ok: false, error: "missing_range" });

  try {
    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    let sum = 0, count = 0, used = new Set();
    for (const [id, trips] of tripsByDevice) {
      let local = 0, n = 0;
      for (const t of trips) {
        const v = Number(t?.averageSpeed);
        if (Number.isFinite(v)) { local += v; n++; }
      }
      if (n > 0) { sum += local; count += n; used.add(id); }
    }
    res.json({ ok: true, averageSpeed: count ? sum / count : 0, tripsCount: count, devicesCountUsed: used.size });
  } catch (e) {
    res.status(500).json({ ok: false, error: "avg_speed_failed", detail: e.message });
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
    res.json({ ok: true, maxSpeed, tripsCount, devicesCountUsed: used.size, meta });
  } catch (e) {
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
    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    let sumFuel = 0, tripsCount = 0, used = new Set();
    const clamp = (x) => {
      const v = Number(x);
      if (!Number.isFinite(v)) return null;
      return v < 0 ? 0 : v;
    };
    for (const [id, trips] of tripsByDevice) {
      if (trips.length) used.add(id);
      for (const t of trips) {
        const v = clamp(t?.spentFuel);
        if (v !== null) { sumFuel += v; tripsCount++; }
      }
    }
    if (sumFuel < 0) sumFuel = 0;
    res.json({ ok: true, averageFuel: tripsCount ? sumFuel / tripsCount : 0, totalFuel: sumFuel, tripsCount, devicesCountUsed: used.size });
  } catch (e) {
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
      const arr = asArr(arr0).slice().sort((a, b) => (Date.parse(a?.serverTime) || 0) - (Date.parse(b?.serverTime) || 0));
      const alertsSet = new Set();
      const geosSet = new Set();
      let alertOccurrences = 0;
      let lastState = null;
      let lastTs = 0;

      for (const ev of arr) {
        if (ev?.type && ev.type !== "alarm") { alertsSet.add(String(ev.type)); alertOccurrences += 1; }
        if (ev?.type === "alarm" && ev?.attributes?.alarm) alertsSet.add(String(ev.attributes.alarm));
        const ids = parseNotifIds(ev?.attributes?.notifications || ev?.attributes?.notificationId);
        ids.forEach((nid) => alertsSet.add(notifMap.get(nid) || `notif:${nid}`));
        if (ev?.type === "alarm") alertOccurrences += ids.length > 0 ? ids.length : 1;
        const gid = Number(ev?.geofenceId);
        if (Number.isFinite(gid) && gid > 0) geosSet.add(geofenceMap.get(gid) || `geofence:${gid}`);

        const st = inferStateFromEvent(ev);
        const ts = Date.parse(ev?.serverTime) || 0;
        if (st && ts >= lastTs) { lastState = st; lastTs = ts; }
      }
      if (!lastState) lastState = arr.length ? "en_service" : "hors_service";

      rows.push({
        deviceId: id,
        alerts: Array.from(alertsSet).sort((a, b) => a.localeCompare(b)),
        geofences: Array.from(geosSet).sort((a, b) => a.localeCompare(b)),
        alertCount: alertOccurrences,
        geofenceCount: geosSet.size,
        state: lastState,
        stateLabel: stateLabel(lastState),
      });
    }

    res.json({ ok: true, rows, count: rows.length });
  } catch (e) {
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
      const takenBy = status === "in_progress" ? (username || null) : null;
      const takenAt = status === "in_progress" ? now : null;

      await client.query(
        `
        INSERT INTO alerts.alert_states (company, alert_id, status, type, taken_by, taken_at, updated_at)
        VALUES ($1,$2, COALESCE($3,'new'), COALESCE($4,'success'), $5, $6, now())
        ON CONFLICT (company, alert_id)
        DO UPDATE SET
          status     = COALESCE(EXCLUDED.status, alerts.alert_states.status),
          type       = COALESCE(EXCLUDED.type,   alerts.alert_states.type),
          taken_by   = COALESCE(alerts.alert_states.taken_by, EXCLUDED.taken_by),
          taken_at   = COALESCE(alerts.alert_states.taken_at, EXCLUDED.taken_at),
          updated_at = now()
        `,
        [company, alertId, status, type, takenBy, takenAt]
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
      `SELECT company, alert_id, status, type, taken_by, taken_at, updated_at
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
        VALUES ($1,$2,'resolved', COALESCE($3,'success'), $4, COALESCE($5, alerts.alert_states.taken_at), now())
        ON CONFLICT (company, alert_id)
        DO UPDATE SET
          status     = 'resolved',
          type       = COALESCE($3, alerts.alert_states.type),
          taken_by   = COALESCE(alerts.alert_states.taken_by, $4),
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
    const tripsByDevice = await fetchTripsForDevices(auth, deviceIds, from, to);
    let totalKm = 0;

    for (const [, trips] of tripsByDevice) {
      for (const t of trips) {
        // PinMe renvoie souvent distance en mètres ; sinon distanceKm
        const m = Number(t?.distance);
        const kmField = Number(t?.distanceKm);
        if (Number.isFinite(m)) totalKm += m / 1000;
        else if (Number.isFinite(kmField)) totalKm += kmField;
      }
    }
    res.json({ ok: true, totalKm: Math.max(0, totalKm) });
  } catch (e) {
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
      // Heuristique : un enregistrement avec attributes.due <= 0 => échéance dépassée
      const overdue = Array.isArray(maints)
        ? maints.some((m) => Number(m?.attributes?.due) <= 0)
        : false;
      if (!overdue) ok++;
    }

    const efficiency = total > 0 ? (ok / total) * 100 : 0;
    res.json({ ok: true, efficiency, total, ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: "maint_eff_failed", detail: e.message });
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
   Start
========================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
