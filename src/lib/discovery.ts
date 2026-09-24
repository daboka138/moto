import type { LatLng } from '@/lib/geo';
import type { Availability, MotoCategory, Pace } from '@/lib/moto';
import type { RidingStyle } from '@/lib/profile';
import type { RiderFilters, RiderResult } from '@/lib/rider-filters';
import { supabase } from '@/lib/supabase';

export { EMPTY_FILTERS, matchesFilters, type RiderFilters, type RiderResult } from '@/lib/rider-filters';

// Recherche de motards pour rouler ensemble.
// - Opt-in : on n'apparaît que si on l'a activé (rider_discovery.discoverable).
// - Zone arrondie à ~5 km par le serveur, jamais renvoyée aux autres :
//   ils ne reçoivent qu'une distance en km (fonction find_riders).
// - Les motards en fantôme ou qui m'ont masqué ne ressortent pas.

export async function fetchDiscoverable(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('rider_discovery').select('discoverable').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.discoverable ?? false;
}

/** Active / désactive ma présence dans la recherche. La zone est arrondie par le serveur. */
export async function setDiscoverable(userId: string, discoverable: boolean, area: LatLng | null) {
  const { error } = await supabase.from('rider_discovery').upsert({
    user_id: userId,
    discoverable,
    ...(area ? { area_lat: area.latitude, area_lng: area.longitude } : {}),
  });
  if (error) throw error;
}

export async function findRiders(near: LatLng, f: RiderFilters, photoUrl: (path: string) => string): Promise<RiderResult[]> {
  const { data, error } = await supabase.rpc('find_riders', {
    p_lat: near.latitude,
    p_lng: near.longitude,
    p_max_km: f.maxKm,
    p_categories: f.categories.length ? f.categories : null,
    p_styles: f.styles.length ? f.styles : null,
    p_paces: f.paces.length ? f.paces : null,
    p_min_license_years: f.minLicenseYears,
    p_availability: f.availability.length ? f.availability : null,
  });
  if (error) throw error;
  type Row = {
    id: string;
    username: string;
    avatar_path: string;
    city: string | null;
    bio: string | null;
    riding_styles: RidingStyle[];
    pace: Pace | null;
    availability: Availability[];
    license_year: number | null;
    moto_brand: string | null;
    moto_model: string | null;
    moto_cc: number | null;
    moto_category: MotoCategory | null;
    distance_km: number;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: photoUrl(r.avatar_path),
    city: r.city,
    bio: r.bio,
    ridingStyles: r.riding_styles,
    pace: r.pace,
    availability: r.availability,
    licenseYear: r.license_year,
    moto: r.moto_brand
      ? { brand: r.moto_brand, model: r.moto_model ?? '', cc: r.moto_cc, category: r.moto_category }
      : null,
    distanceKm: r.distance_km,
  }));
}
