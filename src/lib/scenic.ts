import type { LatLng } from '@/lib/geo';
import type { Attractor } from '@/lib/loop';
import { fetchPlacesAround } from '@/lib/places';
import { supabase } from '@/lib/supabase';

// Cols et routes réputés par région (table scenic_waypoints, console admin) + spots « belle route » /
// « point de vue » bien notés de la communauté : points de passage préférés de « Fais-moi une boucle ».

export type ScenicKind = 'col' | 'road' | 'viewpoint';

export const SCENIC_KINDS: { value: ScenicKind; label: string; emoji: string }[] = [
  { value: 'col', label: 'Col', emoji: '⛰️' },
  { value: 'road', label: 'Belle route', emoji: '🛣️' },
  { value: 'viewpoint', label: 'Point de vue', emoji: '📸' },
];

export type ScenicWaypoint = LatLng & { id: string; name: string; region: string; kind: ScenicKind; active: boolean };

export type ScenicDraft = Omit<ScenicWaypoint, 'id'> & { id?: string };

const FIELDS = 'id, name, region, kind, latitude, longitude, active';

/** Cols et routes réputés autour d'un point (carré de radiusKm), ou tous (console) */
export async function fetchScenic(center?: LatLng, radiusKm = 80): Promise<ScenicWaypoint[]> {
  let q = supabase.from('scenic_waypoints').select(FIELDS).order('region').order('name');
  if (center) {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));
    q = q
      .gte('latitude', center.latitude - dLat)
      .lte('latitude', center.latitude + dLat)
      .gte('longitude', center.longitude - dLng)
      .lte('longitude', center.longitude + dLng);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ScenicWaypoint[];
}

/** Note minimale d'un spot de la communauté pour servir de point de passage */
const MIN_SPOT_RATING = 4;

/**
 * Points de passage préférés autour du départ : cols et routes réputés (poids 1), puis spots
 * « belle route » et « point de vue » notés 4/5 ou plus (poids selon la note). Jamais bloquant.
 */
export async function loopAttractors(center: LatLng, radiusKm = 70): Promise<Attractor[]> {
  const [scenic, spots] = await Promise.all([
    fetchScenic(center, radiusKm).catch(() => []),
    fetchPlacesAround(center, radiusKm).catch(() => []),
  ]);
  return [
    ...scenic.filter((s) => s.active).map((s) => ({ latitude: s.latitude, longitude: s.longitude, name: s.name, weight: 1 })),
    ...spots
      .filter((p) => (p.kind === 'road' || p.kind === 'viewpoint') && (p.rating ?? 0) >= MIN_SPOT_RATING)
      .map((p) => ({ latitude: p.latitude, longitude: p.longitude, name: p.name, weight: 0.6 + ((p.rating ?? 4) - 4) * 0.3 })),
  ];
}

// ---------- Console admin (écriture refusée aux autres par RLS) ----------

export async function saveScenic(d: ScenicDraft) {
  const row = { name: d.name.trim(), region: d.region.trim(), kind: d.kind, latitude: d.latitude, longitude: d.longitude, active: d.active };
  const { error } = d.id
    ? await supabase.from('scenic_waypoints').update(row).eq('id', d.id)
    : await supabase.from('scenic_waypoints').insert(row);
  if (error) throw new Error(error.message);
}

export async function deleteScenic(id: string) {
  const { error } = await supabase.from('scenic_waypoints').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
