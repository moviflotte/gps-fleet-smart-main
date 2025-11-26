import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { vehicles, fuelConsumption } from "@/data/fleetData"
import { KPICard } from "@/components/KPICard"
import { 
  Fuel as FuelIcon, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  BarChart3
} from "lucide-react"

export default function Fuel() {
  const totalFuelCost = fuelConsumption.reduce((sum, entry) => sum + entry.cost, 0)
  const avgConsumption = fuelConsumption.reduce((sum, entry) => sum + entry.consumption, 0) / fuelConsumption.length
  const lowFuelVehicles = vehicles.filter(v => v.fuelLevel < 25)
  const criticalFuelVehicles = vehicles.filter(v => v.fuelLevel < 15)

  const getFuelLevelColor = (level: number) => {
    if (level > 70) return "text-success"
    if (level > 30) return "text-warning"
    return "text-danger"
  }

  const getFuelStatus = (level: number) => {
    if (level > 70) return { status: "success" as const, label: "Bon" }
    if (level > 30) return { status: "warning" as const, label: "Moyen" }
    return { status: "danger" as const, label: "Critique" }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gestion du Carburant</h1>
        <Button>
          <BarChart3 className="h-4 w-4 mr-2" />
          Rapport Détaillé
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Coût Total du Mois"
          value={`${totalFuelCost.toFixed(2)}€`}
          subtitle="carburant consommé"
          trend={{ value: "+12% vs mois dernier", isPositive: false }}
          status="warning"
          icon={<DollarSign />}
        />
        
        <KPICard
          title="Consommation Moyenne"
          value={`${avgConsumption.toFixed(1)}L`}
          subtitle="par véhicule"
          trend={{ value: "-2.3L depuis hier", isPositive: true }}
          status="success"
          icon={<FuelIcon />}
        />
        
        <KPICard
          title="Alertes Carburant"
          value={lowFuelVehicles.length}
          subtitle="véhicules < 25%"
          trend={{ value: `${criticalFuelVehicles.length} critiques`, isPositive: false }}
          status={lowFuelVehicles.length > 0 ? "danger" : "success"}
          icon={<AlertTriangle />}
        />
        
        <KPICard
          title="Efficacité Carburant"
          value="8.2L/100km"
          subtitle="moyenne flotte"
          trend={{ value: "-0.3L amélioration", isPositive: true }}
          status="info"
          icon={<TrendingUp />}
        />
      </div>

      {/* Critical Alerts */}
      {(lowFuelVehicles.length > 0 || criticalFuelVehicles.length > 0) && (
        <Card className="border-danger">
          <CardHeader>
            <CardTitle className="flex items-center text-danger">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Alertes Carburant
            </CardTitle>
          </CardHeader>
          <CardContent>
            {criticalFuelVehicles.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-danger mb-2">
                  Niveau Critique (&lt; 15%) - Action Immédiate Requise
                </h4>
                <div className="space-y-2">
                  {criticalFuelVehicles.map((vehicle) => (
                    <div key={vehicle.id} className="flex items-center justify-between p-2 bg-danger/10 rounded">
                      <span className="font-medium">{vehicle.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-danger font-bold">{vehicle.fuelLevel}%</span>
                        <Button size="sm" className="bg-danger text-danger-foreground">
                          Ravitailler
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {lowFuelVehicles.filter(v => v.fuelLevel >= 15).length > 0 && (
              <div>
                <h4 className="font-medium text-warning mb-2">
                  Niveau Bas (&lt; 25%) - Planifier Ravitaillement
                </h4>
                <div className="space-y-2">
                  {lowFuelVehicles.filter(v => v.fuelLevel >= 15).map((vehicle) => (
                    <div key={vehicle.id} className="flex items-center justify-between p-2 bg-warning/10 rounded">
                      <span className="font-medium">{vehicle.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-warning font-bold">{vehicle.fuelLevel}%</span>
                        <Button size="sm" variant="outline">
                          Planifier
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Fuel Levels */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FuelIcon className="h-5 w-5 mr-2" />
              Niveaux de Carburant Actuels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {vehicles.map((vehicle) => {
                const fuelStatus = getFuelStatus(vehicle.fuelLevel)
                return (
                  <div key={vehicle.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{vehicle.name}</h4>
                      <p className="text-sm text-muted-foreground">{vehicle.plateNumber}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className={`text-lg font-bold ${getFuelLevelColor(vehicle.fuelLevel)}`}>
                        {vehicle.fuelLevel}%
                      </div>
                      <Badge 
                        className={`
                          ${fuelStatus.status === 'success' ? 'bg-success text-success-foreground' : ''}
                          ${fuelStatus.status === 'warning' ? 'bg-warning text-warning-foreground' : ''}
                          ${fuelStatus.status === 'danger' ? 'bg-danger text-danger-foreground' : ''}
                        `}
                      >
                        {fuelStatus.label}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Fuel Consumption */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Consommation Récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {fuelConsumption.slice(-10).map((entry, index) => {
                const vehicle = vehicles.find(v => v.id === entry.vehicleId)
                return (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium">{vehicle?.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {entry.date.toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-medium">{entry.consumption.toFixed(1)}L</div>
                      <div className="text-sm text-muted-foreground">{entry.cost.toFixed(2)}€</div>
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