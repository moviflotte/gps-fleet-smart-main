export interface Vehicle {
  id: string
  name: string
  plateNumber: string
  model: string
  year: number
  status: "active" | "idle" | "maintenance" | "offline"
  location: {
    lat: number
    lng: number
    address: string
  }
  fuelLevel: number
  mileage: number
  lastUpdate: Date
  speed: number
  driver?: {
    name: string
    id: string
    phone: string
  }
  insurance: {
    company: string
    expiryDate: Date
    policyNumber: string
  }
  maintenance: {
    lastService: Date
    nextService: Date
    kmUntilService: number
  }
  agency?: string
}

export interface FuelConsumption {
  vehicleId: string
  date: Date
  consumption: number
  cost: number
  mileage: number
}

export interface Alert {
  id: string
  vehicleId: string
  type: "maintenance" | "insurance" | "fuel" | "speeding" | "geofence" | "idle_time"
  severity: "low" | "medium" | "high" | "critical"
  title: string
  message: string
  timestamp: Date
  isRead: boolean
  actionRequired: boolean
}

export interface Trip {
  id: string
  vehicleId: string
  startTime: Date
  endTime?: Date
  startLocation: {
    lat: number
    lng: number
    address: string
  }
  endLocation?: {
    lat: number
    lng: number
    address: string
  }
  distance: number
  duration: number
  avgSpeed: number
  maxSpeed: number
  fuelConsumed: number
  cost: number
}

export interface Mission {
  id: string
  title: string
  description: string
  vehicleId: string
  driverId: string
  startDate: Date
  endDate: Date
  status: "planned" | "in_progress" | "completed" | "cancelled"
  priority: "low" | "medium" | "high"
  startLocation: {
    lat: number
    lng: number
    address: string
  }
  endLocation: {
    lat: number
    lng: number
    address: string
  }
}

export interface Violation {
  id: string
  vehicleId: string
  type: "speeding" | "harsh_braking" | "harsh_acceleration" | "idle_time" | "geofence"
  severity: "low" | "medium" | "high"
  timestamp: Date
  location: {
    lat: number
    lng: number
    address: string
  }
  details: string
}

export interface GeofenceZone {
  id: string
  name: string
  type: "allowed" | "restricted"
  coordinates: Array<{ lat: number; lng: number }>
  isActive: boolean
}

// Mock data
export const vehicles: Vehicle[] = [
  {
    id: "1",
    name: "Camion Livraison 01",
    plateNumber: "AB-123-CD",
    model: "Mercedes Actros",
    year: 2021,
    status: "active",
    location: {
      lat: 48.8566,
      lng: 2.3522,
      address: "Paris, France"
    },
    fuelLevel: 75,
    mileage: 125000,
    lastUpdate: new Date(),
    speed: 65,
    driver: {
      name: "Jean Dupont",
      id: "d1",
      phone: "+33 6 12 34 56 78"
    },
    insurance: {
      company: "AXA Professional",
      expiryDate: new Date(2024, 11, 15),
      policyNumber: "AXA-FL-2024-001"
    },
    maintenance: {
      lastService: new Date(2024, 6, 15),
      nextService: new Date(2024, 11, 15),
      kmUntilService: 5000
    },
    agency: "Paris Centre"
  },
  {
    id: "2",
    name: "Fourgon 02",
    plateNumber: "EF-456-GH",
    model: "Ford Transit",
    year: 2020,
    status: "idle",
    location: {
      lat: 48.8606,
      lng: 2.3376,
      address: "Depot Central, Paris"
    },
    fuelLevel: 45,
    mileage: 89000,
    lastUpdate: new Date(Date.now() - 30 * 60 * 1000),
    speed: 0,
    insurance: {
      company: "Groupama",
      expiryDate: new Date(2024, 9, 20),
      policyNumber: "GRP-FL-2024-002"
    },
    maintenance: {
      lastService: new Date(2024, 7, 10),
      nextService: new Date(2024, 10, 10),
      kmUntilService: 1000
    },
    agency: "Paris Centre"
  },
  {
    id: "3",
    name: "Véhicule Service 03",
    plateNumber: "IJ-789-KL",
    model: "Peugeot Partner",
    year: 2019,
    status: "maintenance",
    location: {
      lat: 48.8738,
      lng: 2.2950,
      address: "Garage Réparations, Paris"
    },
    fuelLevel: 20,
    mileage: 156000,
    lastUpdate: new Date(Date.now() - 2 * 60 * 60 * 1000),
    speed: 0,
    driver: {
      name: "Marie Martin",
      id: "d2",
      phone: "+33 6 23 45 67 89"
    },
    insurance: {
      company: "MAIF",
      expiryDate: new Date(2024, 8, 5), // Expired
      policyNumber: "MAIF-FL-2024-003"
    },
    maintenance: {
      lastService: new Date(2024, 8, 1),
      nextService: new Date(2024, 8, 1), // Overdue
      kmUntilService: -5000
    },
    agency: "Paris Ouest"
  },
  {
    id: "4",
    name: "Camion Chantier 04",
    plateNumber: "MN-012-OP",
    model: "Volvo FH",
    year: 2022,
    status: "active",
    location: {
      lat: 48.8448,
      lng: 2.3748,
      address: "Chantier Est, Paris"
    },
    fuelLevel: 90,
    mileage: 45000,
    lastUpdate: new Date(),
    speed: 0,
    driver: {
      name: "Pierre Leblanc",
      id: "d3",
      phone: "+33 6 34 56 78 90"
    },
    insurance: {
      company: "Allianz",
      expiryDate: new Date(2025, 2, 10),
      policyNumber: "ALZ-FL-2024-004"
    },
    maintenance: {
      lastService: new Date(2024, 5, 20),
      nextService: new Date(2024, 11, 20),
      kmUntilService: 15000
    },
    agency: "Paris Est"
  },
  {
    id: "5",
    name: "Utilitaire 05",
    plateNumber: "QR-345-ST",
    model: "Renault Master",
    year: 2021,
    status: "offline",
    location: {
      lat: 48.8534,
      lng: 2.3488,
      address: "Dernière position connue"
    },
    fuelLevel: 60,
    mileage: 78000,
    lastUpdate: new Date(Date.now() - 4 * 60 * 60 * 1000),
    speed: 0,
    insurance: {
      company: "MMA",
      expiryDate: new Date(2025, 1, 28),
      policyNumber: "MMA-FL-2024-005"
    },
    maintenance: {
      lastService: new Date(2024, 4, 15),
      nextService: new Date(2024, 10, 15),
      kmUntilService: 2000
    },
    agency: "Paris Sud"
  }
]

export const fuelConsumption: FuelConsumption[] = [
  { vehicleId: "1", date: new Date(2024, 8, 1), consumption: 45.5, cost: 65.25, mileage: 124500 },
  { vehicleId: "1", date: new Date(2024, 8, 2), consumption: 42.3, cost: 60.65, mileage: 124800 },
  { vehicleId: "2", date: new Date(2024, 8, 1), consumption: 28.2, cost: 40.45, mileage: 88700 },
  { vehicleId: "2", date: new Date(2024, 8, 2), consumption: 31.1, cost: 44.65, mileage: 89000 },
]

export const violations: Violation[] = [
  {
    id: "v1",
    vehicleId: "1",
    type: "speeding",
    severity: "high",
    timestamp: new Date(2024, 8, 1, 14, 30),
    location: {
      lat: 48.8566,
      lng: 2.3522,
      address: "Autoroute A1, Paris"
    },
    details: "Vitesse: 95 km/h (limite: 80 km/h)"
  },
  {
    id: "v2",
    vehicleId: "2",
    type: "idle_time",
    severity: "medium",
    timestamp: new Date(2024, 8, 1, 10, 15),
    location: {
      lat: 48.8606,
      lng: 2.3376,
      address: "Zone de livraison, Paris"
    },
    details: "Temps d'arrêt: 45 minutes"
  },
  {
    id: "v3",
    vehicleId: "4",
    type: "harsh_braking",
    severity: "low",
    timestamp: new Date(2024, 8, 1, 16, 45),
    location: {
      lat: 48.8448,
      lng: 2.3748,
      address: "Boulevard Voltaire, Paris"
    },
    details: "Freinage brusque détecté"
  }
]

export const geofenceZones: GeofenceZone[] = [
  {
    id: "z1",
    name: "Zone de livraison Centre",
    type: "allowed",
    coordinates: [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.8600, lng: 2.3600 },
      { lat: 48.8500, lng: 2.3600 },
      { lat: 48.8500, lng: 2.3522 }
    ],
    isActive: true
  },
  {
    id: "z2",
    name: "Zone résidentielle interdite",
    type: "restricted",
    coordinates: [
      { lat: 48.8700, lng: 2.3200 },
      { lat: 48.8750, lng: 2.3300 },
      { lat: 48.8650, lng: 2.3300 },
      { lat: 48.8650, lng: 2.3200 }
    ],
    isActive: true
  }
]

// KPI calculations
export const getFleetKPIs = () => {
  const totalVehicles = vehicles.length
  const activeVehicles = vehicles.filter(v => v.status === "active").length
  const idleVehicles = vehicles.filter(v => v.status === "idle").length
  const maintenanceVehicles = vehicles.filter(v => v.status === "maintenance").length
  const offlineVehicles = vehicles.filter(v => v.status === "offline").length
  
  const totalFuelLevel = vehicles.reduce((sum, v) => sum + v.fuelLevel, 0) / vehicles.length
  const todayViolations = violations.filter(v => 
    v.timestamp.toDateString() === new Date().toDateString()
  ).length
  
  const totalMileage = vehicles.reduce((sum, v) => sum + v.mileage, 0)
  const avgMileage = totalMileage / vehicles.length
  
  return {
    totalVehicles,
    activeVehicles,
    idleVehicles,
    maintenanceVehicles,
    offlineVehicles,
    avgFuelLevel: Math.round(totalFuelLevel),
    todayViolations,
    avgMileage: Math.round(avgMileage)
  }
}