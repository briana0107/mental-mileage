export type Settings = {
  distanceKm: number;
  fuelCostMode: "liter" | "fillup";
  fuelEfficiencyKmPerL: number;
  fuelPricePerL: number;
  fillupAmount: number;
  fillupRangeKm: number;
  transitFare: number;
  monthlyRent: number;
};

export type RideRecord = {
  id: string;
  createdAt: string;
  distanceKm: number;
  fuelCostMode?: "liter" | "fillup";
  fuelEfficiencyKmPerL: number;
  fuelPricePerL: number;
  fillupAmount?: number;
  fillupRangeKm?: number;
  fuelCostPerKm?: number;
  transitFare: number;
  fuelCost: number;
  mentalSavings: number;
};

export type RideEstimate = {
  fuelCost: number;
  mentalSavings: number;
};

export type AppStats = {
  totalSavings: number;
  todaySavings: number;
  monthSavings: number;
  monthTransitValue: number;
  monthFuelCost: number;
  monthDistanceKm: number;
  monthRideCount: number;
  recoveryRate: number;
  recoveryProgress: number;
};
