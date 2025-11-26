// src/lib/api.ts
type Creds = { username: string; password: string };

/* ===================== Session creds ===================== */
function loadCreds(): Creds | null {
  try {
    const raw = sessionStorage.getItem("fleet_auth");
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.isAuth && p?.username && p?.password) {
      return { username: p.username, password: p.password };
    }
  } catch {}
  return null;
}

/* ===================== HTTP helpers ===================== */
async function postJSON<T = any>(path: string, body: Record<string, any> = {}): Promise<T> {
  const creds = loadCreds();
  const merged = creds ? { ...body, ...creds } : body;

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.ok === false)) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function putJSON<T = any>(path: string, body: Record<string, any> = {}): Promise<T> {
  const creds = loadCreds();
  const merged = creds ? { ...body, ...creds } : body;

  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.ok === false)) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/** GET avec query object */
async function getJSON<T = any>(path: string, query: Record<string, any> = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.ok === false)) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/* ===================== API client ===================== */
export const api = {
  /* =============== AUTH =============== */
  login: (username: string, password: string) =>
    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.ok === false) throw new Error(d?.error || "Identifiants invalides");
      return d;
    }),

  /* =============== LISTS =============== */
  devices: () => postJSON("/api/devices"),
  groups: () => postJSON("/api/groups"),

  /* =============== REPORTS =============== */
  averageSpeed: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/average-speed", { deviceIds, from, to }),
  maxSpeed: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/max-speed", { deviceIds, from, to }),
  avgFuel: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/avg-fuel", { deviceIds, from, to }),
  activeDevices: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/active-devices", { deviceIds, from, to }),
  totalDistance: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/total-distance", { deviceIds, from, to }),
  maintenanceEfficiency: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/maintenance-efficiency", { deviceIds, from, to }),
  vehicleAlerts: (deviceIds: number[], from: string, to: string) =>
    postJSON("/api/reports/vehicle-alerts", { deviceIds, from, to }),

  /* =======================================================
   *  PERSISTENCE ALERTES — BACKED BY POSTGRES (DB)
   * ======================================================= */
  alertsDbStatesGet: (company: string, ids?: string[]) =>
    postJSON<{ ok: true; company: string; states: Record<string, any> }>(
      "/api/db/alerts/state/get",
      { company, ids }
    ),

  alertsDbPatchStates: (
    company: string,
    patches: Array<{ id: string; patch: Record<string, any> }>
  ) =>
    postJSON<{ ok: true; company: string; count: number }>(
      "/api/db/alerts/state/patch",
      { company, patches }
    ),

  alertsInProgressPost: (company: string, username: string | null, ids: string[], type?: string) =>
    postJSON<{ ok: true; company: string; count: number; status: "in_progress" }>(
      "/api/db/alerts/in-progress",
      { company, username, ids, type }
    ),

  alertsDonePost: (company: string, username: string | null, ids: string[], type?: string) =>
    postJSON<{ ok: true; company: string; count: number; status: "done" }>(
      "/api/db/alerts/done",
      { company, username, ids, type }
    ),

  alertsInProgressGet: (company: string, since?: string, until?: string, q?: string, limit = 1000, offset = 0) =>
    getJSON<{ ok: true; company: string; rows: any[]; count: number }>(
      "/api/db/alerts/in-progress",
      { company, since, until, q, limit, offset }
    ),

  alertsDoneGet: (company: string, since?: string, until?: string, q?: string, limit = 1000, offset = 0) =>
    getJSON<{ ok: true; company: string; rows: any[]; count: number }>(
      "/api/db/alerts/done",
      { company, since, until, q, limit, offset }
    ),

  /* ========= Compat avec ton code (Alerts/ResolvedAlerts) ========= */
  alertsGetStates: (company: string, ids: string[]) =>
    (api.alertsDbStatesGet(company, ids) as any),
  alertsPatchStates: (
    company: string,
    patches: Array<{ id: string; patch: Record<string, any> }>
  ) => (api.alertsDbPatchStates(company, patches) as any),

  /* ========= Helpers "single ID" ========= */
  alertMarkInProgress: (company: string, username: string | null, id: string, type?: string) =>
    api.alertsInProgressPost(company, username, [id], type),
  alertMarkDone: (company: string, username: string | null, id: string, type?: string) =>
    api.alertsDonePost(company, username, [id], type),
};
