import { useEffect, useMemo, useState } from "react"
import { KPICard } from "@/components/KPICard"
import { FilterComparisonBlock } from "@/components/FilterComparisonBlock"
import { DateRangePicker } from "@/components/DateRangePicker"
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
  LogIn,
  LogOut,
  ShieldCheck,
  Gauge,
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
type AuthState = { isAuth: boolean; username: string | null }

/* ===================== */
/*        LOGIN BAR      */
/* ===================== */
function LoginBar({ onLogged }: { onLogged?: () => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthState>({ isAuth: false, username: null })

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("fleet_auth")
      if (saved) {
        const p = JSON.parse(saved)
        if (p?.isAuth && p?.username) setAuth({ isAuth: true, username: p.username })
      }
    } catch {}
  }, [])

  const saveSession = (u: string, p: string) =>
    sessionStorage.setItem("fleet_auth", JSON.stringify({ isAuth: true, username: u, password: p }))

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.login(username, password)
      saveSession(username, password)
      setAuth({ isAuth: true, username })
      setPassword("")
      onLogged?.()
    } catch (err: any) {
      setError(err?.message || "Erreur de connexion")
    } finally {
      setLoading(false)
    }
  }

  const onLogout = () => {
    sessionStorage.removeItem("fleet_auth")
    setAuth({ isAuth: false, username: null })
    setUsername("")
    setPassword("")
    setError(null)
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Accès – Authentification
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
        {!auth.isAuth ? (
          <>
            <div className="w-full md:w-56">
              <label className="block text-sm mb-1">Nom d'utilisateur</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex: john.doe" autoComplete="username" />
            </div>
            <div className="w-full md:w-56">
              <label className="block text-sm mb-1">Mot de passe</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <Button onClick={onLogin} disabled={loading} className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
            {error && <span className="text-sm text-red-600 mt-2 md:mt-0">{error}</span>}
          </>
        ) : (
          <div className="flex w-full items-center justify-between">
            <div className="text-sm">
              Connecté en tant que <span className="font-semibold">{auth.username}</span>
            </div>
            <Button variant="outline" onClick={onLogout} className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
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

  /* Période - gérée par le composant DateRangePicker */
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => {
    const f = localStorage.getItem("kpiFrom")
    const t = localStorage.getItem("kpiTo")
    if (f && t) return { from: new Date(f), to: new Date(t) }
    const to = new Date()
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
    return { from, to }
  })

  /* Données KPI */
  const [totalDevices, setTotalDevices] = useState(0)
  const [speedAvg, setSpeedAvg] = useState(0)
  const [speedMax, setSpeedMax] = useState(0)
  const [fuelAvg, setFuelAvg] = useState(0)
  const [fuelTotal, setFuelTotal] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [distanceTotalKm, setDistanceTotalKm] = useState(0)
  const [maintenanceEff, setMaintenanceEff] = useState(0)
  const [alertsCount, setAlertsCount] = useState(0)

  /* Données pour graphe Top Conso */
  const [fuelBars, setFuelBars] = useState<{ name: string; fuel: number }[]>([])
  const TOP_N = 6

  /* Données pour les 2 diagrammes */
  const [statusCounts, setStatusCounts] = useState({ service: 0, attente: 0, maintenance: 0, horsLigne: 0 })
  const [violationCounts, setViolationCounts] = useState({ speed: 0, stop: 0, brake: 0, other: 0 })

  const [loadingKPIs, setLoadingKPIs] = useState(false)
  const [errorKPIs, setErrorKPIs] = useState<string | null>(null)

  /* Helpers de classement côté front */
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
  async function fetchAll(from: Date, to: Date) {
    setLoadingKPIs(true)
    setErrorKPIs(null)
    try {
      const fromISO = from.toISOString()
      const toISO = to.toISOString()

      const devs = await api.devices()
      const ids: number[] = Array.isArray(devs) ? devs.map((d: any) => Number(d.id)).filter(Number.isFinite) : []
      setTotalDevices(ids.length)
      if (ids.length === 0) throw new Error("Aucun véhicule trouvé")

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

      const rows = Array.isArray(ev?.rows) ? ev.rows : []
      const totalAlerts = Number(rows.reduce((s: number, r: any) => s + (Number(r?.alertCount) || 0), 0)) || 0
      setAlertsCount(totalAlerts)

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
        const st = { service: 0, attente: 0, maintenance: 0, horsLigne: 0 }
        const cat = { speed: 0, stop: 0, brake: 0, other: 0 }

        for (const r of rows) {
          st[stateKeyToBucket(r?.state)]++
          const weight = Number(r?.alertCount) || 1
          const labels: string[] = Array.isArray(r?.alerts) ? r.alerts : []
          if (labels.length === 0) {
            cat.other += weight
          } else {
            for (const L of labels) {
              const k = classifyAlert(String(L))
              ;(cat as any)[k] += 1
            }
          }
        }
        setStatusCounts(st)
        setViolationCounts(cat)
      }

      /* Top N consommation */
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

  const isAlreadyLogged = useMemo(() => {
    try {
      const saved = sessionStorage.getItem("fleet_auth")
      if (!saved) return false
      const p = JSON.parse(saved)
      return !!(p?.isAuth && p?.username && p?.password)
    } catch { return false }
  }, [])
  
  useEffect(() => { 
    if (isAlreadyLogged) fetchAll(range.from, range.to) 
  }, [isAlreadyLogged])

  /* Données pour les 2 pie charts */
  const statusPie = [
    { name: "En Service",  value: statusCounts.service,     color: "hsl(var(--success))" },
    { name: "En Attente",  value: statusCounts.attente,     color: "hsl(var(--warning))" },
    { name: "Maintenance", value: statusCounts.maintenance, color: "hsl(var(--info))" },
    { name: "Hors Ligne",  value: statusCounts.horsLigne,   color: "hsl(var(--danger))" },
  ]
  const violationsPie = [
    { name: "Excès de vitesse", value: violationCounts.speed, color: "hsl(200,70%,50%)" },
    { name: "Temps d'arrêt",    value: violationCounts.stop,  color: "hsl(270,70%,50%)" },
    { name: "Freinage brusque", value: violationCounts.brake, color: "hsl(340,70%,50%)" },
    { name: "Autres",           value: violationCounts.other, color: "hsl(30,70%,50%)" },
  ]

  return (
    <div className="space-y-6">
      <LoginBar onLogged={() => fetchAll(range.from, range.to)} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold">Tableau de Bord</h1>

        {/* Sélecteur de période avec DateRangePicker */}
        <div className="flex items-center gap-3">
          <DateRangePicker
            onRangeChange={(from, to) => {
              setRange({ from, to })
              fetchAll(from, to)
            }}
            storageKey="kpiRange"
            showQuickFilters={true}
          />

          {/* Menu visibilité KPI */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                KPIs
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
              <DropdownMenuCheckboxItem checked={visibleKpis.alerts} onCheckedChange={() => toggleKpi("alerts")}>Alertes</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* GRILLE KPI */}
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

      <FilterComparisonBlock />

      {/* Graphiques avec légendes améliorées */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Fuel className="h-5 w-5 mr-2" />
              Top {TOP_N} – Consommation (L)
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

        {/* ✅ Graphique Statuts avec légende claire */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Répartition des Statuts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie 
                    data={statusPie} 
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    outerRadius={80}
                  >
                    {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} véhicule(s)`, name]} />
                </PieChart>
              </ResponsiveContainer>
              
              {/* Légende personnalisée avec couleurs, noms et pourcentages */}
              <div className="space-y-2 px-2">
                {statusPie.map((item) => {
                  const total = statusPie.reduce((sum, i) => sum + i.value, 0)
                  const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
                  return (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded flex-shrink-0" 
                          style={{ backgroundColor: item.color }} 
                        />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="font-semibold text-right">
                        {item.value} <span className="text-muted-foreground">({percent}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ✅ Graphique Violations avec légende claire */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Types de Violations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={violationsPie}
                    dataKey="value" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={40} 
                    outerRadius={80}
                  >
                    {violationsPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} violation(s)`, name]} />
                </PieChart>
              </ResponsiveContainer>

              {/* Légende personnalisée avec couleurs, noms et pourcentages */}
              <div className="space-y-2 px-2">
                {violationsPie.map((item) => {
                  const total = violationsPie.reduce((sum, i) => sum + i.value, 0)
                  const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
                  return (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded flex-shrink-0" 
                          style={{ backgroundColor: item.color }} 
                        />
                        <span className="font-medium">{item.name}</span>
                      </div>
                      <div className="font-semibold text-right">
                        {item.value} <span className="text-muted-foreground">({percent}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {errorKPIs && <div className="text-sm text-red-600">{errorKPIs}</div>}
    </div>
  )
}

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