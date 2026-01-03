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
} from "recharts"
import { api } from "@/lib/api"

/* ---------- Helpers période ---------- */
function toIsoLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  return { from, to }
}
function readRangeFromStorage() {
  const f = localStorage.getItem("kpiFrom")
  const t = localStorage.getItem("kpiTo")
  if (f && t) return { from: new Date(f), to: new Date(t) }
  return defaultRange()
}
function saveRangeToStorage(from: Date, to: Date) {
  localStorage.setItem("kpiFrom", from.toISOString())
  localStorage.setItem("kpiTo", to.toISOString())
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
    fetchAll(f, t) // recharge immédiat
  }
  const setLast24h = () => {
    const { from, to } = defaultRange()
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRangeToStorage(from, to)
    setRange({ from, to })
    fetchAll(from, to)
  }
  const setLast7d = () => {
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRangeToStorage(from, to)
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

  /* Données pour graphe Top Conso */
  const [fuelBars, setFuelBars] = useState<{ name: string; fuel: number }[]>([])
  const TOP_N = 6

  /* Données pour les 2 diagrammes (comptages réels, liés à la période) */
  const [statusCounts, setStatusCounts] = useState({ service: 0, attente: 0, maintenance: 0, horsLigne: 0 })
  const [violationCounts, setViolationCounts] = useState({ speed: 0, stop: 0, brake: 0, other: 0 })

  const [loadingKPIs, setLoadingKPIs] = useState(false)
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
    setErrorKPIs(null)
    try {
      const { from: F, to: T } = { from: from ?? range.from, to: to ?? range.to }
      const fromISO = F.toISOString()
      const toISO = T.toISOString()

      // 1) Devices
      const devs = await api.devices()
      const ids: number[] = Array.isArray(devs) ? devs.map((d: any) => Number(d.id)).filter(Number.isFinite) : []
      setTotalDevices(ids.length)
      if (ids.length === 0) throw new Error("Aucun véhicule trouvé")

      // 2) Endpoints principaux (aggrégés)
      const [avg, max, fuel, act, dist, me, ev] = await Promise.all([
        api.averageSpeed(ids, fromISO, toISO),
        api.maxSpeed(ids, fromISO, toISO),
        api.avgFuel(ids, fromISO, toISO),
        api.activeDevices(ids, fromISO, toISO),
        api.totalDistance(ids, fromISO, toISO),
        api.maintenanceEfficiency(ids, fromISO, toISO),
        api.vehicleAlerts(ids, fromISO, toISO),
      ])

      setSpeedAvg(Number(avg?.averageSpeed || 0))
      setSpeedMax(Number(max?.maxSpeed || 0))
      setFuelAvg(Number(fuel?.averageFuel || 0))
      setFuelTotal(Number(fuel?.totalFuel || 0))
      setActiveCount(Number(act?.count || 0))
      setDistanceTotalKm(Number(dist?.totalKm || 0))
      setMaintenanceEff(Number(me?.efficiency || 0))

      // --------- Alerts : comptages réels & breakdowns ----------
      const rows = Array.isArray(ev?.rows) ? ev.rows : []
      const totalAlerts = Number(rows.reduce((s: number, r: any) => s + (Number(r?.alertCount) || 0), 0)) || 0
      setAlertsCount(totalAlerts)

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

          // catégories d'alertes (pondérées par occurrences si dispo)
          const weight = Number(r?.alertCount) || 1
          const labels: string[] = Array.isArray(r?.alerts) ? r.alerts : []
          if (labels.length === 0) {
            cat.other += weight
          } else {
            for (const L of labels) {
              const k = classifyAlert(String(L))
              ;(cat as any)[k] += 1 // 1 par type distinct
            }
          }
        }
        setStatusCounts(st)
        setViolationCounts(cat)
      }

      /* ---- Graphe Top N consommation : calcul par device ---- */
      const nameById = new Map<number, string>()
      Array.isArray(devs) && devs.forEach((d: any) => {
        const id = Number(d?.id)
        if (!Number.isFinite(id)) return
        const plate = d?.attributes?.plate || d?.uniqueId || ""
        const friendly = d?.name || (plate ? String(plate) : String(id))
        nameById.set(id, friendly)
      })

      const jobs = ids.map((id) => async () => {
        const r = await api.avgFuel([id], fromISO, toISO)
        return { id, totalFuel: Number(r?.totalFuel || 0) }
      })
      const perDev = await runPool(jobs, 8)

      const bars = perDev
        .filter(Boolean)
        .sort((a, b) => (b.totalFuel || 0) - (a.totalFuel || 0))
        .slice(0, TOP_N)
        .map(({ id, totalFuel }) => {
          const label = nameById.get(id) || String(id)
          const short = label.length > 12 ? label.slice(-6) : label
          return { name: short, fuel: Number(totalFuel.toFixed(1)) }
        })

      setFuelBars(bars)
    } catch (e: any) {
      setErrorKPIs(e?.message || "Erreur de chargement")
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
          <Button variant="outline" onClick={setLast24h}>Dernières 24h</Button>
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
      {loadingKPIs && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Chargement des données...</span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {visibleKpis.speedAvg && (
          <KPICard title="Vitesse Moyenne" value={`${speedAvg.toFixed(1)} km/h`} subtitle="moyenne sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: true }} status="success" icon={<Gauge />} />
        )}
        {visibleKpis.speedMax && (
          <KPICard title="Vitesse Max" value={`${Math.round(speedMax)} km/h`} subtitle="pointée sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: false }} status="warning" icon={<Gauge />} />
        )}
        {visibleKpis.fuelAvg && (
          <KPICard title="Niveau Carburant Moyen" value={`${fuelAvg.toFixed(1)} L/trajet`} subtitle="moyenne trajets" trend={{ value: loadingKPIs ? "…" : "", isPositive: fuelAvg <= 0.5 }} status={fuelAvg <= 0.5 ? "success" : "warning"} icon={<Fuel />} />
        )}
        {visibleKpis.fuelTotal && (
          <KPICard title="Consommation Totale" value={`${fuelTotal.toFixed(1)} L`} subtitle="sur la période" trend={{ value: loadingKPIs ? "…" : "", isPositive: false }} status="info" icon={<Fuel />} />
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
        {visibleKpis.alerts && (
          <KPICard title="Alertes (événements)" value={alertsCount} subtitle="toutes catégories" trend={{ value: loadingKPIs ? "…" : "", isPositive: alertsCount === 0 }} status={alertsCount > 5 ? "danger" : alertsCount > 0 ? "warning" : "success"} icon={<AlertTriangle />} />
        )}
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
                     label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}>
                  {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
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
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {violationsPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {errorKPIs && <div className="text-sm text-red-600">{errorKPIs}</div>}
    </div>
  )
}

/* --------- petit helper de parallélisation des requêtes --------- */
async function runPool<T>(jobs: (() => Promise<T>)[], concurrency = 8): Promise<T[]> {
  const out: T[] = []
  let i = 0
  const workers = new Array(Math.min(concurrency, jobs.length)).fill(0).map(async () => {
    while (i < jobs.length) {
      const idx = i++
      try { out[idx] = await jobs[idx]() } catch { /* ignore */ }
    }
  })
  await Promise.all(workers)
  return out
}
