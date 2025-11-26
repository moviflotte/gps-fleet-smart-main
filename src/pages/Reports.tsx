import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { vehicles } from "@/data/fleetData"
import { trips } from "@/data/moreFleetData"
import { KPICard } from "@/components/KPICard"
import { 
  BarChart3, 
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  Calendar,
  DollarSign,
  Fuel,
  Navigation,
  Clock
} from "lucide-react"

export default function Reports() {
  const totalDistance = trips.reduce((sum, trip) => sum + trip.distance, 0)
  const totalFuelCost = trips.reduce((sum, trip) => sum + trip.cost, 0)
  const totalFuelConsumed = trips.reduce((sum, trip) => sum + trip.fuelConsumed, 0)
  const avgConsumption = totalFuelConsumed / totalDistance * 100 // L/100km

  const getAgencyData = () => {
    const agencies = [...new Set(vehicles.map(v => v.agency).filter(Boolean))]
    return agencies.map(agency => {
      const agencyVehicles = vehicles.filter(v => v.agency === agency)
      const agencyTrips = trips.filter(t => agencyVehicles.some(v => v.id === t.vehicleId))
      const agencyDistance = agencyTrips.reduce((sum, trip) => sum + trip.distance, 0)
      const agencyCost = agencyTrips.reduce((sum, trip) => sum + trip.cost, 0)
      
      return {
        name: agency,
        vehicles: agencyVehicles.length,
        distance: agencyDistance,
        cost: agencyCost,
        avgCostPerKm: agencyDistance > 0 ? agencyCost / agencyDistance : 0
      }
    })
  }

  const agencyData = getAgencyData()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Rapports Analytiques</h1>
        <div className="flex gap-2">
          <Select defaultValue="this-month">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd'hui</SelectItem>
              <SelectItem value="this-week">Cette semaine</SelectItem>
              <SelectItem value="this-month">Ce mois</SelectItem>
              <SelectItem value="last-month">Mois dernier</SelectItem>
              <SelectItem value="this-year">Cette année</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Rapport Personnalisé
          </Button>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Distance Totale"
          value={`${totalDistance.toFixed(0)} km`}
          subtitle="ce mois"
          trend={{ value: "+15% vs mois dernier", isPositive: true }}
          status="success"
          icon={<Navigation />}
        />
        
        <KPICard
          title="Coût Carburant"
          value={`${totalFuelCost.toFixed(0)}€`}
          subtitle="ce mois"
          trend={{ value: "+8% vs mois dernier", isPositive: false }}
          status="warning"
          icon={<DollarSign />}
        />
        
        <KPICard
          title="Consommation Moyenne"
          value={`${avgConsumption.toFixed(1)}L/100km`}
          subtitle="flotte complète"
          trend={{ value: "-0.3L amélioration", isPositive: true }}
          status="success"
          icon={<Fuel />}
        />
        
        <KPICard
          title="Temps d'Utilisation"
          value="89%"
          subtitle="efficacité flotte"
          trend={{ value: "+5% vs mois dernier", isPositive: true }}
          status="success"
          icon={<Clock />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance by Agency */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Performance par Agence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {agencyData.map((agency) => (
                <div key={agency.name} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{agency.name}</h4>
                    <Badge variant="outline">{agency.vehicles} véhicules</Badge>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Distance</div>
                      <div className="font-medium">{agency.distance.toFixed(0)} km</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Coût Total</div>
                      <div className="font-medium">{agency.cost.toFixed(0)}€</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">€/km</div>
                      <div className="font-medium">{agency.avgCostPerKm.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  {/* Progress bar simulation */}
                  <div className="mt-3 bg-muted rounded-full h-2">
                    <div 
                      className="bg-primary rounded-full h-2" 
                      style={{ width: `${Math.min((agency.distance / Math.max(...agencyData.map(a => a.distance))) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Performance Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Classement des Véhicules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {vehicles
                .map(vehicle => {
                  const vehicleTrips = trips.filter(t => t.vehicleId === vehicle.id)
                  const totalDistance = vehicleTrips.reduce((sum, trip) => sum + trip.distance, 0)
                  const totalCost = vehicleTrips.reduce((sum, trip) => sum + trip.cost, 0)
                  const efficiency = totalDistance > 0 ? totalCost / totalDistance : 0
                  
                  return {
                    ...vehicle,
                    totalDistance,
                    totalCost,
                    efficiency,
                    tripCount: vehicleTrips.length
                  }
                })
                .sort((a, b) => b.totalDistance - a.totalDistance)
                .slice(0, 5)
                .map((vehicle, index) => (
                  <div key={vehicle.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-warning text-warning-foreground' :
                        index === 1 ? 'bg-muted text-muted-foreground' :
                        index === 2 ? 'bg-warning/60 text-warning-foreground' :
                        'bg-muted/60 text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{vehicle.name}</h4>
                        <p className="text-xs text-muted-foreground">{vehicle.plateNumber}</p>
                      </div>
                    </div>
                    
                    <div className="text-right text-sm">
                      <div className="font-medium">{vehicle.totalDistance.toFixed(0)} km</div>
                      <div className="text-xs text-muted-foreground">
                        {vehicle.efficiency.toFixed(2)}€/km
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Trip Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Navigation className="h-5 w-5 mr-2" />
            Analyse Détaillée des Trajets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-2">Véhicule</th>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Trajet</th>
                  <th className="pb-2">Distance</th>
                  <th className="pb-2">Durée</th>
                  <th className="pb-2">Vitesse Moy.</th>
                  <th className="pb-2">Carburant</th>
                  <th className="pb-2">Coût</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                {trips.map((trip) => {
                  const vehicle = vehicles.find(v => v.id === trip.vehicleId)
                  return (
                    <tr key={trip.id} className="border-b hover:bg-muted/20">
                      <td className="py-2">
                        <div>
                          <div className="font-medium">{vehicle?.name}</div>
                          <div className="text-xs text-muted-foreground">{vehicle?.plateNumber}</div>
                        </div>
                      </td>
                      <td className="py-2">
                        <div>{trip.startTime.toLocaleDateString('fr-FR')}</div>
                        <div className="text-xs text-muted-foreground">
                          {trip.startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="py-2 max-w-48">
                        <div className="text-xs">
                          <div className="truncate">De: {trip.startLocation.address}</div>
                          <div className="truncate">À: {trip.endLocation?.address}</div>
                        </div>
                      </td>
                      <td className="py-2 font-medium">{trip.distance.toFixed(1)} km</td>
                      <td className="py-2">{Math.floor(trip.duration / 60)}h{trip.duration % 60}min</td>
                      <td className="py-2">{trip.avgSpeed} km/h</td>
                      <td className="py-2">{trip.fuelConsumed.toFixed(1)}L</td>
                      <td className="py-2 font-medium">{trip.cost.toFixed(2)}€</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-success" />
              Meilleures Performances
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Plus économe:</span>
                <span className="font-medium">Camion Chantier 04</span>
              </div>
              <div className="text-xs text-muted-foreground">18.3L/100km</div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Plus utilisé:</span>
                <span className="font-medium">Camion Livraison 01</span>
              </div>
              <div className="text-xs text-muted-foreground">156 km ce mois</div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Meilleur temps:</span>
                <span className="font-medium">Fourgon 02</span>
              </div>
              <div className="text-xs text-muted-foreground">92% utilisation</div>
            </div>
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
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Plus consommateur:</span>
                <span className="font-medium">Véhicule Service 03</span>
              </div>
              <div className="text-xs text-muted-foreground">32.1L/100km</div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Sous-utilisé:</span>
                <span className="font-medium">Utilitaire 05</span>
              </div>
              <div className="text-xs text-muted-foreground">23% utilisation</div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Coût élevé:</span>
                <span className="font-medium">Paris Ouest</span>
              </div>
              <div className="text-xs text-muted-foreground">0.74€/km</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-info" />
              Prochaines Échéances
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Assurance:</span>
                <span className="font-medium text-danger">3 expirent bientôt</span>
              </div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Entretien:</span>
                <span className="font-medium text-warning">2 à planifier</span>
              </div>
            </div>
            <div className="text-sm">
              <div className="flex justify-between">
                <span>Contrôle technique:</span>
                <span className="font-medium text-success">Tous à jour</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}