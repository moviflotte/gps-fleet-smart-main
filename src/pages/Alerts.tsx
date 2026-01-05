// src/pages/Alerts.tsx
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useNavigate } from "react-router-dom";

import { Label } from "@/components/ui/label"
import {
  AlertTriangle,
  Search,
  Filter,
  Clock,
  MapPin,
  Car,
  User,
  Calendar,
  X,
  Edit,
  CheckCircle,
  MessageCircle,
  RefreshCw,
} from "lucide-react"
import { api } from "@/lib/api"

/* ---------- Utils ---------- */
function slug(v: string) {
  return String(v || "")
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase()
}

/* ---------- Helpers période ---------- */
function toIsoLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000) // 24h
  return { from, to }
}
function readRangeFromStorage() {
  const f = localStorage.getItem("alertsFrom")
  const t = localStorage.getItem("alertsTo")
  if (f && t) return { from: new Date(f), to: new Date(t) }
  return defaultRange()
}
function saveRangeToStorage(from: Date, to: Date) {
  localStorage.setItem("alertsFrom", from.toISOString())
  localStorage.setItem("alertsTo", to.toISOString())
}

/* ---------- Types UI ---------- */
type AlertStatus = "new" | "in_progress" | "resolved"
type AlertType = "critical" | "warning" | "success"

interface Comment {
  id: string
  text: string
  author: string
  date: string
}
interface ActionStep {
  id: string
  label: string
  done: boolean
}
interface Alert {
  id: string
  type: AlertType
  title: string
  description: string
  time: string
  date: string
  location: string
  vehicle: string
  driver: string
  status: AlertStatus
  comments: Comment[]
  actionPlan: ActionStep[]
}

/* --------- Plans d’actions par défaut --------- */
const defaultPlans: Record<AlertType, string[]> = {
  critical: ["Contacter le conducteur", "Vérifier la limite de vitesse/zone", "Analyser la trajectoire (±15 min)", "Rédiger un avertissement"],
  warning: ["Diagnostiquer la cause", "Notifier le conducteur/chef d'équipe", "Planifier un suivi"],
  success: ["Documenter et archiver"],
}
const MAX_ACTIONS = 10

/* =========================================================
   PERSISTENCE PARTAGÉE PAR COMPAGNIE (frontend)
========================================================= */
// lit les credentials stockés par la page de login
function loadSessionCreds(): { username: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem("fleet_auth")
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p?.isAuth && p?.username && p?.password) return { username: p.username, password: p.password }
  } catch {}
  return null
}

// slug compagnie
function companyFromUsername(u?: string | null): string {
  const base = (u || "").split("@")[0] || ""
  return (
    base
      .normalize("NFKD")
      .replace(/[^\w]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .toLowerCase() || "default"
  )
}

// charge l’état persistant d’un lot d’alertes (via backend/DB)
async function loadPersistedStates(company: string, alertIds: string[]) {
  const data = await api.alertsGetStates(company, alertIds)
  return (data?.states || {}) as Record<string, Partial<Alert>>
}

// applique des patchs (merge) persistants (via backend/DB)
async function patchPersistedStates(company: string, patches: Array<{ id: string; patch: Partial<Alert> }>) {
  return api.alertsPatchStates(company, patches)
}

/* ===================== PAGE ===================== */
export default function Alerts() {
  /* --- Période --- */
    const navigate = useNavigate();

  const initial = readRangeFromStorage()
  const [fromLocal, setFromLocal] = useState<string>(toIsoLocalValue(initial.from))
  const [toLocal, setToLocal] = useState<string>(toIsoLocalValue(initial.to))
  const [range, setRange] = useState<{ from: Date; to: Date }>(initial)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const applyRange = () => {
    setRangeError(null)
    const f = new Date(fromLocal)
    const t = new Date(toLocal)
    if (Number.isNaN(+f) || Number.isNaN(+t)) return setRangeError("Dates invalides")
    if (+f >= +t) return setRangeError("La date de début doit être avant la date de fin")
    saveRangeToStorage(f, t)
    setRange({ from: f, to: t })
    fetchFromServer(f, t)
  }
  const setLast24h = () => {
    const { from, to } = defaultRange()
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRangeToStorage(from, to)
    setRange({ from, to })
    fetchFromServer(from, to)
  }
  const setLast7d = () => {
    const to = new Date()
       const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRangeToStorage(from, to)
    setRange({ from, to })
    fetchFromServer(from, to)
  }

  /* --- État & filtres --- */
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<"all" | AlertType>("all")
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Modals
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null)
  const [editAlert, setEditAlert] = useState<Alert | null>(null)

  // Edition (modal)
  const [actionDate, setActionDate] = useState("07/09/2025")
  const [actionTime, setActionTime] = useState("21:30")
  const [actionDelay, setActionDelay] = useState("24h, 2j…")
  const [comments, setComments] = useState("")
  const [newActionChoice, setNewActionChoice] = useState<string | undefined>(undefined)
  const [customActionLabel, setCustomActionLabel] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)

  /* --- Connexion --- */
  const isAlreadyLogged = useMemo(() => {
    try {
      const saved = sessionStorage.getItem("fleet_auth")
      if (!saved) return false
      const p = JSON.parse(saved)
      return !!(p?.isAuth && p?.username && p?.password)
    } catch {
      return false
    }
  }, [])

  const company = useMemo(() => {
    const creds = loadSessionCreds()
    return companyFromUsername(creds?.username)
  }, [])

  useEffect(() => {
    fetchFromServer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- Mapping label → type --- */
  function labelToType(label: string): AlertType {
    const l = label.toLowerCase()
    if (l.includes("speed") || l.includes("overspeed") || l.includes("alarm")) return "critical"
    if (l.includes("fuel") || l.includes("idle") || l.includes("zone") || l.includes("geofence")) return "warning"
    return "success"
  }

  /* --- Chargement serveur + merge état persistant --- */
  async function fetchFromServer(f?: Date, t?: Date) {
    setLoading(true)
    setLoadError(null)
    try {
      const { from: F, to: T } = { from: f ?? range.from, to: t ?? range.to }
      const fromISO = F.toISOString()
      const toISO = T.toISOString()

      // 1) devices
      const devs: any[] = await api.devices()
      const ids: number[] = Array.isArray(devs) ? devs.map((d: any) => Number(d.id)).filter(Number.isFinite) : []
      if (ids.length === 0) {
        setAlerts([])
        setLoading(false)
        return
      }
      const devById = new Map<number, any>(devs.map((d: any) => [Number(d.id), d]))

      // 2) agrégat events
      const data: any = await api.vehicleAlerts(ids, fromISO, toISO)
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : []

      // 3) synthèse cartes
      const now = new Date()
      const dateStr = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      const timeStr = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })

      const synthetic: Alert[] = []
      for (const r of rows) {
        const device = devById.get(Number(r.deviceId))
        const vehicleLabel = device?.name || device?.uniqueId || `Device #${r.deviceId}`
        const labels: string[] = Array.isArray(r?.alerts) ? r.alerts : []
        labels.forEach((label: string) => {
          const type = labelToType(label)
          const stableId = `${r.deviceId}::${slug(label)}`
          synthetic.push({
            id: stableId,
            type,
            title: label,
            description: `Événement "${label}" détecté sur la période.`,
            time: timeStr,
            date: dateStr,
            location: (Array.isArray(r?.geofences) && r.geofences[0]) || "—",
            vehicle: vehicleLabel,
            driver: "—",
            status: "new",
            comments: [],
            actionPlan: [],
          })
        })
      }

      // 4) merge avec état persistant (BD)
      const idsToMerge = synthetic.map((a) => a.id)
      if (idsToMerge.length) {
        try {
          const persisted = await loadPersistedStates(company, idsToMerge)
          for (let i = 0; i < synthetic.length; i++) {
            const a = synthetic[i]
            const p = persisted[a.id]
            if (p) {
              synthetic[i] = {
                ...a,
                status: (p.status as any) || a.status,
                actionPlan: Array.isArray(p.actionPlan) && p.actionPlan.length ? (p.actionPlan as ActionStep[]) : a.actionPlan,
                comments: Array.isArray(p.comments) ? (p.comments as Comment[]) : a.comments,
                type: (p.type as AlertType) || a.type,
              }
            }
          }
        } catch (e) {
          console.warn("load persisted states failed:", (e as any)?.message)
        }
      }

      setAlerts(synthetic)
    } catch (e: any) {
      setLoadError(e?.message || "Erreur de chargement des alertes")
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  /* --- Helpers UI --- */
  const getProgress = (a: Alert) => {
    const total = a.actionPlan.length
    if (!total) return 0
    const done = a.actionPlan.filter((s) => s.done).length
    return Math.round((done / total) * 100)
  }
  const getAlertBgColor = (type: AlertType) =>
    type === "critical" ? "bg-red-50 border-l-4 border-red-500"
    : type === "warning" ? "bg-yellow-50 border-l-4 border-yellow-500"
    : "bg-green-50 border-l-4 border-green-500"
  const getAlertTextColor = (type: AlertType) =>
    type === "critical" ? "text-red-800" : type === "warning" ? "text-yellow-800" : "text-green-800"
  const getBadgeColor = (type: AlertType) =>
    type === "critical" ? "bg-red-500 text-white" : type === "warning" ? "bg-yellow-500 text-white" : "bg-green-500 text-white"
  const isMaxReached = (a: Alert) => a.actionPlan.length >= MAX_ACTIONS

  /* --- Metrics --- */
  const filteredAlerts = alerts.filter((a) => {
    const q = searchTerm.toLowerCase()
    const matchesSearch =
      a.title.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q) ||
      a.driver.toLowerCase().includes(q) ||
      a.vehicle.toLowerCase().includes(q)
    const matchesType = filterType === "all" ? true : a.type === filterType
    const matchesStatus = !showActiveOnly || a.status !== "resolved"
    return matchesSearch && matchesType && matchesStatus
  })

  const totalAlerts = alerts.length
  const newAlerts = alerts.filter((a) => a.status === "new").length
  const inProgressAlerts = alerts.filter((a) => a.status === "in_progress").length
  const treatedAlerts = alerts.filter((a) => a.status === "resolved").length
  const treatmentRate = totalAlerts ? Math.round((treatedAlerts / totalAlerts) * 100) : 0
  const criticalRate = totalAlerts ? Math.round((alerts.filter((a) => a.type === "critical").length / totalAlerts) * 100) : 0

  /* --- Actions avec persistence (DB) --- */
  const injectDefaultPlan = (a: Alert): Alert =>
    a.actionPlan.length
      ? a
      : {
          ...a,
          actionPlan: defaultPlans[a.type].map((label) => ({
            id: crypto.randomUUID(),
            label,
            done: false,
          })),
        }

  const takeInCharge = async (id: string) => {
    const creds = loadSessionCreds()
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...injectDefaultPlan(a),
              status: "in_progress",
              comments: [
                ...a.comments,
                {
                  id: crypto.randomUUID(),
                  text: "Alerte prise en charge",
                  author: creds?.username || "Admin",
                  date: new Date().toLocaleString(),
                },
              ],
            }
          : a
      )
    )
    try {
      const a = alerts.find((x) => x.id === id)
      if (!a) return
      const patched = injectDefaultPlan(a)
      await patchPersistedStates(company, [
        {
          id,
          patch: {
            status: "in_progress",
            actionPlan: patched.actionPlan,
            comments: [
              ...patched.comments,
              {
                id: crypto.randomUUID(),
                text: "Alerte prise en charge",
                author: creds?.username || "Admin",
                date: new Date().toLocaleString(),
              },
            ],
          },
        },
      ])
      // (optionnel) on pourrait aussi appeler l'endpoint dédié in-progress,
      // mais ce n'est pas nécessaire si ton patch crée déjà la ligne.
    } catch (e) {
      console.warn("persist takeInCharge failed:", (e as any)?.message)
    }
  }

  const toggleStep = async (alertId: string, stepId: string) => {
    let next: Alert | null = null
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== alertId) return a
        const AP = a.actionPlan.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))
        next = { ...a, actionPlan: AP }
        return next!
      })
    )
    try {
      if (next) await patchPersistedStates(company, [{ id: alertId, patch: { actionPlan: next.actionPlan } }])
    } catch (e) {
      console.warn("persist toggleStep failed:", (e as any)?.message)
    }
  }

  const addStep = async (alertId: string, label: string) => {
    const trimmed = (label || "").trim()
    if (!trimmed) return
    let next: Alert | null = null
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== alertId) return a
        if (a.actionPlan.length >= MAX_ACTIONS) {
          setActionError(`Limite atteinte : ${MAX_ACTIONS} actions maximum.`)
          return a
        }
        const exists = a.actionPlan.some((s) => s.label.toLowerCase() === trimmed.toLowerCase())
        if (exists) {
          setActionError("Cette action existe déjà.")
          return a
        }
        setActionError(null)
        next = { ...a, actionPlan: [...a.actionPlan, { id: crypto.randomUUID(), label: trimmed, done: false }] }
        return next!
      })
    )
    try {
      if (next) await patchPersistedStates(company, [{ id: alertId, patch: { actionPlan: next.actionPlan } }])
    } catch (e) {
      console.warn("persist addStep failed:", (e as any)?.message)
    }
  }

  const markResolved = async (id: string) => {
    // 1) UI immédiate
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: "resolved", type: "success" } : a)))
    if (detailAlert?.id === id) setDetailAlert(null)
    if (editAlert?.id === id) setEditAlert(null)

    // 2) Persistance existante (patch) — on la garde pour commentaires/plan
    try {
      await patchPersistedStates(company, [{ id, patch: { status: "resolved", type: "success" } }])
    } catch (e) {
      console.warn("persist markResolved (patch) failed:", (e as any)?.message)
    }

    // 3) **AJOUT CRUCIAL** : écrire aussi le statut 'done' pour la page "Alertes traitées"
    try {
      const creds = loadSessionCreds()
      await api.alertsDonePost(company, creds?.username || null, [id], "success")
    } catch (e) {
      console.warn("persist markResolved (done) failed:", (e as any)?.message)
    }
  }

  const openDetails = (a: Alert) => setDetailAlert(a)
  const openEdit = (a: Alert) => {
    setEditAlert(injectDefaultPlan(a))
    setDetailAlert(null)
    setNewActionChoice(undefined)
    setCustomActionLabel("")
    setActionError(null)
  }
  const validateEdit = async () => {
    if (!editAlert) return
    let next: Alert | null = null
    if (comments.trim()) {
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === editAlert.id
            ? (next = {
                ...a,
                comments: [
                  ...a.comments,
                  { id: crypto.randomUUID(), text: comments, author: "Admin", date: new Date().toLocaleString() },
                ],
              })
            : a
        )
      )
    }
    setComments("")
    setNewActionChoice(undefined)
    setCustomActionLabel("")
    setActionError(null)
    setEditAlert(null)
    try {
      if (next) await patchPersistedStates(company, [{ id: next.id, patch: { comments: next.comments, actionPlan: next.actionPlan } }])
    } catch (e) {
      console.warn("persist validateEdit failed:", (e as any)?.message)
    }
  }

  /* ----------------------------- UI ------------------------------ */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Gestion des alertes</h1>
              <p className="text-gray-600 mt-1">Surveillez et gérez les alertes de la flotte en temps réel</p>
            </div>
            <div className="flex items-center gap-3">{/* actions header */}
                <Button
    variant="default"
    size="sm"
    className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
    onClick={() => navigate("/resolved-alerts")}
  >
    <CheckCircle className="h-4 w-4" />
    Alertes traitées
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
            <Button variant="outline" onClick={setLast24h}>Dernières 24h</Button>
            <Button variant="outline" onClick={setLast7d}>7 jours</Button>
            {rangeError && <span className="text-xs text-red-600 ml-1">{rangeError}</span>}
            {loadError && <span className="text-xs text-red-600 ml-1">{loadError}</span>}
            {loading && <span className="text-xs text-gray-500 ml-1">Chargement…</span>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Total des alertes</p>
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="M7 15l3-3 3 3 4-6" />
                  </svg>
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-blue-700">{totalAlerts}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Non traitées</p>
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-4 w-4 text-red-600" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-red-600">{newAlerts}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">En cours</p>
                <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center">
                  <Clock className="w-4 w-4 text-yellow-600" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-yellow-600">{inProgressAlerts}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Traitées</p>
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                  <CheckCircle className="w-4 w-4 text-green-600" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-green-600">{treatedAlerts}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Taux de traitement</p>
                <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="M7 14l4-4 3 3 5-6" />
                  </svg>
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-rose-600">{treatmentRate}%</p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Alertes critiques</p>
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <AlertTriangle className="w-4 w-4 text-amber-600" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-amber-600">{criticalRate}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Paramètres & filtres */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold mb-4">Paramètres d'affichage</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Afficher uniquement actives</span>
                  <Switch checked={showActiveOnly} onCheckedChange={setShowActiveOnly} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Actualisation automatique</span>
                  <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                Dernière mise à jour: selon période
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Filtres et recherche</h3>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher des alertes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Toutes les priorités" />
                </SelectTrigger>
                <SelectContent className="bg-white border shadow-lg z-50">
                  <SelectItem value="all">Toutes les priorités</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                  <SelectItem value="warning">Avertissement</SelectItem>
                  <SelectItem value="success">Succès</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Grille des alertes */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Alertes ({filteredAlerts.length})</h2>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Chargement…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAlerts.map((alert) => {
                const progress = getProgress(alert)
                return (
                  <Card key={alert.id} className={`${getAlertBgColor(alert.type)} transition-all duration-200`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge className={`${getBadgeColor(alert.type)} text-xs font-medium px-2 py-1`}>
                            {alert.type === "critical" ? "CRITIQUE" : alert.type === "warning" ? "AVERTISSEMENT" : "SUCCÈS"}
                          </Badge>
                          {alert.status === "new" && (
                            <Badge variant="outline" className="text-xs px-2 py-1 border-gray-400 text-gray-700">
                              Non traité
                            </Badge>
                          )}
                          {alert.status === "in_progress" && (
                            <Badge variant="outline" className="text-xs px-2 py-1 border-yellow-400 text-yellow-700">
                              En cours
                            </Badge>
                          )}
                          {alert.status === "resolved" && (
                            <Badge variant="outline" className="text-xs px-2 py-1 border-green-500 text-green-700">
                              Traité
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{alert.time}</span>
                      </div>

                      <h3 className={`font-semibold text-base mb-2 ${getAlertTextColor(alert.type)}`}>{alert.title}</h3>

                      <div className="space-y-2 text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-2">
                          <Car className="h-3 w-3" />
                          <span>{alert.vehicle}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          <span>{alert.driver}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          <span>{alert.location}</span>
                        </div>
                      </div>

                      {alert.status === "new" && (
                        <div className="flex items-center justify-between pt-2">
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => takeInCharge(alert.id)}>
                            Prendre en charge
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openDetails(alert)}>
                            Plus de détails
                          </Button>
                        </div>
                      )}

                      {alert.status === "in_progress" && (
                        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm text-gray-700 font-medium">Actions du gestionnaire</div>
                            <div className="text-xs text-gray-600">{progress}%</div>
                          </div>

                          <div className="w-full h-2 rounded bg-gray-200 mb-3">
                            <div className="h-2 rounded bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                          </div>

                          <div className="space-y-2 mb-3">
                            {alert.actionPlan.length === 0 && <p className="text-xs text-gray-500">Aucune action définie.</p>}
                            {alert.actionPlan.map((s) => (
                              <label key={s.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={s.done}
                                  onChange={() => toggleStep(alert.id, s.id)}
                                />
                                <span className={s.done ? "line-through text-gray-500" : ""}>{s.label}</span>
                              </label>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => openDetails(alert)}>
                              Voir détails
                            </Button>
                            <Button
                              variant="outline"
                              className="border-green-600 text-green-600 hover:bg-green-50"
                              onClick={() => markResolved(alert.id)}
                            >
                              Marquer résolu
                            </Button>
                          </div>
                        </div>
                      )}

                      {alert.status === "resolved" && (
                        <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                          <span className="text-xs text-gray-500">{alert.date}</span>
                          <Button size="sm" variant="outline" onClick={() => openDetails(alert)}>
                            Détails
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DÉTAILS */}
      <Dialog open={!!detailAlert} onOpenChange={() => setDetailAlert(null)}>
        <DialogContent className="max-w-lg bg-white border shadow-xl z-50">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">{detailAlert?.title}</DialogTitle>
                <p className="text-sm text-gray-600">Détails complets de l'alerte #{detailAlert?.id}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetailAlert(null)} className="h-6 w-6 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          {detailAlert && (
            <div className="space-y-6">
              <div className="flex gap-2">
                <Badge className="bg-red-500 text-white px-2 py-1">
                  {detailAlert.type === "critical" ? "Critique" : detailAlert.type === "warning" ? "Avertissement" : "Succès"}
                </Badge>
                {detailAlert.status !== "resolved" && <Badge className="bg-yellow-500 text-white px-2 py-1">En cours</Badge>}
                {detailAlert.status === "resolved" && <Badge className="bg-green-600 text-white px-2 py-1">Traité</Badge>}
              </div>

              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">{detailAlert.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">Véhicule</p>
                      <p className="font-medium">{detailAlert.vehicle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">Conducteur</p>
                      <p className="font-medium">{detailAlert.driver}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">Localisation</p>
                      <p className="font-medium">{detailAlert.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500">Date et heure</p>
                      <p className="font-medium">
                        {detailAlert.date} à {detailAlert.time}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {detailAlert.status !== "resolved" && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span className="font-medium text-yellow-800">Action en cours</span>
                  </div>
                  <p className="text-sm text-yellow-700">Cette alerte est actuellement prise en charge par un gestionnaire.</p>
                </div>
              )}

              <div className="flex gap-2">
                {detailAlert.status !== "resolved" ? (
                  <>
                    <Button onClick={() => openEdit(detailAlert)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                      <Edit className="h-4 w-4 mr-2" />
                      Modifier l'action
                    </Button>
                    <Button
                      variant="outline"
                      className="border-green-600 text-green-600 hover:bg-green-50"
                      onClick={() => markResolved(detailAlert.id)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Marquer résolu
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setDetailAlert(null)}>
                    Fermer
                  </Button>
                )}
              </div>

              {detailAlert.comments.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Commentaires ({detailAlert.comments.length})
                  </h4>
                  <div className="space-y-2">
                    {detailAlert.comments.map((c) => (
                      <div key={c.id} className="bg-gray-50 p-3 rounded text-sm">
                        <p className="font-medium text-gray-900">{c.text}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Par {c.author} — {c.date}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL MODIFIER L'ACTION */}
      <Dialog open={!!editAlert} onOpenChange={() => setEditAlert(null)}>
        <DialogContent className="max-w-lg bg-white border shadow-xl z-50">
          <DialogHeader>
            <DialogTitle>Dépassement de vitesse</DialogTitle>
            <p className="text-sm text-gray-600">Actions du gestionnaire</p>
          </DialogHeader>

          {editAlert && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Véhicule</p>
                  <p className="font-medium">{editAlert.vehicle}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Localisation</p>
                  <p className="font-medium">{editAlert.location}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Conducteur</p>
                  <p className="font-medium">{editAlert.driver}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date & heure</p>
                  <p className="font-medium">
                    {editAlert.date} à {editAlert.time}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Action de gestion</Label>
                  <span className="text-xs text-gray-500">{editAlert.actionPlan.length}/{MAX_ACTIONS}</span>
                </div>

                <Select
                  value={newActionChoice}
                  onValueChange={(v) => {
                    setNewActionChoice(v)
                    if (v && v !== "__autre__") addStep(editAlert.id, v)
                  }}
                  disabled={isMaxReached(editAlert)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={isMaxReached(editAlert) ? "Limite atteinte" : "Sélectionner une action"} />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg z-50">
                    <SelectItem value="Contacter le conducteur">Contacter le conducteur</SelectItem>
                    <SelectItem value="Envoyer un avertissement">Envoyer un avertissement</SelectItem>
                    <SelectItem value="Suspendre temporairement">Suspendre temporairement</SelectItem>
                    <SelectItem value="__autre__">Autre…</SelectItem>
                  </SelectContent>
                </Select>

                {newActionChoice === "__autre__" && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Saisir l’intitulé de l’action…"
                      value={customActionLabel}
                      onChange={(e) => setCustomActionLabel(e.target.value)}
                      disabled={isMaxReached(editAlert)}
                    />
                    <Button
                      onClick={() => {
                        if (!isMaxReached(editAlert)) {
                          addStep(editAlert.id, customActionLabel)
                          if (customActionLabel.trim()) setCustomActionLabel("")
                        }
                      }}
                      disabled={isMaxReached(editAlert) || !customActionLabel.trim()}
                    >
                      Ajouter
                    </Button>
                  </div>
                )}

                {actionError && <p className="text-xs text-red-600 mt-2">{actionError}</p>}
                {isMaxReached(editAlert) && !actionError && (
                  <p className="text-xs text-red-600 mt-2">Vous avez atteint la limite de {MAX_ACTIONS} actions.</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Heure</Label>
                  <Input value={actionTime} onChange={(e) => setActionTime(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Délai</Label>
                  <Input value={actionDelay} onChange={(e) => setActionDelay(e.target.value)} className="text-sm" />
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Plan d'actions</Label>
                <div className="mt-2 rounded border border-gray-200 p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2 text-sm">
                    <span className="text-gray-700">Avancement</span>
                    <span className="text-gray-600">{getProgress(editAlert)}%</span>
                  </div>
                  <div className="w-full h-2 rounded bg-gray-200 mb-3">
                    <div className="h-2 rounded bg-blue-500" style={{ width: `${getProgress(editAlert)}%` }} />
                  </div>

                  <div className="space-y-2">
                    {editAlert.actionPlan.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={s.done}
                          onChange={() => toggleStep(editAlert.id, s.id)}
                        />
                        <span className={s.done ? "line-through text-gray-500" : ""}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Commentaires</Label>
                <Textarea
                  placeholder="Ajouter des commentaires..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="mt-1 h-20"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={validateEdit} className="bg-green-600 hover:bg-green-700 text-white">
                  Valider
                </Button>
                <Button variant="outline" onClick={() => setEditAlert(null)}>
                  Annuler
                </Button>
                <Button
                  variant="outline"
                  className="ml-auto border-green-600 text-green-600 hover:bg-green-50"
                  onClick={() => markResolved(editAlert.id)}
                >
                  Marquer résolu
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
