import type { AppStats, RideEstimate, RideRecord, Settings } from "../types";

export const DEFAULT_SETTINGS: Settings = {
  distanceKm: 2,
  fuelCostMode: "liter",
  fuelEfficiencyKmPerL: 15,
  fuelPricePerL: 2000,
  fillupAmount: 50000,
  fillupRangeKm: 375,
  transitFare: 1550,
  monthlyRent: 500000,
};

const finiteNumber = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
};

const nonNegativeNumber = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
};

export const normalizeSettings = (settings: Partial<Settings> | null | undefined): Settings => ({
  distanceKm: nonNegativeNumber(settings?.distanceKm ?? DEFAULT_SETTINGS.distanceKm),
  fuelCostMode: settings?.fuelCostMode === "fillup" ? "fillup" : "liter",
  fuelEfficiencyKmPerL: nonNegativeNumber(
    settings?.fuelEfficiencyKmPerL ?? DEFAULT_SETTINGS.fuelEfficiencyKmPerL,
  ),
  fuelPricePerL: nonNegativeNumber(settings?.fuelPricePerL ?? DEFAULT_SETTINGS.fuelPricePerL),
  fillupAmount: nonNegativeNumber(settings?.fillupAmount ?? DEFAULT_SETTINGS.fillupAmount),
  fillupRangeKm: nonNegativeNumber(settings?.fillupRangeKm ?? DEFAULT_SETTINGS.fillupRangeKm),
  transitFare: nonNegativeNumber(settings?.transitFare ?? DEFAULT_SETTINGS.transitFare),
  monthlyRent: nonNegativeNumber(settings?.monthlyRent ?? DEFAULT_SETTINGS.monthlyRent),
});

export const getFuelCostPerKm = (settings: Settings): number => {
  const normalized = normalizeSettings(settings);

  if (normalized.fuelCostMode === "fillup") {
    return normalized.fillupAmount > 0 && normalized.fillupRangeKm > 0
      ? normalized.fillupAmount / normalized.fillupRangeKm
      : 0;
  }

  return normalized.fuelEfficiencyKmPerL > 0 && normalized.fuelPricePerL > 0
    ? normalized.fuelPricePerL / normalized.fuelEfficiencyKmPerL
    : 0;
};

export const calculateRideEstimate = (settings: Settings): RideEstimate => {
  const normalized = normalizeSettings(settings);
  const fuelCost = normalized.distanceKm > 0 ? normalized.distanceKm * getFuelCostPerKm(normalized) : 0;

  return {
    fuelCost: Math.round(fuelCost),
    mentalSavings: Math.round(normalized.transitFare - fuelCost),
  };
};

export const createRideRecord = (settings: Settings, now = new Date()): RideRecord => {
  const normalized = normalizeSettings(settings);
  const estimate = calculateRideEstimate(normalized);

  return {
    id: crypto.randomUUID?.() ?? `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    createdAt: now.toISOString(),
    distanceKm: normalized.distanceKm,
    fuelCostMode: normalized.fuelCostMode,
    fuelEfficiencyKmPerL: normalized.fuelEfficiencyKmPerL,
    fuelPricePerL: normalized.fuelPricePerL,
    fillupAmount: normalized.fillupAmount,
    fillupRangeKm: normalized.fillupRangeKm,
    fuelCostPerKm: Math.round(getFuelCostPerKm(normalized)),
    transitFare: normalized.transitFare,
    fuelCost: estimate.fuelCost,
    mentalSavings: estimate.mentalSavings,
  };
};

const isSameLocalDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const isSameLocalMonth = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

export const getAppStats = (
  records: RideRecord[],
  settings: Settings,
  now = new Date(),
): AppStats => {
  const totalSavings = records.reduce((sum, record) => sum + finiteNumber(record.mentalSavings), 0);
  const todayRecords = records.filter((record) => isSameLocalDay(new Date(record.createdAt), now));
  const monthRecords = records.filter((record) => isSameLocalMonth(new Date(record.createdAt), now));

  const todaySavings = todayRecords.reduce(
    (sum, record) => sum + finiteNumber(record.mentalSavings),
    0,
  );
  const monthSavings = monthRecords.reduce(
    (sum, record) => sum + finiteNumber(record.mentalSavings),
    0,
  );
  const monthTransitValue = monthRecords.reduce(
    (sum, record) => sum + nonNegativeNumber(record.transitFare),
    0,
  );
  const monthFuelCost = monthRecords.reduce(
    (sum, record) => sum + nonNegativeNumber(record.fuelCost),
    0,
  );
  const monthDistanceKm = monthRecords.reduce(
    (sum, record) => sum + nonNegativeNumber(record.distanceKm),
    0,
  );
  const monthlyRent = nonNegativeNumber(settings.monthlyRent);
  const recoveryRate = monthlyRent > 0 ? (monthSavings / monthlyRent) * 100 : 0;
  const visibleRecoveryRate = Math.max(0, recoveryRate);

  return {
    totalSavings: Math.round(totalSavings),
    todaySavings: Math.round(todaySavings),
    monthSavings: Math.round(monthSavings),
    monthTransitValue: Math.round(monthTransitValue),
    monthFuelCost: Math.round(monthFuelCost),
    monthDistanceKm,
    monthRideCount: monthRecords.length,
    recoveryRate: visibleRecoveryRate,
    recoveryProgress: Math.min(100, visibleRecoveryRate),
  };
};

export const formatWon = (value: number, signed = false): string => {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  const formatter = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  });

  const absolute = `${formatter.format(Math.abs(rounded))}원`;
  if (signed && rounded > 0) return `+${absolute}`;
  if (rounded < 0) return `-${absolute}`;
  return absolute;
};

export const formatNumber = (value: number, digits = 0): string =>
  new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value: number): string => `${formatNumber(Math.max(0, value), 1)}%`;
