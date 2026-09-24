import type { Availability, MotoCategory, Pace } from '@/lib/moto';
import type { RidingStyle } from '@/lib/profile';

// Types et filtres de la recherche de motards (fonctions pures, sans accès réseau).

export type RiderResult = {
  id: string;
  username: string;
  avatarUrl: string;
  city: string | null;
  bio: string | null;
  ridingStyles: RidingStyle[];
  pace: Pace | null;
  availability: Availability[];
  licenseYear: number | null;
  moto: { brand: string; model: string; cc: number | null; category: MotoCategory | null } | null;
  distanceKm: number;
  isDemo?: boolean;
};

export type RiderFilters = {
  maxKm: number | null;
  categories: MotoCategory[];
  styles: RidingStyle[];
  paces: Pace[];
  minLicenseYears: number | null;
  availability: Availability[];
};

export const EMPTY_FILTERS: RiderFilters = {
  maxKm: 50,
  categories: [],
  styles: [],
  paces: [],
  minLicenseYears: null,
  availability: [],
};

/** Mêmes filtres que find_riders, appliqués en local (mode démo). */
export function matchesFilters(r: RiderResult, f: RiderFilters, currentYear: number) {
  if (f.maxKm !== null && r.distanceKm > f.maxKm) return false;
  if (f.categories.length && !(r.moto?.category && f.categories.includes(r.moto.category))) return false;
  if (f.styles.length && !r.ridingStyles.some((s) => f.styles.includes(s))) return false;
  if (f.paces.length && !(r.pace && f.paces.includes(r.pace))) return false;
  if (f.minLicenseYears !== null && !(r.licenseYear && currentYear - r.licenseYear >= f.minLicenseYears)) return false;
  if (f.availability.length && !r.availability.some((a) => f.availability.includes(a))) return false;
  return true;
}
