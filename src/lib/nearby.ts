import { distanceM, type LatLng } from '@/lib/geo';
import { nearestParkings, parkingFacts, parkingTitle } from '@/lib/moto-parkings';
import { fetchPlacesAround, type PlaceKind } from '@/lib/places';
import { overpass } from '@/lib/pois';
import type { SearchResult } from '@/lib/search';

// Recherche « autour de moi » en 1 tap (sous la barre de recherche) : stations, cafés / restos,
// parkings moto, garages moto. Lieux OpenStreetMap (Overpass) + spots PasseRyder de la même
// catégorie, du plus proche au plus loin (5 km, élargi à 20 km s'il y en a trop peu).

export type NearbyCategory = 'fuel' | 'food' | 'parking' | 'moto_garage';

export const NEARBY_CATEGORIES: { value: NearbyCategory; label: string; emoji: string }[] = [
  { value: 'fuel', label: 'Station', emoji: '⛽' },
  { value: 'food', label: 'Café / Resto', emoji: '🍴' },
  { value: 'parking', label: 'Parking moto', emoji: '🅿️' },
  { value: 'moto_garage', label: 'Garage moto', emoji: '🔧' },
];

const OSM_FILTERS: Record<Exclude<NearbyCategory, 'parking'>, string[]> = {
  fuel: ['["amenity"="fuel"]'],
  food: ['["amenity"~"^(cafe|restaurant|fast_food|bar)$"]'],
  moto_garage: ['["shop"~"^(motorcycle|motorcycle_repair)$"]', '["craft"="motorcycle_repair"]'],
};

const SPOT_KINDS: Record<NearbyCategory, PlaceKind[]> = {
  fuel: ['fuel'],
  food: ['biker_cafe'],
  parking: ['parking'],
  moto_garage: ['garage'],
};

const FALLBACK: Record<NearbyCategory, string> = {
  fuel: 'Station-service',
  food: 'Café / restaurant',
  parking: 'Parking moto',
  moto_garage: 'Garage moto',
};

/** Emoji d'un lieu OSM selon ses tags */
function emojiOf(tags: Record<string, string>, cat: NearbyCategory) {
  if (cat === 'food') return tags.amenity === 'cafe' || tags.amenity === 'bar' ? '☕' : '🍴';
  return NEARBY_CATEGORIES.find((c) => c.value === cat)!.emoji;
}

const MAX = 10;

/** Recherche « parking moto », « garage moto »… tapée dans la barre → catégorie */
export function categoryFromQuery(q: string): NearbyCategory | null {
  const t = q.trim().toLowerCase();
  if (/^(parking|stationnement)s?( (moto|deux[- ]roues|2 ?roues))?$|^(moto|2 ?roues) parking$/.test(t)) return 'parking';
  if (/^(garage|concession(naire)?|m[ée]cano?|atelier)s? moto$/.test(t)) return 'moto_garage';
  if (/^(station[ -]?(essence|service)?|essence|carburant|pompe)$/.test(t)) return 'fuel';
  return null;
}

async function osmAround(cat: Exclude<NearbyCategory, 'parking'>, near: LatLng, radius: number): Promise<SearchResult[]> {
  const ll = `${near.latitude.toFixed(5)},${near.longitude.toFixed(5)}`;
  const body = OSM_FILTERS[cat].map((f) => `nwr${f}(around:${radius},${ll});`).join('');
  const elements = await overpass(`[out:json][timeout:20];(${body});out center tags 150;`);
  const out: SearchResult[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    const name = tags.name || tags.brand || FALLBACK[cat];
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    const brand = tags.brand && tags.brand !== name ? tags.brand : null;
    const point = { latitude: lat, longitude: lon };
    out.push({
      ...point,
      label: name,
      detail: [brand, street, tags['addr:city']].filter(Boolean).join(' · ') || undefined,
      source: 'lieu',
      emoji: emojiOf(tags, cat),
      distanceM: distanceM(near, point),
    });
  }
  return out;
}

async function spotsAround(cat: NearbyCategory, near: LatLng, radius: number): Promise<SearchResult[]> {
  const spots = await fetchPlacesAround(near, radius / 1000).catch(() => []);
  return spots
    .filter((s) => SPOT_KINDS[cat].includes(s.kind))
    .map((s) => ({
      latitude: s.latitude,
      longitude: s.longitude,
      label: s.name,
      detail: `Spot PasseRyder${s.rating != null ? ` · ★ ${s.rating.toFixed(1).replace('.', ',')}` : ''}`,
      source: 'lieu' as const,
      emoji: NEARBY_CATEGORIES.find((c) => c.value === cat)!.emoji,
      distanceM: distanceM(near, s),
    }))
    .filter((s) => s.distanceM <= radius);
}

/** Lieux de la catégorie autour d'un point, du plus proche au plus loin */
export async function searchNearby(cat: NearbyCategory, near: LatLng): Promise<SearchResult[]> {
  const run = async (radius: number) => {
    const [osm, spots] = await Promise.all([
      cat === 'parking'
        ? nearestParkings(near, MAX).then((list) =>
            list.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
              label: parkingTitle(p),
              detail: [p.address, parkingFacts(p)].filter(Boolean).join(' · ') || undefined,
              source: 'lieu' as const,
              emoji: '🅿️',
              distanceM: p.distanceM,
            })),
          )
        : osmAround(cat, near, radius),
      spotsAround(cat, near, Math.max(radius, 15000)),
    ]);
    // Un spot PasseRyder à moins de 60 m d'un lieu OSM le remplace (il a des avis)
    const merged = [...spots, ...osm.filter((o) => !spots.some((s) => distanceM(s, o) < 60))];
    return merged.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  };
  const first = await run(5000);
  if (first.length >= 3 || cat === 'parking') return first.slice(0, MAX);
  return (await run(20000)).slice(0, MAX);
}
