import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Filter, BarChart3, Calendar as CalendarIcon, Truck, MapPin, Fuel, AlertTriangle,
  Thermometer, Route, Settings, TrendingUp, TrendingDown, ArrowUpDown
} from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { api } from "@/lib/api"
import MultiSelect, { Option } from "@/components/MultiSelect"

function getGroupIdFromDevice(d: any): string | null {
  const gid = d?.groupId ?? d?.group_id ?? d?.group?.id ?? d?.attributes?.groupId ?? null
  return gid != null ? String(gid) : null
}
function getPlateFromDevice(d: any): string | null {
  return d?.attributes?.plate || d?.uniqueId || null
}
function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  return { from, to }
}
function toISO(d?: Date) {
  return (d ?? new Date()).toISOString()
}
type Row = {
  id: string
  name: string
  plate?: string | null
  groupName?: string | null
  consumption: number      // L/100km
  alerts: number
  maintenanceStatus: "OK" | "En retard"
  temperature: number
  distanceKm: number
  efficiencyPct: number    // 0..100 (heuristique)
}

/* ---- petit pool de concurrence pour éviter 200 appels simultanés ---- */
async function runPool<T>(jobs: (() => Promise<T>)[], concurrency = 6): Promise<T[]> {
  const results: T[] = []
  let i = 0
  const workers = new Array(Math.min(concurrency, jobs.length)).fill(0).map(async () => {
    while (i < jobs.length) {
      const idx = i++
      try {
        const r = await jobs[idx]()
        results[idx] = r
      } catch (e) {
        // @ts-ignore
        results[idx] = undefined
      }
    }
  })
  await Promise.all(workers)
  return results
}

export function FilterComparisonBlock() {
  /* Période */
  const { from: defFrom, to: defTo } = defaultRange()
  const [dateFrom, setDateFrom] = useState<Date | undefined>(defFrom)
  const [dateTo, setDateTo] = useState<Date | undefined>(defTo)

  /* Sélections */
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])

  /* Listes API */
  const [groups, setGroups] = useState<any[]>([])
  const [devices, setDevices] = useState<any[]>([])
  const [listsLoading, setListsLoading] = useState(false)
  const [listsError, setListsError] = useState<string | null>(null)

  /* Résultats / état */
  const [rows, setRows] = useState<Row[]>([])
  const [tableLoading, setTableLoading] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)

  /* Charger groupes + devices après login */
  useEffect(() => {
    setListsLoading(true); setListsError(null)
    ;(async () => {
      try {
        const [g, d] = await Promise.all([api.groups(), api.devices()])
        setGroups(Array.isArray(g) ? g : [])
        setDevices(Array.isArray(d) ? d : [])
      } catch (e: any) {
        setListsError(e?.message || "Impossible de charger groupes/véhicules")
      } finally {
        setListsLoading(false)
      }
    })()
  }, [])

  /* Options for MultiSelect */
  const groupOptions: Option[] = useMemo(
    () => groups.map((g) => ({ value: String(g?.id ?? g?.ID ?? g?.uuid), label: g?.name || `Groupe ${g?.id}` })),
    [groups]
  )
  const deviceOptions: Option[] = useMemo(
    () => devices.map((d) => ({ value: String(d?.id ?? d?.ID ?? d?.uuid), label: d?.name || `Véhicule ${d?.id}` })),
    [devices]
  )

  /* Set d’IDs device à utiliser (selon filtres) */
  const selectedDeviceSet = useMemo(() => {
    if (selectedDeviceIds.length > 0) {
      return new Set(selectedDeviceIds.map(String))
    }
    if (selectedGroupIds.length > 0) {
      const wantedGroups = new Set(selectedGroupIds.map(String))
      return new Set(
        devices
          .filter(d => {
            const gid = getGroupIdFromDevice(d)
            return gid && wantedGroups.has(gid)
          })
          .map(d => String(d?.id ?? d?.ID ?? d?.uuid))
      )
    }
    return new Set(devices.map(d => String(d?.id ?? d?.ID ?? d?.uuid)))
  }, [devices, selectedDeviceIds, selectedGroupIds])

  /* Construire le tableau depuis les ENDPOINTS */
  const onCompare = async () => {
    setTableError(null)
    setTableLoading(true)
    try {
      const fromISO = toISO(dateFrom)
      const toISOv = toISO(dateTo)

      const deviceIds = Array.from(selectedDeviceSet).map((id) => Number(id)).filter(Number.isFinite)

      if (deviceIds.length === 0) {
        setRows([])
        setTableLoading(false)
        return
      }

      // 1) Alerts en batch (une seule requête pour tous)
      const alertResp = await api.vehicleAlerts(deviceIds, fromISO, toISOv)
      const alertsMap = new Map<number, number>()
      if (Array.isArray(alertResp?.rows)) {
        for (const r of alertResp.rows) {
          const idn = Number(r?.deviceId)
          const cnt = Number(r?.alertCount) || 0
          if (Number.isFinite(idn)) alertsMap.set(idn, cnt)
        }
      }

      // Mappings utiles
      const groupNameById = new Map<string, string>()
      for (const g of groups) groupNameById.set(String(g?.id ?? g?.ID ?? g?.uuid), g?.name || `Groupe ${g?.id}`)

      const deviceById = new Map<string, any>()
      for (const d of devices) deviceById.set(String(d?.id ?? d?.ID ?? d?.uuid), d)

      // 2) Pour chaque device: totalDistance + avgFuel (appelés individuellement)
      const jobs = deviceIds.map((idNum) => async () => {
        // distance
        const dist = await api.totalDistance([idNum], fromISO, toISOv).catch(() => null)
        const km = Number(dist?.totalKm || 0)

        // fuel
        const fuel = await api.avgFuel([idNum], fromISO, toISOv).catch(() => null)
        const totalFuel = Number(fuel?.totalFuel || 0) // litres supposés

        // L/100km
        const lper100 = km > 0 ? (totalFuel / km) * 100 : 0

        // alerts (map)
        const alerts = alertsMap.get(idNum) || 0

        // device meta
        const dev = deviceById.get(String(idNum))
        const name = dev?.name || `Véhicule ${idNum}`
        const plate = getPlateFromDevice(dev)
        const gid = getGroupIdFromDevice(dev)
        const groupName = gid ? groupNameById.get(gid) ?? null : null

        // maintenance/temperature placeholders
        const maintenanceStatus: "OK" | "En retard" = "OK"
        const temperature = 0

        // petite heuristique pour un score d’efficacité
        // (tu peux remplacer par une vraie métrique serveur plus tard)
        let score = 100
        if (lper100 > 30) score -= 40
        else if (lper100 > 20) score -= 20
        score -= Math.min(30, alerts * 5)
        if (km === 0) score -= 30
        score = Math.max(0, Math.min(100, score))

        const row: Row = {
          id: String(idNum),
          name,
          plate,
          groupName,
          consumption: lper100,
          alerts,
          maintenanceStatus,
          temperature,
          distanceKm: km,
          efficiencyPct: score,
        }
        return row
      })

      const rowsRes = await runPool(jobs, 6)
      setRows(rowsRes.filter(Boolean) as Row[])
    } catch (e: any) {
      setTableError(e?.message || "Erreur lors du calcul des métriques")
    } finally {
      setTableLoading(false)
    }
  }

  // Options d’affichage
  const effBadge = (pct: number) =>
    pct >= 85 ? <Badge className="bg-success text-success-foreground">Excellent</Badge>
    : pct >= 70 ? <Badge className="bg-warning text-warning-foreground">Moyen</Badge>
    : <Badge className="bg-danger text-danger-foreground">Faible</Badge>

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <BarChart3 className="h-5 w-5 mr-2" />
            Comparaison et Analyse Avancée
          </div>
          <div className="flex items-center gap-2">
            {listsLoading && <Badge variant="secondary">Chargement…</Badge>}
            {!listsLoading && (groups.length > 0 || devices.length > 0) && (
              <Badge variant="outline">{groups.length} groupes · {devices.length} véhicules</Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/reports")}>
              Rapports Détaillés
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Filtres */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-info/5 rounded-lg border border-info/20">
          <div className="space-y-2">
            <Label>Groupes</Label>
            <MultiSelect
              options={groupOptions}
              value={selectedGroupIds}
              onChange={setSelectedGroupIds}
              placeholder="Tous les groupes"
              disabled={listsLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>Véhicule Spécifique</Label>
            <MultiSelect
              options={deviceOptions}
              value={selectedDeviceIds}
              onChange={setSelectedDeviceIds}
              placeholder="Tous les véhicules"
              disabled={listsLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>Période</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left text-xs">
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {dateFrom ? format(dateFrom, "dd/MM", { locale: fr }) : "Début"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={fr} />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left text-xs">
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {dateTo ? format(dateTo, "dd/MM", { locale: fr }) : "Fin"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={fr} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-end">
            <Button
              className="w-full bg-info hover:bg-info/90 text-info-foreground"
              onClick={onCompare}
              disabled={listsLoading || tableLoading || devices.length === 0}
            >
              <Filter className="h-4 w-4 mr-2" />
              {tableLoading ? "Calcul..." : "Comparer"}
            </Button>
          </div>
        </div>

        {listsError && <div className="text-sm text-red-600">{listsError}</div>}
        {tableError && <div className="text-sm text-red-600">{tableError}</div>}

        <Separator />

        {/* Tableau */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Tableau Comparatif</h3>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" disabled>
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Trier
              </Button>
              <Badge variant="outline">{rows.length} éléments</Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Véhicule</th>
                  <th className="text-left p-3 font-medium">Groupe</th>
                  <th className="text-left p-3 font-medium">
                    <div className="flex items-center"><Fuel className="h-4 w-4 mr-1" /> Consommation (L/100km)</div>
                  </th>
                  <th className="text-left p-3 font-medium">
                    <div className="flex items-center"><AlertTriangle className="h-4 w-4 mr-1" /> Alertes</div>
                  </th>
                  <th className="text-left p-3 font-medium">
                    <div className="flex items-center"><Settings className="h-4 w-4 mr-1" /> Maintenance</div>
                  </th>
                  <th className="text-left p-3 font-medium">
                    <div className="flex items-center"><Thermometer className="h-4 w-4 mr-1" /> Température (°C)</div>
                  </th>
                  <th className="text-left p-3 font-medium">
                    <div className="flex items-center"><Route className="h-4 w-4 mr-1" /> Distance (km)</div>
                  </th>
                  <th className="text-left p-3 font-medium">Efficacité</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-center text-sm text-muted-foreground" colSpan={8}>
                      {tableLoading ? "Calcul en cours…" : "Aucun élément à afficher (cliquez sur Comparer)."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr key={r.id} className={`border-b hover:bg-muted/50 ${idx % 2 === 0 ? "bg-muted/20" : ""}`}>
                      <td className="p-3">
                        <div className="flex items-center">
                          <Truck className="h-4 w-4 mr-2 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{r.name}</div>
                            <div className="text-sm text-muted-foreground">{r.plate ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                          {r.groupName ?? "—"}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center">
                          <span className="font-medium">{r.consumption.toFixed(1)}</span>
                          {r.consumption > 50
                            ? <TrendingUp className="h-4 w-4 ml-2 text-danger" />
                            : <TrendingDown className="h-4 w-4 ml-2 text-success" />
                          }
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={r.alerts > 2 ? "bg-danger text-danger-foreground" : "bg-success text-success-foreground"}>
                          {r.alerts}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {r.maintenanceStatus === "OK"
                          ? <Badge className="bg-success text-success-foreground">OK</Badge>
                          : <Badge className="bg-danger text-danger-foreground">En retard</Badge>}
                      </td>
                      <td className="p-3"><span className="font-medium">{r.temperature}°C</span></td>
                      <td className="p-3 font-medium">{Math.round(r.distanceKm).toLocaleString()}</td>
                      <td className="p-3">{effBadge(r.efficiencyPct)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
