import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { vehicles } from "@/data/fleetData"
import { missions } from "@/data/moreFleetData"
import { KPICard } from "@/components/KPICard"
import { 
  Calendar, 
  Clock,
  MapPin,
  User,
  Truck,
  Plus,
  Filter,
  CheckCircle,
  AlertCircle,
  PlayCircle,
  XCircle
} from "lucide-react"

export default function Planning() {
  const todayMissions = missions.filter(m => 
    m.startDate.toDateString() === new Date().toDateString()
  )
  const activeMissions = missions.filter(m => m.status === "in_progress")
  const plannedMissions = missions.filter(m => m.status === "planned")
  const completedMissions = missions.filter(m => m.status === "completed")

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "planned":
        return <Badge className="bg-info text-info-foreground">Planifiée</Badge>
      case "in_progress":
        return <Badge className="bg-warning text-warning-foreground">En Cours</Badge>
      case "completed":
        return <Badge className="bg-success text-success-foreground">Terminée</Badge>
      case "cancelled":
        return <Badge className="bg-danger text-danger-foreground">Annulée</Badge>
      default:
        return <Badge variant="outline">Inconnue</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="outline" className="text-danger border-danger">Haute</Badge>
      case "medium":
        return <Badge variant="outline" className="text-warning border-warning">Moyenne</Badge>
      case "low":
        return <Badge variant="outline" className="text-info border-info">Basse</Badge>
      default:
        return <Badge variant="outline">Normale</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "planned":
        return <Clock className="h-4 w-4 text-info" />
      case "in_progress":
        return <PlayCircle className="h-4 w-4 text-warning" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-success" />
      case "cancelled":
        return <XCircle className="h-4 w-4 text-danger" />
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getVehicleAvailability = () => {
    const assignedVehicleIds = missions
      .filter(m => m.status === "planned" || m.status === "in_progress")
      .map(m => m.vehicleId)
    
    return vehicles.map(vehicle => ({
      ...vehicle,
      isAvailable: !assignedVehicleIds.includes(vehicle.id) && vehicle.status !== "maintenance" && vehicle.status !== "offline"
    }))
  }

  const vehicleAvailability = getVehicleAvailability()
  const availableVehicles = vehicleAvailability.filter(v => v.isAvailable)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Planning & Missions</h1>
        <div className="flex gap-2">
          <Select defaultValue="today">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd'hui</SelectItem>
              <SelectItem value="tomorrow">Demain</SelectItem>
              <SelectItem value="this-week">Cette semaine</SelectItem>
              <SelectItem value="next-week">Semaine prochaine</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtrer
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle Mission
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Missions Aujourd'hui"
          value={todayMissions.length}
          subtitle="planifiées"
          status="info"
          icon={<Calendar />}
        />
        
        <KPICard
          title="En Cours"
          value={activeMissions.length}
          subtitle="missions actives"
          status="warning"
          icon={<PlayCircle />}
        />
        
        <KPICard
          title="Véhicules Disponibles"
          value={availableVehicles.length}
          subtitle={`sur ${vehicles.length} total`}
          status={availableVehicles.length > 0 ? "success" : "danger"}
          icon={<Truck />}
        />
        
        <KPICard
          title="Taux de Réalisation"
          value="87%"
          subtitle="missions terminées à temps"
          trend={{ value: "+5% vs mois dernier", isPositive: true }}
          status="success"
          icon={<CheckCircle />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Missions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Missions d'Aujourd'hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {missions.map((mission) => {
                const vehicle = vehicles.find(v => v.id === mission.vehicleId)
                const driver = vehicle?.driver || { name: "Non assigné", id: "" }
                
                return (
                  <div key={mission.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(mission.status)}
                        <h4 className="font-medium">{mission.title}</h4>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getPriorityBadge(mission.priority)}
                        {getStatusBadge(mission.status)}
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {mission.description}
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex items-center text-muted-foreground">
                          <Truck className="h-3 w-3 mr-1" />
                          <span>{vehicle?.name || "Véhicule non assigné"}</span>
                        </div>
                        <div className="flex items-center text-muted-foreground">
                          <User className="h-3 w-3 mr-1" />
                          <span>{driver.name}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center text-muted-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          <span>
                            {mission.startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - 
                            {mission.endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center text-muted-foreground">
                          <MapPin className="h-3 w-3 mr-1" />
                          <span className="truncate">{mission.startLocation.address}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="text-xs text-muted-foreground">
                        Créée le {mission.startDate.toLocaleDateString('fr-FR')}
                      </div>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          Localiser
                        </Button>
                        <Button size="sm" variant="outline">
                          Modifier
                        </Button>
                        {mission.status === "planned" && (
                          <Button size="sm">
                            Démarrer
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Availability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Disponibilité Véhicules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {vehicleAvailability.map((vehicle) => (
              <div key={vehicle.id} className={`p-3 border rounded-lg ${
                vehicle.isAvailable ? 'border-success bg-success/5' : 'border-muted'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">{vehicle.name}</h4>
                  <Badge variant="outline" className={`text-xs ${
                    vehicle.isAvailable ? 'text-success border-success' : 'text-muted-foreground'
                  }`}>
                    {vehicle.isAvailable ? 'Disponible' : 'Occupé'}
                  </Badge>
                </div>
                
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>{vehicle.plateNumber}</div>
                  <div className="flex items-center">
                    <MapPin className="h-3 w-3 mr-1" />
                    <span className="truncate">{vehicle.location.address}</span>
                  </div>
                  {vehicle.driver && (
                    <div className="flex items-center">
                      <User className="h-3 w-3 mr-1" />
                      <span>{vehicle.driver.name}</span>
                    </div>
                  )}
                </div>
                
                {vehicle.isAvailable && (
                  <Button size="sm" className="w-full mt-2 h-7">
                    Assigner Mission
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Mission Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="h-5 w-5 mr-2" />
            Vue d'Ensemble des Missions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg bg-info/5">
              <div className="text-2xl font-bold text-info">{plannedMissions.length}</div>
              <div className="text-sm text-muted-foreground">Planifiées</div>
            </div>
            
            <div className="text-center p-4 border rounded-lg bg-warning/5">
              <div className="text-2xl font-bold text-warning">{activeMissions.length}</div>
              <div className="text-sm text-muted-foreground">En Cours</div>
            </div>
            
            <div className="text-center p-4 border rounded-lg bg-success/5">
              <div className="text-2xl font-bold text-success">{completedMissions.length}</div>
              <div className="text-sm text-muted-foreground">Terminées</div>
            </div>
            
            <div className="text-center p-4 border rounded-lg bg-danger/5">
              <div className="text-2xl font-bold text-danger">
                {missions.filter(m => m.status === "cancelled").length}
              </div>
              <div className="text-sm text-muted-foreground">Annulées</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions Rapides</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button className="h-20 flex-col">
              <Plus className="h-5 w-5 mb-2" />
              Nouvelle Mission
            </Button>
            
            <Button variant="outline" className="h-20 flex-col">
              <Calendar className="h-5 w-5 mb-2" />
              Planning Semaine
            </Button>
            
            <Button variant="outline" className="h-20 flex-col">
              <User className="h-5 w-5 mb-2" />
              Gestion Conducteurs
            </Button>
            
            <Button variant="outline" className="h-20 flex-col">
              <MapPin className="h-5 w-5 mb-2" />
              Optimiser Tournées
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}