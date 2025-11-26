import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Route, MapPin, Clock, Fuel, TrendingUp } from "lucide-react"

export default function Trajets() {
  // Mock trajectory data
  const trajets = [
    {
      id: "t1",
      vehicleName: "Camion Livraison 01",
      startLocation: "Dépôt Central, Paris",
      endLocation: "Client Nord, Lille",
      startTime: "08:30",
      endTime: "14:45",
      distance: "245 km",
      duration: "6h 15min",
      fuelConsumed: "28.5L",
      status: "completed"
    },
    {
      id: "t2",
      vehicleName: "Fourgon 02",
      startLocation: "Agence Est",
      endLocation: "Zone Industrielle",
      startTime: "09:00",
      endTime: "En cours",
      distance: "87 km",
      duration: "2h 30min",
      fuelConsumed: "12.3L",
      status: "in_progress"
    },
    {
      id: "t3",
      vehicleName: "Véhicule Service 03",
      startLocation: "Garage Réparations",
      endLocation: "Client Centre",
      startTime: "10:15",
      endTime: "Planifié",
      distance: "32 km",
      duration: "Est. 1h 15min",
      fuelConsumed: "Est. 4.2L",
      status: "planned"
    }
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-success text-success-foreground">Terminé</Badge>
      case "in_progress":
        return <Badge className="bg-warning text-warning-foreground">En cours</Badge>
      case "planned":
        return <Badge className="bg-info text-info-foreground">Planifié</Badge>
      default:
        return <Badge variant="outline">Inconnu</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Trajets</h1>
        <Button>
          <Route className="h-4 w-4 mr-2" />
          Nouveau Trajet
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-success">12</div>
            <p className="text-sm text-muted-foreground">Trajets Terminés</p>
          </CardContent>
        </Card>
        
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-warning">3</div>
            <p className="text-sm text-muted-foreground">En Cours</p>
          </CardContent>
        </Card>
        
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-info">1,245 km</div>
            <p className="text-sm text-muted-foreground">Distance Totale</p>
          </CardContent>
        </Card>
        
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary">145.8L</div>
            <p className="text-sm text-muted-foreground">Carburant Consommé</p>
          </CardContent>
        </Card>
      </div>

      {/* Trajets List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Route className="h-5 w-5 mr-2" />
            Trajets Récents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {trajets.map((trajet) => (
              <div key={trajet.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <h4 className="font-medium mr-3">{trajet.vehicleName}</h4>
                    {getStatusBadge(trajet.status)}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center">
                      <MapPin className="h-3 w-3 mr-1" />
                      De: {trajet.startLocation}
                    </div>
                    <div className="flex items-center">
                      <MapPin className="h-3 w-3 mr-1" />
                      Vers: {trajet.endLocation}
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {trajet.startTime} - {trajet.endTime}
                    </div>
                    <div className="flex items-center">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {trajet.distance} ({trajet.duration})
                    </div>
                  </div>
                </div>
                
                <div className="text-right space-y-1">
                  <div className="flex items-center text-sm">
                    <Fuel className="h-3 w-3 mr-1" />
                    {trajet.fuelConsumed}
                  </div>
                  <Button variant="outline" size="sm">
                    Détails
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}