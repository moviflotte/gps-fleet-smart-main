import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { vehicles } from "@/data/fleetData"
import { 
  Truck, 
  MapPin, 
  Fuel, 
  User,
  Clock,
  Search,
  Filter
} from "lucide-react"

export default function Vehicles() {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success text-success-foreground">En Service</Badge>
      case "idle":
        return <Badge className="bg-warning text-warning-foreground">En Attente</Badge>
      case "maintenance":
        return <Badge className="bg-info text-info-foreground">Maintenance</Badge>
      case "offline":
        return <Badge className="bg-danger text-danger-foreground">Hors Ligne</Badge>
      default:
        return <Badge variant="outline">Inconnu</Badge>
    }
  }

  const getFuelLevelColor = (level: number) => {
    if (level > 70) return "text-success"
    if (level > 30) return "text-warning"
    return "text-danger"
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gestion des Véhicules</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtrer
          </Button>
          <Button>
            <Truck className="h-4 w-4 mr-2" />
            Ajouter Véhicule
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher un véhicule..." className="pl-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vehicles.map((vehicle) => (
          <Card key={vehicle.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{vehicle.name}</CardTitle>
                {getStatusBadge(vehicle.status)}
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {vehicle.plateNumber}
              </p>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <Truck className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{vehicle.model} ({vehicle.year})</span>
                </div>
                
                <div className="flex items-center text-sm">
                  <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="truncate">{vehicle.location.address}</span>
                </div>
                
                <div className="flex items-center text-sm">
                  <Fuel className={`h-4 w-4 mr-2 ${getFuelLevelColor(vehicle.fuelLevel)}`} />
                  <span className={getFuelLevelColor(vehicle.fuelLevel)}>
                    Carburant: {vehicle.fuelLevel}%
                  </span>
                </div>
                
                {vehicle.driver && (
                  <div className="flex items-center text-sm">
                    <User className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{vehicle.driver.name}</span>
                  </div>
                )}
                
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>
                    Dernière maj: {vehicle.lastUpdate.toLocaleDateString('fr-FR')} à{' '}
                    {vehicle.lastUpdate.toLocaleTimeString('fr-FR', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm">
                  <span className="text-muted-foreground">Kilométrage:</span>
                  <br />
                  <span className="font-medium">{vehicle.mileage.toLocaleString()} km</span>
                </div>
                
                <div className="text-sm text-right">
                  <span className="text-muted-foreground">Vitesse:</span>
                  <br />
                  <span className="font-medium">{vehicle.speed} km/h</span>
                </div>
              </div>
              
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Localiser
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  Détails
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}