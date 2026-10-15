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
