import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { violations, vehicles } from "@/data/fleetData"
import { KPICard } from "@/components/KPICard"
import { 
  AlertTriangle, 
  Clock,
  MapPin,
  TrendingDown,
  Car,
  Shield
} from "lucide-react"

export default function Violations() {
  const todayViolations = violations.filter(v => 
    v.timestamp.toDateString() === new Date().toDateString()
  )
  
  const highSeverityViolations = violations.filter(v => v.severity === "high")
  const speedingViolations = violations.filter(v => v.type === "speeding")
  
  const getViolationTypeName = (type: string) => {
    switch (type) {
      case "speeding": return "Excès de vitesse"
      case "harsh_braking": return "Freinage brusque"
      case "harsh_acceleration": return "Accélération brusque"
      case "idle_time": return "Temps d'arrêt excessif"
      case "geofence": return "Violation de zone"
      default: return type
    }
  }

  const getViolationBadge = (severity: string) => {
    switch (severity) {
      case "high":
        return <Badge className="bg-danger text-danger-foreground">Élevée</Badge>
      case "medium":
        return <Badge className="bg-warning text-warning-foreground">Moyenne</Badge>
      case "low":
        return <Badge className="bg-info text-info-foreground">Faible</Badge>
      default:
        return <Badge variant="outline">Inconnue</Badge>
    }
  }

  const getViolationIcon = (type: string) => {
    switch (type) {
      case "speeding": 
        return <Car className="h-4 w-4 text-danger" />
      case "harsh_braking":
      case "harsh_acceleration":
        return <AlertTriangle className="h-4 w-4 text-warning" />
      case "idle_time":
        return <Clock className="h-4 w-4 text-info" />
      case "geofence":
        return <MapPin className="h-4 w-4 text-danger" />
      default:
        return <Shield className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Violations et Alertes</h1>
        <Button variant="outline">
          <Shield className="h-4 w-4 mr-2" />
          Configurer Alertes
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Violations Aujourd'hui"
          value={todayViolations.length}
          subtitle="infractions détectées"
          trend={{ value: "-2 depuis hier", isPositive: true }}
          status={todayViolations.length > 5 ? "danger" : "success"}
          icon={<AlertTriangle />}
        />
        
        <KPICard
          title="Violations Graves"
          value={highSeverityViolations.length}
          subtitle="cette semaine"
          trend={{ value: "-1 depuis la semaine dernière", isPositive: true }}
          status={highSeverityViolations.length > 0 ? "danger" : "success"}
          icon={<Shield />}
        />
        
        <KPICard
          title="Excès de Vitesse"
          value={speedingViolations.length}
          subtitle="ce mois"
          trend={{ value: "-15% vs mois dernier", isPositive: true }}
          status={speedingViolations.length > 10 ? "warning" : "success"}
          icon={<Car />}
        />
        
        <KPICard
          title="Score de Conduite"
          value="78/100"
          subtitle="moyenne flotte"
          trend={{ value: "+3 points", isPositive: true }}
          status="warning"
          icon={<TrendingDown />}
        />
      </div>

      {/* Critical Violations Alert */}
      {highSeverityViolations.length > 0 && (
        <Card className="border-danger">
          <CardHeader>
            <CardTitle className="flex items-center text-danger">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Violations Graves - Action Requise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {highSeverityViolations.slice(0, 3).map((violation) => {
                const vehicle = vehicles.find(v => v.id === violation.vehicleId)
                return (
                  <div key={violation.id} className="flex items-center justify-between p-3 bg-danger/10 rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getViolationIcon(violation.type)}
                      <div>
                        <div className="font-medium">{vehicle?.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {getViolationTypeName(violation.type)} - {violation.details}
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-sm text-muted-foreground">
                        {violation.timestamp.toLocaleDateString('fr-FR')}
                      </div>
                      <Button size="sm" className="bg-danger text-danger-foreground">
                        Traiter
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
        {/* All Violations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Historique des Violations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {violations.map((violation) => {
                const vehicle = vehicles.find(v => v.id === violation.vehicleId)
                return (
                  <div key={violation.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      {getViolationIcon(violation.type)}
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{vehicle?.name}</h4>
                          {getViolationBadge(violation.severity)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {getViolationTypeName(violation.type)} - {violation.details}
                        </p>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {violation.timestamp.toLocaleDateString('fr-FR')} à{' '}
                            {violation.timestamp.toLocaleTimeString('fr-FR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {violation.location.address}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        Localiser
                      </Button>
                      <Button variant="outline" size="sm">
                        Détails
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}