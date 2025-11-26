import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { vehicles } from "@/data/fleetData"
import { KPICard } from "@/components/KPICard"
import { 
  MapPin, 
  Navigation,
  Clock,
  Truck,
  Zap,
  AlertTriangle,
  Maximize2
} from "lucide-react"

export default function RealTimeTracking() {
  const activeVehicles = vehicles.filter(v => v.status === "active")
  const movingVehicles = vehicles.filter(v => v.speed > 0)
  const avgSpeed = movingVehicles.reduce((sum, v) => sum + v.speed, 0) / (movingVehicles.length || 1)

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "text-success"
      case "idle": return "text-warning"
      case "maintenance": return "text-info"
      case "offline": return "text-danger"
      default: return "text-muted-foreground"
    }
  }

  const getSpeedColor = (speed: number) => {
    if (speed === 0) return "text-muted-foreground"
    if (speed > 80) return "text-danger"
    if (speed > 50) return "text-warning"
    return "text-success"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Suivi en Temps Réel</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Maximize2 className="h-4 w-4 mr-2" />
            Plein Écran
          </Button>
          <Button>
            <Navigation className="h-4 w-4 mr-2" />
            Centrer Carte
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Véhicules en Mouvement"
          value={`${movingVehicles.length}/${vehicles.length}`}
          subtitle="actuellement actifs"
          status="success"
          icon={<Truck />}
        />
        
        <KPICard
          title="Vitesse Moyenne"
          value={`${Math.round(avgSpeed)} km/h`}
          subtitle="flotte active"
          status="info"
          icon={<Zap />}
        />
        
        <KPICard
          title="Distance Totale Aujourd'hui"
          value="1,247 km"
          subtitle="tous véhicules"
          trend={{ value: "+156 km depuis hier", isPositive: true }}
          status="success"
          icon={<Navigation />}
        />
        
        <KPICard
          title="Alertes Temps Réel"
          value="2"
          subtitle="nécessitent attention"
          status="warning"
          icon={<AlertTriangle />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Placeholder */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Carte de Localisation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-96 bg-muted rounded-lg flex items-center justify-center relative overflow-hidden">
              {/* Simulation d'une carte */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-green-50">
                {/* Points véhicules simulés */}
                {vehicles.map((vehicle, index) => (
                  <div
                    key={vehicle.id}
                    className={`absolute w-3 h-3 rounded-full border-2 border-card ${
                      vehicle.status === 'active' ? 'bg-success animate-pulse' :
                      vehicle.status === 'idle' ? 'bg-warning' :
                      vehicle.status === 'maintenance' ? 'bg-info' :
                      'bg-danger'
                    }`}
                    style={{
                      left: `${20 + (index * 15) % 60}%`,
                      top: `${25 + (index * 20) % 50}%`
                    }}
                    title={vehicle.name}
                  />
                ))}
              </div>
              <div className="text-center z-10 bg-card/80 p-4 rounded-lg backdrop-blur-sm">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-lg font-medium">Carte Interactive GPS</p>
                <p className="text-sm text-muted-foreground">
                  {vehicles.length} véhicules trackés en temps réel
                </p>
                <Button className="mt-2" size="sm">
                  Activer Carte Complète
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              État des Véhicules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-96 overflow-y-auto">
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">{vehicle.name}</h4>
                  <Badge variant="outline" className={getStatusColor(vehicle.status)}>
                    {vehicle.status === "active" ? "Actif" :
                     vehicle.status === "idle" ? "Arrêt" :
                     vehicle.status === "maintenance" ? "Maintenance" :
                     "Hors ligne"}
                  </Badge>
                </div>
                
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <MapPin className="h-3 w-3 mr-1" />
                    <span className="truncate">{vehicle.location.address}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Zap className="h-3 w-3 mr-1" />
                      <span className={getSpeedColor(vehicle.speed)}>
                        {vehicle.speed} km/h
                      </span>
                    </div>
                    
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>
                        {Math.floor((Date.now() - vehicle.lastUpdate.getTime()) / 60000)}min
                      </span>
                    </div>
                  </div>
                  
                  {vehicle.driver && (
                    <div className="text-xs">
                      Conducteur: {vehicle.driver.name}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7">
                    Localiser
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-7">
                    Historique
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="h-5 w-5 mr-2" />
            Activité Récente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-success rounded-full"></div>
                <span className="text-sm">Camion Livraison 01 - Démarrage moteur</span>
              </div>
              <span className="text-xs text-muted-foreground">Il y a 2 min</span>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-warning rounded-full"></div>
                <span className="text-sm">Fourgon 02 - Arrêt prolongé détecté</span>
              </div>
              <span className="text-xs text-muted-foreground">Il y a 5 min</span>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-info rounded-full"></div>
                <span className="text-sm">Camion Chantier 04 - Arrivée à destination</span>
              </div>
              <span className="text-xs text-muted-foreground">Il y a 8 min</span>
            </div>
            
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-danger rounded-full"></div>
                <span className="text-sm">Utilitaire 05 - Perte de signal GPS</span>
              </div>
              <span className="text-xs text-muted-foreground">Il y a 15 min</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}