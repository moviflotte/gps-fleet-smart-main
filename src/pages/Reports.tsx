import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { KPICard } from "@/components/KPICard"
import {
  BarChart3, TrendingUp, TrendingDown, Navigation,
  Fuel, Truck, AlertTriangle, RefreshCw, Loader2, Download,
} from "lucide-react"
import { api } from "@/lib/api"

function defaultRange() {
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(); to.setHours(23, 59, 0, 0)
  return { from, to }
}
function toIsoLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function getGroupId(d: any): string | null {
  const gid = d?.groupId ?? d?.group_id ?? d?.group?.id ?? d?.attributes?.groupId ?? null
  return gid != null ? String(gid) : null
}

type VehicleRow = {
  deviceId: number
  name: string
  distanceKm: number
  totalFuel: number
  avgConsumption: number
  tripCount: number
}
type TripRow = {
  deviceId: number
  deviceName: string
  startTime: string | null
  endTime: string | null
  startAddress: string | null
  endAddress: string | null
  distanceKm: number
  durationMin: number
  avgSpeedKmh: number
  maxSpeedKmh: number
  spentFuel: number
}

export default function Reports() {
  const { from: defFrom, to: defTo } = defaultRange()
  const [dateFrom, setDateFrom] = useState(toIsoLocal(defFrom))
  const [dateTo, setDateTo] = useState(toIsoLocal(defTo))

  const [devices, setDevices] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [listsLoading, setListsLoading] = useState(false)

  const [totalDistanceKm, setTotalDistanceKm] = useState(0)
  const [totalFuel, setTotalFuel] = useState(0)
  const [avgConsumption, setAvgConsumption] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [totalAlerts, setTotalAlerts] = useState(0)

  const [vehicleRows, setVehicleRows] = useState<VehicleRow[]>([])
  const [trips, setTrips] = useState<TripRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setListsLoading(true)
    Promise.all([api.devices(), api.groups()])
      .then(([d, g]) => {
        setDevices(Array.isArray(d) ? d : [])
        setGroups(Array.isArray(g) ? g : [])
      })
      .catch(e => setError(e?.message || "Erreur de chargement"))
      .finally(() => setListsLoading(false))
  }, [])

  useEffect(() => {
    if (devices.length > 0) fetchData()
  }, [devices]) // eslint-disable-line

  const fetchData = async () => {
    setError(null)
    setLoading(true)
    try {
      const ids = devices.map(d => Number(d.id)).filter(Number.isFinite)
      const fromISO = new Date(dateFrom).toISOString()
      const toISO = new Date(dateTo).toISOString()

      const [dist, fuel, active, alerts, perVeh, tripsRes] = await Promise.all([
        api.totalDistance(ids, fromISO, toISO),
        api.avgFuel(ids, fromISO, toISO),
        api.activeDevices(ids, fromISO, toISO),
        api.vehicleAlerts(ids, fromISO, toISO),
        api.perVehicle(ids, fromISO, toISO),
        api.tripsList(ids, fromISO, toISO),
      ])

      setTotalDistanceKm(Number(dist?.totalKm || 0))
      setTotalFuel(Number(fuel?.totalFuel || 0))
      setAvgConsumption(Number(fuel?.avgConsumption || 0))
      setActiveCount(Number(active?.count || 0))
      setTotalAlerts(
        Array.isArray(alerts?.rows)
          ? alerts.rows.reduce((s: number, r: any) => s + (Number(r.alertCount) || 0), 0)
          : 0
      )
      setVehicleRows(
        Array.isArray(perVeh?.rows)
          ? [...perVeh.rows].sort((a: VehicleRow, b: VehicleRow) => b.distanceKm - a.distanceKm)
          : []
      )
      setTrips(Array.isArray(tripsRes?.trips) ? tripsRes.trips : [])
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }

  const groupRows = useMemo(() => {
    const groupNameById = new Map<string, string>()
    for (const g of groups) groupNameById.set(String(g.id), g.name || g.id)

    const deviceById = new Map<number, any>()
    for (const d of devices) deviceById.set(Number(d.id), d)

    const byGroup = new Map<string, { name: string; vehicleCount: number; distanceKm: number; totalFuel: number }>()

    for (const row of vehicleRows) {
      const dev = deviceById.get(row.deviceId)
      const gid = dev ? getGroupId(dev) : null
      const key = gid ?? "none"
      const groupName = gid
        ? (groupNameById.get(gid) ?? dev?.group?.name ?? dev?.attributes?.groupName ?? gid)
        : "Sans groupe"
      if (!byGroup.has(key)) byGroup.set(key, { name: groupName, vehicleCount: 0, distanceKm: 0, totalFuel: 0 })
      const g = byGroup.get(key)!
      g.vehicleCount++
      g.distanceKm += row.distanceKm
      g.totalFuel += row.totalFuel
    }

    return Array.from(byGroup.values()).sort((a, b) => b.distanceKm - a.distanceKm)
  }, [vehicleRows, devices, groups])

  const mostUsed = vehicleRows[0] ?? null
  const mostEfficient = vehicleRows.filter(r => r.distanceKm > 0).sort((a, b) => a.avgConsumption - b.avgConsumption)[0] ?? null
  const worstConsumer = vehicleRows.filter(r => r.distanceKm > 0).sort((a, b) => b.avgConsumption - a.avgConsumption)[0] ?? null
  const leastUsed = vehicleRows.filter(r => r.distanceKm > 0).sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">Rapports Analytiques</h1>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs mb-1">De</label>
            <Input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-1">À</label>
            <Input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <Button onClick={fetchData} disabled={loading || listsLoading}>
            {loading
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RefreshCw className="h-4 w-4 mr-2" />}
            Actualiser
          </Button>
          <Button variant="outline" disabled>
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard
          title="Distance Totale"
          value={`${Math.round(totalDistanceKm).toLocaleString()} km`}
          subtitle="sur la période"
          status="success"
          icon={<Navigation />}
        />
        <KPICard
          title="Carburant Total"
          value={`${totalFuel.toFixed(1)} L`}
          subtitle="sur la période"
          status="info"
          icon={<Fuel />}
        />
        <KPICard
          title="Consommation Moy."
          value={`${avgConsumption.toFixed(1)} L/100km`}
          subtitle="flotte complète"
          status={avgConsumption > 20 ? "warning" : "success"}
          icon={<Fuel />}
        />
        <KPICard
          title="Véhicules Actifs"
          value={`${activeCount}/${devices.length}`}
          subtitle="ont roulé"
          status="success"
          icon={<Truck />}
        />
        <KPICard
          title="Alertes"
          value={totalAlerts}
          subtitle="toutes catégories"
          status={totalAlerts > 5 ? "danger" : totalAlerts > 0 ? "warning" : "success"}
          icon={<AlertTriangle />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Group performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Performance par Groupe
            </CardTitle>
          </CardHeader>
          <CardContent>
            {groupRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {loading ? "Chargement…" : "Aucune donnée"}
              </p>
            ) : (
              <div className="space-y-4">
                {groupRows.map(g => (
                  <div key={g.name} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">{g.name}</h4>
                      <Badge variant="outline">{g.vehicleCount} véhicule{g.vehicleCount > 1 ? "s" : ""}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Distance</div>
                        <div className="font-medium">{Math.round(g.distanceKm).toLocaleString()} km</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Carburant</div>
                        <div className="font-medium">{g.totalFuel.toFixed(1)} L</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Consomm.</div>
                        <div className="font-medium">
                          {g.distanceKm > 0 ? `${((g.totalFuel * 100) / g.distanceKm).toFixed(1)} L/100` : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 bg-muted rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2"
                        style={{
                          width: `${groupRows[0].distanceKm > 0 ? (g.distanceKm / groupRows[0].distanceKm) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vehicle ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Classement des Véhicules
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vehicleRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {loading ? "Chargement…" : "Aucune donnée"}
              </p>
            ) : (
              <div className="space-y-3">
                {vehicleRows.slice(0, 7).map((v, idx) => (
                  <div key={v.deviceId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? "bg-warning text-warning-foreground" :
                        idx === 1 ? "bg-muted text-muted-foreground" :
                        idx === 2 ? "bg-warning/60 text-warning-foreground" :
                        "bg-muted/60 text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{v.name}</div>
                        <div className="text-xs text-muted-foreground">{v.tripCount} trajet{v.tripCount > 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">{Math.round(v.distanceKm).toLocaleString()} km</div>
                      <div className="text-xs text-muted-foreground">
                        {v.avgConsumption > 0 ? `${v.avgConsumption.toFixed(1)} L/100km` : "—"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trip detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Navigation className="h-5 w-5 mr-2" />
              Analyse Détaillée des Trajets
            </div>
            <Badge variant="outline">{trips.length} trajet{trips.length !== 1 ? "s" : ""}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trips.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {loading ? "Chargement…" : "Aucun trajet sur la période"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="pb-2 pr-4">Véhicule</th>
                    <th className="pb-2 pr-4">Début</th>
                    <th className="pb-2 pr-4">Trajet</th>
                    <th className="pb-2 pr-4">Distance</th>
                    <th className="pb-2 pr-4">Durée</th>
                    <th className="pb-2 pr-4">Vit. Moy.</th>
                    <th className="pb-2">Carburant</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.slice(0, 50).map((trip, i) => (
                    <tr key={i} className="border-b hover:bg-muted/20">
                      <td className="py-2 pr-4 font-medium">{trip.deviceName}</td>
                      <td className="py-2 pr-4">
                        {trip.startTime ? (
                          <div>
                            <div>{new Date(trip.startTime).toLocaleDateString("fr-FR")}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(trip.startTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-4 max-w-48">
                        <div className="text-xs text-muted-foreground">
                          <div className="truncate">{trip.startAddress || "—"}</div>
                          <div className="truncate">→ {trip.endAddress || "—"}</div>
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-medium">{trip.distanceKm.toFixed(1)} km</td>
                      <td className="py-2 pr-4">
                        {trip.durationMin >= 60
                          ? `${Math.floor(trip.durationMin / 60)}h${String(trip.durationMin % 60).padStart(2, "0")}`
                          : `${trip.durationMin}min`}
                      </td>
                      <td className="py-2 pr-4">{trip.avgSpeedKmh} km/h</td>
                      <td className="py-2">{trip.spentFuel > 0 ? `${trip.spentFuel.toFixed(1)} L` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Best / Worst performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-success" />
              Meilleures Performances
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mostUsed && (
              <div className="text-sm">
                <div className="flex justify-between">
                  <span>Plus utilisé:</span>
                  <span className="font-medium">{mostUsed.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{Math.round(mostUsed.distanceKm).toLocaleString()} km</div>
              </div>
            )}
            {mostEfficient && (
              <div className="text-sm">
                <div className="flex justify-between">
                  <span>Plus économe:</span>
                  <span className="font-medium">{mostEfficient.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{mostEfficient.avgConsumption.toFixed(1)} L/100km</div>
              </div>
            )}
            {!mostUsed && <p className="text-sm text-muted-foreground">Aucune donnée</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center">
              <TrendingDown className="h-4 w-4 mr-2 text-warning" />
              Points d'Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {worstConsumer && (
              <div className="text-sm">
                <div className="flex justify-between">
                  <span>Plus consommateur:</span>
                  <span className="font-medium">{worstConsumer.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{worstConsumer.avgConsumption.toFixed(1)} L/100km</div>
              </div>
            )}
            {leastUsed && leastUsed.deviceId !== mostUsed?.deviceId && (
              <div className="text-sm">
                <div className="flex justify-between">
                  <span>Moins utilisé:</span>
                  <span className="font-medium">{leastUsed.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">{Math.round(leastUsed.distanceKm).toLocaleString()} km</div>
              </div>
            )}
            {!worstConsumer && <p className="text-sm text-muted-foreground">Aucune donnée</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
