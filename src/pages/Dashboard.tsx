import { useEffect, useState } from "react"
import { KPICard } from "@/components/KPICard"
import { FilterComparisonBlock } from "@/components/FilterComparisonBlock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  Truck,
  Fuel,
  AlertTriangle,
  TrendingUp,
  SlidersHorizontal,
  Gauge,
  RefreshCw,
  Loader2,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { api } from "@/lib/api"

/* ---------- Helpers période ---------- */
function toIsoLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function defaultRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date()
  to.setHours(23, 59, 0, 0)
  return { from, to }
}

/* ---------- Types UI ---------- */
type VisibleKpis = {
  speedAvg: boolean
  speedMax: boolean
  fuelAvg: boolean
  fuelTotal: boolean
  activeVehicles: boolean
  distanceTotal: boolean
  maintenanceEff: boolean
  alerts: boolean
}

/* ===================== */
/*       DASHBOARD       */
/* ===================== */
export default function Dashboard() {
  /* Visibilité KPI */
  const [visibleKpis, setVisibleKpis] = useState<VisibleKpis>(() => {
    const saved = localStorage.getItem("visibleKpis")
    return saved
      ? JSON.parse(saved)
      : {
          speedAvg: true,
          speedMax: true,
          fuelAvg: true,
          fuelTotal: true,
          activeVehicles: true,
          distanceTotal: true,
          maintenanceEff: true,
          alerts: true,
        }
  })
  useEffect(() => { localStorage.setItem("visibleKpis", JSON.stringify(visibleKpis)) }, [visibleKpis])
  const toggleKpi = (key: keyof VisibleKpis) => setVisibleKpis(p => ({ ...p, [key]: !p[key] }))

  /* Période contrôlée par l’utilisateur */
  const initial = defaultRange()
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
    setRange({ from: f, to: t })
    fetchAll(f, t)
  }
  const setToday = () => {
    const { from, to } = defaultRange()
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    setRange({ from, to })
    fetchAll(from, to)
  }
  const setLast7d = () => {
    const to = new Date()
    to.setHours(23, 59, 0, 0)
    const from = new Date()
    from.setDate(from.getDate() - 6)
    from.setHours(0, 0, 0, 0)
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    setRange({ from, to })
    fetchAll(from, to)
  }

  /* Données KPI */
  const [totalDevices, setTotalDevices] = useState(0)
  const [speedAvg, setSpeedAvg] = useState(0)
  const [speedMax, setSpeedMax] = useState(0)
  const [fuelAvg, setFuelAvg] = useState(0)     // L/trajet
  const [fuelTotal, setFuelTotal] = useState(0) // L
  const [activeCount, setActiveCount] = useState(0)
  const [distanceTotalKm, setDistanceTotalKm] = useState(0)
  const [maintenanceEff, setMaintenanceEff] = useState(0) // %
  const [alertsCount, setAlertsCount] = useState(0)
  const [alertCategory, setAlertCategory] = useState<string>("all")
  const [alertTypeCounts, setAlertTypeCounts] = useState<Record<string, number>>({})

  /* Données pour graphe Top Conso */
  const [fuelBars, setFuelBars] = useState<{ name: string; fuel: number }[]>([])
  const TOP_N = 6

  /* Données pour les 2 diagrammes (comptages réels, liés à la période) */
  const [statusCounts, setStatusCounts] = useState({ service: 0, attente: 0, maintenance: 0, horsLigne: 0 })
  const [violationCounts, setViolationCounts] = useState({ speed: 0, stop: 0, brake: 0, other: 0 })

  const [loadingKPIs, setLoadingKPIs] = useState(false)
  const [loadTime, setLoadTime] = useState<string | null>(null)
  const [errorKPIs, setErrorKPIs] = useState<string | null>(null)

  /* Helpers de classement côté front si pas de summary côté serveur */
  const classifyAlert = (label: string) => {
    const l = (label || "").toLowerCase()
    if (l.includes("speed") || l.includes("vitesse") || l.includes("overspeed") || l.includes("excès")) return "speed"
    if (l.includes("idle") || l.includes("arrêt") || l.includes("arret") || l.includes("stop")) return "stop"
    if (l.includes("brak") || l.includes("frein")) return "brake"
    return "other"
  }
  const stateKeyToBucket = (state?: string) => {
    switch ((state || "").toLowerCase()) {
      case "en_service":
      case "service":
      case "running":
        return "service"
      case "idle":
        return "attente"
      case "maintenance":
        return "maintenance"
      case "arret":
      case "hors_service":
      case "off":
      case "stopped":
      default:
        return "horsLigne"
    }
  }

  /* Chargement API */
  async function fetchAll(from?: Date, to?: Date) {
    setLoadingKPIs(true)
    setLoadTime(null)
    setErrorKPIs(null)
    const t0 = performance.now()
    try {
      const { from: F, to: T } = { from: from ?? range.from, to: to ?? range.to }
      const fromISO = F.toISOString()
      const toISO = T.toISOString()

      // 1) Devices
      const devs = await api.devices()
      const ids: number[] = Array.isArray(devs) ? devs.map((d: any) => Number(d.id)).filter(Number.isFinite) : []
      setTotalDevices(ids.length)
      if (ids.length === 0) throw new Error("Aucun véhicule trouvé")

      // 2) Dashboard KPIs + vehicle alerts fetched in parallel (events are expensive, kept separate)
      const [d, evResponse] = await Promise.all([
        api.dashboard(ids, fromISO, toISO),
        api.vehicleAlerts(ids, fromISO, toISO),
      ])

      setSpeedAvg(Number(d?.averageSpeed?.averageSpeed || 0))
      setSpeedMax(Number(d?.maxSpeed?.maxSpeed || 0))
      setFuelAvg(Number(d?.avgFuel?.avgConsumption || 0))
      setFuelTotal(Number(d?.avgFuel?.totalFuel || 0))
      setActiveCount(Number(d?.activeDevices?.count || 0))
      setDistanceTotalKm(Number(d?.totalDistance?.totalKm || 0))
      setMaintenanceEff(Number(d?.maintenance?.efficiency || 0))

      const fuel = d?.avgFuel
      const ev = evResponse

      // --------- Alerts : comptages réels & breakdowns ----------
      const rows = Array.isArray(ev?.rows) ? ev.rows : []
      const totalAlerts = Number(rows.reduce((s: number, r: any) => s + (Number(r?.alertCount) || 0), 0)) || 0
      setAlertsCount(totalAlerts)

      // Compute per-type counts from raw alert labels for dynamic filter
      const typeCounts: Record<string, number> = {}
      for (const r of rows) {
        const alertCounts: Record<string, number> = r?.alertCounts ?? {}
        const labels: string[] = Array.isArray(r?.alerts) ? r.alerts : []
        for (const L of labels) {
          const key = String(L)
          typeCounts[key] = (typeCounts[key] || 0) + (alertCounts[L] ?? 1)
        }
      }
      setAlertTypeCounts(typeCounts)

      // Si le serveur renvoie un summary, on l'utilise
      if (ev?.summary) {
        const st = ev.summary.states || {}
        const cat = ev.summary.categories || {}
        setStatusCounts({
          service: Number(st.en_service || st.service || 0),
          attente: Number(st.idle || 0),
          maintenance: Number(st.maintenance || 0),
          horsLigne: Number(st.arret || st.hors_service || 0),
        })
        setViolationCounts({
          speed: Number(cat.speed || cat.speeding || 0),
          stop: Number(cat.stop || cat.idle || 0),
          brake: Number(cat.brake || cat.harsh_braking || 0),
          other: Number(cat.other || 0),
        })
      } else {
        // Fallback: calcul côté client à partir de rows
        const st = { service: 0, attente: 0, maintenance: 0, horsLigne: 0 }
        const cat = { speed: 0, stop: 0, brake: 0, other: 0 }

        for (const r of rows) {
          // état du véhicule (dernier état connu pour la période)
          st[stateKeyToBucket(r?.state)]++

          const alertCounts: Record<string, number> = r?.alertCounts ?? {}
          const labels: string[] = Array.isArray(r?.alerts) ? r.alerts : []
          if (labels.length === 0) {
            cat.other += Number(r?.alertCount) || 0
          } else {
            for (const L of labels) {
              const k = classifyAlert(String(L))
              ;(cat as any)[k] += alertCounts[L] ?? 1
            }
          }
        }
        setStatusCounts(st)
        setViolationCounts(cat)
      }

      /* ---- Graphe Top N consommation : from perDevice breakdown ---- */
      const nameById = new Map<number, string>()
      Array.isArray(devs) && devs.forEach((d: any) => {
        const id = Number(d?.id)
        if (!Number.isFinite(id)) return
        const plate = d?.attributes?.plate || d?.uniqueId || ""
        const friendly = d?.name || (plate ? String(plate) : String(id))
        nameById.set(id, friendly)
      })

      const perDev: { deviceId: number; totalFuel: number }[] = Array.isArray(fuel?.perDevice) ? fuel.perDevice : []

      const bars = perDev
        .filter((d) => d.totalFuel > 0)
        .sort((a, b) => b.totalFuel - a.totalFuel)
        .slice(0, TOP_N)
        .map(({ deviceId, totalFuel }) => {
          const label = nameById.get(deviceId) || String(deviceId)
          const short = label.length > 12 ? label.slice(-6) : label
          return { name: short, fuel: Number(totalFuel.toFixed(1)) }
        })

      setFuelBars(bars)
      setLoadTime(`${((performance.now() - t0) / 1000).toFixed(1)}s`)
    } catch (e: any) {
      const msg = e?.message || "Erreur inconnue"
      const detail = msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")
        ? `Impossible de contacter le serveur: ${msg}`
        : msg.includes("credentials") || msg.includes("401") || msg.includes("403")
        ? `Authentification échouée: ${msg}`
        : msg.includes("no_devices") || msg.includes("Aucun")
        ? msg
        : `Erreur de chargement: ${msg}`
      setErrorKPIs(detail)
    } finally {
      setLoadingKPIs(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  /* Données pour les 2 pie charts (à partir des comptages) */
  const statusPie = [
    { name: "En Service",  value: statusCounts.horsLigne,    color: "hsl(var(--success))" },
    { name: "En Attente",  value: statusCounts.attente,     color: "hsl(var(--warning))" },
    { name: "Maintenance", value: statusCounts.maintenance, color: "hsl(var(--info))" },
    { name: "Hors Ligne",    value: statusCounts.service,  color: "hsl(var(--danger))" },
  ]
  const violationsPie = [
    { name: "Excès de vitesse", value: violationCounts.speed, color: "hsl(200,70%,50%)" },
    { name: "Temps d'arrêt",    value: violationCounts.stop,  color: "hsl(270,70%,50%)" },
    { name: "Freinage brusque", value: violationCounts.brake, color: "hsl(340,70%,50%)" },
    { name: "Autres",           value: violationCounts.other, color: "hsl(30,70%,50%)" },
  ]

  return (
    <div className="space-y-6">

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Tableau de Bord</h1>

        {/* ---- Sélecteur de période (De ... À ...) ---- */}
        <div className="flex flex-col md:flex-row md:items-end gap-2">
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
          <Button variant="outline" onClick={setToday}>Aujourd'hui</Button>
          <Button variant="outline" onClick={setLast7d}>7 jours</Button>

          {rangeError && <span className="text-xs text-danger ml-1">{rangeError}</span>}
        </div>

        {/* Menu visibilité KPI */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              KPIs affichés
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Afficher / masquer</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={visibleKpis.speedAvg} onCheckedChange={() => toggleKpi("speedAvg")}>Vitesse Moyenne</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.speedMax} onCheckedChange={() => toggleKpi("speedMax")}>Vitesse Max</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.fuelAvg} onCheckedChange={() => toggleKpi("fuelAvg")}>Niveau Carburant Moyen</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.fuelTotal} onCheckedChange={() => toggleKpi("fuelTotal")}>Consommation Totale</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.activeVehicles} onCheckedChange={() => toggleKpi("activeVehicles")}>Véhicules actifs</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.distanceTotal} onCheckedChange={() => toggleKpi("distanceTotal")}>Distance Totale</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.maintenanceEff} onCheckedChange={() => toggleKpi("maintenanceEff")}>Efficacité Maintenance</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={visibleKpis.alerts} onCheckedChange={() => toggleKpi("alerts")}>Alertes (événements)</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* GRILLE KPI */}
      {loadingKPIs ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Chargement des données…</span>
        </div>
      ) : errorKPIs ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorKPIs}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => fetchAll()}>Réessayer</Button>
        </div>
      ) : loadTime ? (
        <div className="text-xs text-muted-foreground">Chargé en {loadTime}</div>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visibleKpis.speedAvg && (
          <KPICard title="Vitesse Moyenne" value={`${speedAvg.toFixed(1)} km/h`} subtitle="moyenne sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: true }} status="success" icon={<Gauge />} />
        )}
        {visibleKpis.speedMax && (
          <KPICard title="Vitesse Max" value={`${Math.round(speedMax)} km/h`} subtitle="pointée sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: false }} status="warning" icon={<Gauge />} />
        )}
        {visibleKpis.fuelAvg && (
          <KPICard title="Consommation moyenne carburant au 100 km" value={`${fuelAvg.toFixed(2)} L/100km`} trend={{ value: loadingKPIs ? "…" : "", isPositive: fuelAvg <= 0.5 }} status={fuelAvg <= 0.5 ? "success" : "warning"} icon={<Fuel />} />
        )}
        {visibleKpis.fuelTotal && (
          <KPICard title="Consommation Totale" value={`${fuelTotal.toFixed(2)} L`} subtitle="sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: false }} status="info" icon={<Fuel />} />
        )}
        {visibleKpis.activeVehicles && (
          <KPICard title="Véhicules actifs" value={`${activeCount}/${totalDevices}`} subtitle="ont roulé sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: true }} status="success" icon={<Truck />} />
        )}
        {visibleKpis.distanceTotal && (
          <KPICard title="Distance Totale" value={`${Math.round(distanceTotalKm).toLocaleString()} km`} subtitle="tous véhicules" trend={{ value: loadingKPIs ? "…" : "", isPositive: true }} status="info" icon={<TrendingUp />} />
        )}
        {visibleKpis.maintenanceEff && (
          <KPICard title="Efficacité Maintenance" value={`${maintenanceEff.toFixed(0)}%`} subtitle="respect des intervalles" trend={{ value: loadingKPIs ? "…" : "", isPositive: maintenanceEff >= 80 }} status={maintenanceEff >= 80 ? "success" : maintenanceEff >= 50 ? "warning" : "danger"} icon={<TrendingUp />} />
        )}
        {visibleKpis.alerts && (() => {
          const categoryOptions = [
            { key: "all", label: "Toutes catégories", count: alertsCount },
            ...Object.entries(alertTypeCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => ({ key, label: key, count })),
          ]
          const selected = categoryOptions.find(o => o.key === alertCategory) ?? categoryOptions[0]
          const status = selected.count > 5 ? "text-danger" : selected.count > 0 ? "text-warning" : "text-success"
          return (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Alertes (événements)</CardTitle>
                <div className={cn("h-4 w-4", status)}><AlertTriangle /></div>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", status)}>{selected.count}</div>
                <Select value={alertCategory} onValueChange={setAlertCategory}>
                  <SelectTrigger className="h-7 text-xs mt-1 px-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border shadow-lg z-50">
                    {categoryOptions.map(o => (
                      <SelectItem key={o.key} value={o.key} className="text-xs">
                        {o.label} ({o.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )
        })()}
      </div>

      {/* Bloc comparaison / filtres */}
      <FilterComparisonBlock />

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top N – Consommation (L) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Fuel className="h-5 w-5 mr-2" />
              Top {TOP_N} – Consommation (L) sur la période
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={fuelBars}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => [`${value} L`, "Consommation"]} />
                <Bar dataKey="fuel" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Statuts */}
        <Card>
          <CardHeader><CardTitle className="flex items-center"><Truck className="h-5 w-5 mr-2" />Répartition des Statuts</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                     label={({ value, percent }) => `${value} (${(percent * 100).toFixed(0)}%)`}
                     style={{ fontSize: '13px' }}>
                  {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Types de Violations */}
        <Card>
          <CardHeader><CardTitle className="flex items-center"><AlertTriangle className="h-5 w-5 mr-2" />Types de Violations</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={violationsPie}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={80}
                  label={({ value, percent }) => `${value} (${(percent * 100).toFixed(0)}%)`}
                  style={{ fontSize: '13px' }}
                >
                  {violationsPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
