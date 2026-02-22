// src/pages/ResolvedAlerts.tsx - UPDATED with DateRangePicker
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DateRangePicker } from "@/components/DateRangePicker"
import { useNavigate } from "react-router-dom"
import {
  Search,
  ArrowLeft,
  CheckCircle,
  Calendar,
  User,
  Car,
  MapPin,
  Clock,
  MessageCircle,
  X,
  RefreshCw,
} from "lucide-react"
import { api } from "@/lib/api"

/* ========== Types ========== */
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

interface ResolvedAlert {
  alert_id: string
  title: string
  description: string
  type: AlertType
  vehicle: string
  driver: string
  location: string
  event_date: string | null
  event_time: string | null
  alert_occurred_at: string | null
  resolved_by: string | null
  resolved_by_user: string | null
  resolved_at: string
  original_created_at: string | null
  comments: Comment[]
  action_plan: ActionStep[]
}

/* ========== Helpers ========== */
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

function loadSessionCreds(): { username: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem("fleet_auth")
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p?.isAuth && p?.username && p?.password) return { username: p.username, password: p.password }
  } catch {}
  return null
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—"
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return String(dateStr)
  }
}

function formatDateTime(isoStr: string | null) {
  if (!isoStr) return "—"
  try {
    return new Date(isoStr).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return String(isoStr)
  }
}

/* ========== Page Component ========== */
export default function ResolvedAlerts() {
  const navigate = useNavigate()

  /* --- Période gérée par DateRangePicker --- */
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    const f = localStorage.getItem("resolvedFrom")
    const t = localStorage.getItem("resolvedTo")
    if (f && t) return { from: new Date(f), to: new Date(t) }
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 jours
    return { from, to }
  })

  /* --- State --- */
  const [alerts, setAlerts] = useState<ResolvedAlert[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailAlert, setDetailAlert] = useState<ResolvedAlert | null>(null)

  /* --- Company --- */
  const company = useMemo(() => {
    const creds = loadSessionCreds()
    return companyFromUsername(creds?.username)
  }, [])

  /* --- Load from PostgreSQL ONLY --- */
  useEffect(() => {
    fetchFromDatabase(range.from, range.to)
  }, [company])

  async function fetchFromDatabase(from: Date, to: Date) {
    setLoading(true)
    setLoadError(null)

    try {
      const since = from.toISOString()
      const until = to.toISOString()

      console.log(`📦 Loading resolved alerts from PostgreSQL for company: ${company}`)
      console.log(`📅 Period: ${since} → ${until}`)

      const response = await api.alertsDoneGet(company, since, until)

      if (!response.ok) {
        throw new Error(response.error || "Failed to load resolved alerts")
      }

      console.log(`✅ Loaded ${response.count} resolved alerts from database`)

      // Parse JSON fields
      const parsed: ResolvedAlert[] = response.rows.map((row: any) => ({
        alert_id: row.alert_id,
        title: row.title || "Sans titre",
        description: row.description || "",
        type: (row.type as AlertType) || "success",
        vehicle: row.vehicle || "—",
        driver: row.driver || "—",
        location: row.location || "—",
        event_date: row.event_date,
        event_time: row.event_time,
        alert_occurred_at: row.alert_occurred_at,
        resolved_by: row.resolved_by,
        resolved_by_user: row.resolved_by_user,
        resolved_at: row.resolved_at,
        original_created_at: row.original_created_at,
        comments: Array.isArray(row.comments) 
          ? row.comments 
          : (typeof row.comments === 'string' ? JSON.parse(row.comments || '[]') : []),
        action_plan: Array.isArray(row.action_plan) 
          ? row.action_plan 
          : (typeof row.action_plan === 'string' ? JSON.parse(row.action_plan || '[]') : []),
      }))

      console.log("📊 Sample alert:", parsed[0])

      setAlerts(parsed)
    } catch (e: any) {
      console.error("❌ Failed to load resolved alerts:", e)
      setLoadError(e?.message || "Erreur lors du chargement des alertes traitées")
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  /* --- Filtering --- */
  const filteredAlerts = alerts.filter((a) => {
    const q = searchTerm.toLowerCase()
    return (
      a.title.toLowerCase().includes(q) ||
      a.driver.toLowerCase().includes(q) ||
      a.vehicle.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q)
    )
  })

  /* --- UI Helpers --- */
  const getBadgeColor = (type: AlertType) =>
    type === "critical" ? "bg-red-500 text-white" 
    : type === "warning" ? "bg-yellow-500 text-white" 
    : "bg-green-500 text-white"

  const getAlertBgColor = (type: AlertType) =>
    type === "critical" ? "bg-red-50 border-l-4 border-red-500"
    : type === "warning" ? "bg-yellow-50 border-l-4 border-yellow-500"
    : "bg-green-50 border-l-4 border-green-500"

  /* ========== RENDER ========== */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/alerts")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour aux alertes
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Alertes traitées</h1>
                <p className="text-gray-600 mt-1">
                  Historique des alertes résolues ({filteredAlerts.length})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchFromDatabase(range.from, range.to)}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Rafraîchir
              </Button>
            </div>
          </div>

          {/* Sélecteur de période avec DateRangePicker */}
<DateRangePicker
  onRangeChange={(from, to) => {
    setRange({ from, to })
    fetchAll(from, to)  // Adaptez le nom de votre fonction
  }}
  storageKey="kpiRange"  // Adaptez selon la page
  showQuickFilters={true}
/>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher par titre, conducteur, véhicule, localisation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {loadError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
              ❌ {loadError}
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          {loading ? (
            <div className="text-sm text-gray-500">Chargement...</div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm 
                  ? "Aucune alerte traitée ne correspond à votre recherche" 
                  : "Aucune alerte traitée pour le moment"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAlerts.map((alert) => (
                <Card key={alert.alert_id} className={`${getAlertBgColor(alert.type)} transition-all`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <Badge className={`${getBadgeColor(alert.type)} text-xs font-medium px-2 py-1`}>
                        {alert.type === "critical" ? "CRITIQUE" 
                         : alert.type === "warning" ? "AVERTISSEMENT" 
                         : "TRAITÉ"}
                      </Badge>
                      <Badge className="bg-green-600 text-white text-xs px-2 py-1">
                        ✓ Résolu
                      </Badge>
                    </div>

                    <h3 className="font-semibold text-base mb-2">{alert.title}</h3>

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
                        <span className="truncate">{alert.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        <span className="text-xs">
                          {alert.event_date || formatDate(alert.alert_occurred_at)} à {alert.event_time || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>Résolu: {formatDateTime(alert.resolved_at)}</span>
                      </div>
                      {alert.resolved_by_user && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <User className="h-3 w-3" />
                          <span>Par: {alert.resolved_by_user}</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailAlert(alert)}
                        className="w-full mt-2"
                      >
                        Voir détails
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL DÉTAILS */}
      <Dialog open={!!detailAlert} onOpenChange={() => setDetailAlert(null)}>
        <DialogContent className="max-w-2xl bg-white border shadow-xl z-50">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  {detailAlert?.title}
                </DialogTitle>
                <p className="text-sm text-gray-600">
                  Alerte traitée #{detailAlert?.alert_id}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetailAlert(null)} className="h-6 w-6 p-0">
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>

          {detailAlert && (
            <div className="space-y-6">
              <div className="flex gap-2">
                <Badge className={getBadgeColor(detailAlert.type)}>
                  {detailAlert.type === "critical" ? "Critique" 
                   : detailAlert.type === "warning" ? "Avertissement" 
                   : "Succès"}
                </Badge>
                <Badge className="bg-green-600 text-white">✓ Résolu</Badge>
              </div>

              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                  {detailAlert.description || "Aucune description"}
                </p>
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
                      <p className="text-xs text-gray-500">Date événement</p>
                      <p className="font-medium">
                        {detailAlert.event_date || formatDate(detailAlert.alert_occurred_at)} à {detailAlert.event_time || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Alerte résolue</span>
                </div>
                <p className="text-sm text-green-700">
                  Résolue le {formatDateTime(detailAlert.resolved_at)}
                  {detailAlert.resolved_by_user && ` par ${detailAlert.resolved_by_user}`}
                </p>
                {detailAlert.original_created_at && (
                  <p className="text-xs text-green-600 mt-1">
                    Créée le {formatDateTime(detailAlert.original_created_at)}
                  </p>
                )}
              </div>

              {detailAlert.action_plan.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Plan d'actions réalisé</h4>
                  <div className="space-y-2">
                    {detailAlert.action_plan.map((step) => (
                      <div key={step.id} className="flex items-center gap-2 text-sm">
                        <CheckCircle className={`h-4 w-4 ${step.done ? 'text-green-600' : 'text-gray-300'}`} />
                        <span className={step.done ? "text-gray-900" : "text-gray-500 line-through"}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDetailAlert(null)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}