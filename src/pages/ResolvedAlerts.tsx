// src/pages/ResolvedAlerts.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Search, CheckCircle, Calendar, MapPin, Car, User, MessageCircle, X } from "lucide-react";
import { api } from "@/lib/api";

/* ------------------ Helpers période ------------------ */
function toIsoLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 jours
  return { from, to };
}
function saveRangeToStorage(from: Date, to: Date) {
  localStorage.setItem("resolvedFrom", from.toISOString());
  localStorage.setItem("resolvedTo", to.toISOString());
}
function readRangeFromStorage() {
  const f = localStorage.getItem("resolvedFrom");
  const t = localStorage.getItem("resolvedTo");
  if (f && t) return { from: new Date(f), to: new Date(t) };
  return defaultRange();
}

/* ------------------ Types ------------------ */
type AlertType = "critical" | "warning" | "success";
interface CommentItem { id: string; text: string; author: string; date: string; }
interface ActionItem  { id: string; label: string; done: boolean; }
interface AlertState {
  status: "resolved";
  type: AlertType;
  takenBy?: string | null;
  takenAt?: string | null;
  updatedAt?: string | null;
  actionPlan: ActionItem[];
  comments: CommentItem[];
}
interface ResolvedAlert {
  id: string;
  type: AlertType;
  title: string;
  date: string;
  time: string;
  vehicle: string;
  driver: string;
  location: string;
  details: AlertState;
}

/* ------------------ Utils session/company ------------------ */
function loadSessionCreds(): { username: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem("fleet_auth");
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.isAuth && p?.username && p?.password) return { username: p.username, password: p.password };
  } catch {}
  return null;
}
function companyFromUsername(u?: string | null): string {
  const base = (u || "").split("@")[0] || "";
  return (
    base
      .normalize("NFKD")
      .replace(/[^\w]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .toLowerCase() || "default"
  );
}

/* =========================================================
   PAGE
========================================================= */
export default function ResolvedAlerts() {
  /* Période */
  const init = readRangeFromStorage();
  const [fromLocal, setFromLocal] = useState(toIsoLocalValue(init.from));
  const [toLocal, setToLocal] = useState(toIsoLocalValue(init.to));
  const [range, setRange] = useState(init);
  const [rangeError, setRangeError] = useState<string | null>(null);

  /* États UI */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ResolvedAlert[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AlertType>("all");

  /* Détails (modal) */
  const [active, setActive] = useState<ResolvedAlert | null>(null);
  const [note, setNote] = useState("");

  /* Company courante */
  const company = useMemo(() => {
    const creds = loadSessionCreds();
    return companyFromUsername(creds?.username);
  }, []);

  /* Chargement initial */
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Actions période */
  async function applyRange() {
    setRangeError(null);
    const f = new Date(fromLocal);
    const t = new Date(toLocal);
    if (Number.isNaN(+f) || Number.isNaN(+t)) return setRangeError("Dates invalides");
    if (+f >= +t) return setRangeError("La date de début doit être avant la date de fin");
    saveRangeToStorage(f, t);
    setRange({ from: f, to: t });
    await refresh(f, t);
  }
  async function last24h() {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    setFromLocal(toIsoLocalValue(from));
    setToLocal(toIsoLocalValue(to));
    saveRangeToStorage(from, to);
    setRange({ from, to });
    await refresh(from, to);
  }
  async function last7d() {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    setFromLocal(toIsoLocalValue(from));
    setToLocal(toIsoLocalValue(to));
    saveRangeToStorage(from, to);
    setRange({ from, to });
    await refresh(from, to);
  }

  /* Fetch: liste des IDs résolus -> enrichissement détails */
  async function refresh(f?: Date, t?: Date) {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = { from: f ?? range.from, to: t ?? range.to };
      const since = from.toISOString();
      const until = to.toISOString();

      // 1) Récupère la liste des alertes "done" (traitées) sur la période
      const done = await api.alertsDoneGet(company, since, until);

      const ids: string[] = Array.isArray(done?.rows)
        ? done.rows.map((r: any) => String(r.alert_id)).filter(Boolean)
        : [];

      if (ids.length === 0) {
        setList([]);
        setLoading(false);
        return;
      }

      // 2) Charge états détaillés pour ces IDs (DB)
      const data = await api.alertsGetStates(company, ids);
      const states: Record<string, any> = (data?.states || {}) as any;

      // 3) Mapping UI
      const out: ResolvedAlert[] = ids.map((id) => {
        const s = states[id] || {};
        const title = s.title || s.label || "Alerte";
        const date = new Date(s.updatedAt || s.takenAt || Date.now()).toLocaleDateString("fr-FR");
        const time = new Date(s.updatedAt || s.takenAt || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

        return {
          id,
          type: (s.type as AlertType) || "success",
          title,
          date,
          time,
          vehicle: s.vehicle || "—",
          driver: s.driver || "—",
          location: s.location || "—",
          details: {
            status: "resolved",
            type: (s.type as AlertType) || "success",
            takenBy: s.takenBy || null,
            takenAt: s.takenAt || null,
            updatedAt: s.updatedAt || null,
            actionPlan: Array.isArray(s.actionPlan) ? s.actionPlan : [],
            comments: Array.isArray(s.comments) ? s.comments : [],
          },
        };
      });

      setList(out);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les alertes traitées");
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  /* Filtres */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      const matchesQ =
        !q ||
        a.id.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        a.vehicle.toLowerCase().includes(q) ||
        a.driver.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q);
      const matchesType = typeFilter === "all" ? true : a.type === typeFilter;
      return matchesQ && matchesType;
    });
  }, [list, query, typeFilter]);

  const getBadgeColor = (t: AlertType) =>
    t === "critical" ? "bg-red-500 text-white" : t === "warning" ? "bg-yellow-500 text-white" : "bg-green-600 text-white";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Alertes traitées</h1>
              <p className="text-gray-600 mt-1">Historique des alertes résolues avec leurs détails</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => refresh()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Rafraîchir
              </Button>
            </div>
          </div>

          {/* Période */}
          <div className="mt-4 flex flex-col md:flex-row md:items-end gap-2">
            <div>
              <label className="block text-xs mb-1">De</label>
              <Input type="datetime-local" value={fromLocal} onChange={(e) => setFromLocal(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1">À</label>
              <Input type="datetime-local" value={toLocal} onChange={(e) => setToLocal(e.target.value)} />
            </div>
            <Button onClick={applyRange} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" /> Appliquer
            </Button>
            <Button variant="outline" onClick={last24h}>Dernières 24h</Button>
            <Button variant="outline" onClick={last7d}>7 jours</Button>
            {rangeError && <span className="text-xs text-red-600 ml-2">{rangeError}</span>}
            {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
            {loading && <span className="text-xs text-gray-500 ml-2">Chargement…</span>}
          </div>
        </div>

        {/* Barre de recherche & filtre */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-10"
                placeholder="Rechercher (id, véhicule, conducteur, localisation)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent className="bg-white border shadow-lg z-50">
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                  <SelectItem value="warning">Avertissement</SelectItem>
                  <SelectItem value="success">Succès</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Liste */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((a) => (
              <Card key={a.id} className="border border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`${getBadgeColor(a.type)} text-xs px-2 py-1`}>{
                        a.type === "critical" ? "CRITIQUE" : a.type === "warning" ? "AVERTISSEMENT" : "SUCCÈS"
                      }</Badge>
                      <Badge variant="outline" className="text-xs px-2 py-1 border-green-500 text-green-700">
                        Traité
                      </Badge>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>

                  <h3 className="font-semibold mt-2">{a.title}</h3>

                  <div className="mt-2 space-y-2 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <Car className="h-3 w-3" />
                      <span>{a.vehicle}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      <span>{a.driver}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      <span>{a.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span>{a.date} — {a.time}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={() => setActive(a)}>Voir détails</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!loading && filtered.length === 0 && (
            <div className="text-sm text-gray-500">Aucune alerte traitée sur cette période.</div>
          )}
        </div>
      </div>

      {/* MODAL DÉTAILS */}
      <Dialog open={!!active} onOpenChange={() => setActive(null)}>
        <DialogContent className="max-w-lg bg-white border shadow-xl z-50">
          <DialogHeader className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <DialogTitle className="text-lg font-semibold">Alerte traitée #{active?.id}</DialogTitle>
                <p className="text-xs text-gray-500">{active?.title}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setActive(null)} className="h-6 w-6 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          {active && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><Car className="h-4 w-4 text-gray-500"/><span>{active.vehicle}</span></div>
                  <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-500"/><span>{active.driver}</span></div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-500"/><span>{active.location}</span></div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-500"/><span>{active.date} — {active.time}</span></div>
                </div>
              </div>

              <div className="rounded border p-3 bg-gray-50">
                <div className="text-sm font-medium mb-2">Plan d’actions</div>
                {active.details.actionPlan?.length ? (
                  <ul className="space-y-1 text-sm">
                    {active.details.actionPlan.map((s) => (
                      <li key={s.id} className={`flex items-center gap-2 ${s.done ? "text-gray-500 line-through" : ""}`}>
                        <input type="checkbox" checked={s.done} readOnly className="h-4 w-4" />
                        {s.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-gray-500">Aucune action renseignée.</div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Commentaires ({active.details.comments?.length || 0})</span>
                </div>
                <div className="space-y-2">
                  {active.details.comments?.length ? (
                    active.details.comments.map((c) => (
                      <div key={c.id} className="bg-gray-50 p-3 rounded text-sm">
                        <p className="font-medium text-gray-900">{c.text}</p>
                        <p className="text-xs text-gray-500 mt-1">Par {c.author} — {c.date}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">Pas de commentaire.</div>
                  )}
                </div>
              </div>

              {/* Ajout d'une note locale (démo) */}
              <div className="border-t pt-3">
                <Label className="text-sm font-medium">Ajouter une note (local, démo)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-20" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
