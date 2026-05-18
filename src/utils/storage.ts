import type { RideRecord, Settings } from "../types";
import { DEFAULT_SETTINGS, normalizeSettings } from "./calculations";

const SETTINGS_KEY = "mental-mileage.settings";
const RECORDS_KEY = "mental-mileage.records";

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota should not break the app experience.
  }
};

const isRecord = (value: unknown): value is RideRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RideRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "string" &&
    Number.isFinite(Date.parse(record.createdAt)) &&
    Number.isFinite(record.distanceKm) &&
    Number.isFinite(record.fuelEfficiencyKmPerL) &&
    Number.isFinite(record.fuelPricePerL) &&
    Number.isFinite(record.transitFare) &&
    Number.isFinite(record.fuelCost) &&
    Number.isFinite(record.mentalSavings)
  );
};

export const loadSettings = (): Settings => {
  const stored = readJson<Partial<Settings>>(SETTINGS_KEY, DEFAULT_SETTINGS);
  return normalizeSettings(stored);
};

export const saveSettings = (settings: Settings) => {
  writeJson(SETTINGS_KEY, normalizeSettings(settings));
};

export const loadRecords = (): RideRecord[] => {
  const stored = readJson<unknown>(RECORDS_KEY, []);
  if (!Array.isArray(stored)) {
    localStorage.removeItem(RECORDS_KEY);
    return [];
  }

  const records = stored.filter(isRecord);
  if (records.length !== stored.length) writeJson(RECORDS_KEY, records);
  return records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

export const saveRecords = (records: RideRecord[]) => {
  writeJson(RECORDS_KEY, records);
};
