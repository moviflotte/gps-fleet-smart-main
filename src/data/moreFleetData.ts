import { Alert, Trip, Mission } from "./fleetData"

export const alerts: Alert[] = [
  {
    id: "a1",
    vehicleId: "3",
    type: "insurance",
    severity: "critical",
    title: "Assurance Expirée",
    message: "L'assurance du véhicule IJ-789-KL a expiré le 05/09/2024",
    timestamp: new Date(2024, 8, 6),
    isRead: false,
    actionRequired: true
  },
  {
    id: "a2",
    vehicleId: "3",
    type: "maintenance",
    severity: "high",
    title: "Maintenance en Retard",
    message: "Entretien obligatoire dépassé de 5000 km",
    timestamp: new Date(),
    isRead: false,
    actionRequired: true
  },
  {
    id: "a3",
    vehicleId: "2",
    type: "maintenance",
    severity: "medium",
    title: "Maintenance Prochaine",
    message: "Prochain entretien dans 1000 km",
    timestamp: new Date(),
    isRead: false,
    actionRequired: false
  },
  {
    id: "a4",
    vehicleId: "1",
    type: "speeding",
    severity: "high",
    title: "Excès de Vitesse",
    message: "Vitesse de 95 km/h détectée (limite: 80 km/h)",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isRead: true,
    actionRequired: false
  },
  {
    id: "a5",
    vehicleId: "2",
    type: "fuel",
    severity: "medium",
    title: "Niveau Carburant Bas",
    message: "Niveau de carburant à 45% - Ravitaillement recommandé",
    timestamp: new Date(),
    isRead: false,
    actionRequired: false
  },
  {
    id: "a6",
    vehicleId: "5",
    type: "geofence",
    severity: "high",
    title: "Sortie de Zone Autorisée",
    message: "Véhicule détecté hors zone de livraison autorisée",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
    isRead: false,
    actionRequired: true
  }
]

export const trips: Trip[] = [
  {
    id: "t1",
    vehicleId: "1",
    startTime: new Date(2024, 8, 1, 8, 0),
    endTime: new Date(2024, 8, 1, 12, 30),
    startLocation: {
      lat: 48.8566,
      lng: 2.3522,
      address: "Dépôt Principal, Paris"
    },
    endLocation: {
      lat: 48.8606,
      lng: 2.3376,
      address: "Zone Livraison Nord, Paris"
    },
    distance: 85.2,
    duration: 270, // minutes
    avgSpeed: 35,
    maxSpeed: 78,
    fuelConsumed: 12.5,
    cost: 18.75
  },
  {
    id: "t2",
    vehicleId: "2",
    startTime: new Date(2024, 8, 1, 9, 15),
    endTime: new Date(2024, 8, 1, 11, 45),
    startLocation: {
      lat: 48.8606,
      lng: 2.3376,
      address: "Dépôt Central, Paris"
    },
    endLocation: {
      lat: 48.8738,
      lng: 2.2950,
      address: "Client Entreprise A, Paris"
    },
    distance: 42.8,
    duration: 150,
    avgSpeed: 28,
    maxSpeed: 65,
    fuelConsumed: 8.2,
    cost: 12.30
  },
  {
    id: "t3",
    vehicleId: "4",
    startTime: new Date(2024, 8, 1, 7, 30),
    endTime: new Date(2024, 8, 1, 16, 0),
    startLocation: {
      lat: 48.8448,
      lng: 2.3748,
      address: "Base Chantier, Paris"
    },
    endLocation: {
      lat: 48.8534,
      lng: 2.3488,
      address: "Chantier Périphérique, Paris"
    },
    distance: 156.4,
    duration: 510,
    avgSpeed: 32,
    maxSpeed: 85,
    fuelConsumed: 28.6,
    cost: 42.90
  }
]

export const missions: Mission[] = [
  {
    id: "m1",
    title: "Livraison Urgente Centre-Ville",
    description: "Transport de matériel médical urgent vers l'hôpital Saint-Louis",
    vehicleId: "1",
    driverId: "d1",
    startDate: new Date(2024, 8, 2, 10, 0),
    endDate: new Date(2024, 8, 2, 14, 0),
    status: "planned",
    priority: "high",
    startLocation: {
      lat: 48.8566,
      lng: 2.3522,
      address: "Entrepôt Médical, Paris"
    },
    endLocation: {
      lat: 48.8738,
      lng: 2.3681,
      address: "Hôpital Saint-Louis, Paris"
    }
  },
  {
    id: "m2",
    title: "Tournée Clients Zone Est",
    description: "Livraisons multiples dans le secteur République - Bastille",
    vehicleId: "2",
    driverId: "d2",
    startDate: new Date(2024, 8, 2, 8, 30),
    endDate: new Date(2024, 8, 2, 17, 0),
    status: "in_progress",
    priority: "medium",
    startLocation: {
      lat: 48.8606,
      lng: 2.3376,
      address: "Dépôt Central, Paris"
    },
    endLocation: {
      lat: 48.8534,
      lng: 2.3488,
      address: "Zone Est, Paris"
    }
  },
  {
    id: "m3",
    title: "Transport Chantier",
    description: "Acheminement de matériaux de construction",
    vehicleId: "4",
    driverId: "d3",
    startDate: new Date(2024, 8, 1, 6, 0),
    endDate: new Date(2024, 8, 1, 18, 0),
    status: "completed",
    priority: "low",
    startLocation: {
      lat: 48.8448,
      lng: 2.3748,
      address: "Dépôt Matériaux, Paris"
    },
    endLocation: {
      lat: 48.8606,
      lng: 2.3376,
      address: "Chantier BTP, Paris"
    }
  },
  {
    id: "m4",
    title: "Maintenance Préventive",
    description: "Inspection technique et changement d'huile",
    vehicleId: "3",
    driverId: "d2",
    startDate: new Date(2024, 8, 3, 9, 0),
    endDate: new Date(2024, 8, 3, 12, 0),
    status: "planned",
    priority: "high",
    startLocation: {
      lat: 48.8738,
      lng: 2.2950,
      address: "Garage Central, Paris"
    },
    endLocation: {
      lat: 48.8738,
      lng: 2.2950,
      address: "Garage Central, Paris"
    }
  }
]