import { formatPrice, nearestFuelStations, priceOf, stationOpenState, stationTitle, type FuelStation } from '@/lib/fuel-prices';
import { distanceM, type LatLng } from '@/lib/geo';
import { cachedParkings, nearestParkings, parkingFacts, parkingTitle, type MotoParking } from '@/lib/moto-parkings';
import { fetchPlacesAround, type PlaceKind } from '@/lib/places';
import { overpass } from '@/lib/pois';
import { photonAround, type SearchResult } from '@/lib/search';

// Recherche « autour de moi » en 1 tap (sous la barre de recherche) : stations, cafés / restos,
// parkings moto, garages moto, du plus proche au plus loin. Objectif : une liste en moins de 2 s.
// - Spots PasseRyder de la catégorie (Supabase, filtrés par type côté serveur)
// - Stations : prix officiels (fuel_stations, France) ; ailleurs comme les restos / garages
// - Restos / garages : Photon (komoot, < 1 s) ; Overpass seulement si Photon échoue
// - Parkings moto : UNIQUEMENT de vrais parkings moto (amenity=motorcycle_parking) + spots « parking » :
//   fichiers préparés (France, lib/moto-parkings), sinon Photon + Overpass
// Les résultats arrivent au fur et à mesure (onUpdate) et sont gardés 24 h par zone de ~1 km.

export type NearbyCategory = 'fuel' | 'food' | 'parking' | 'moto_garage';

export const NEARBY_CATEGORIES: { value: NearbyCategory; label: string; emoji: string }[] = [
  { value: 'fuel', label: 'Station', emoji: '⛽' },
  { value: 'food', label: 'Café / Resto', emoji: '🍴' },
  { value: 'parking', label: 'Parking moto', emoji: '🅿️' },
  { value: 'moto_garage', label: 'Garage moto', emoji: '🔧' },
];

const PHOTON_TAGS: Record<NearbyCategory, string[]> = {
  fuel: ['amenity:fuel'],
  food: ['amenity:cafe', 'amenity:restaurant', 'amenity:fast_food', 'amenity:bar'],
  parking: ['amenity:motorcycle_parking'],
  moto_garage: ['shop:motorcycle', 'shop:motorcycle_repair', 'craft:motorcycle_repair'],
};

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

const MAX = 10;
const CACHE_KEY = 'moto.nearby.v1';
const CACHE_TTL_MS = 24 * 3600_000;
/** Stations : les prix changent, cache court */
const FUEL_TTL_MS = 30 * 60_000;
const CACHE_MAX = 40;

/** Recherche « parking moto », « garage moto »… tapée dans la barre → catégorie */
export function categoryFromQuery(q: string): NearbyCategory | null {
  const t = q.trim().toLowerCase();
  if (/^(parking|stationnement)s?( (moto|deux[- ]roues|2 ?roues))?$|^(moto|2 ?roues) parking$/.test(t)) return 'parking';
  if (/^(garage|concession(naire)?|m[ée]cano?|atelier)s? moto$/.test(t)) return 'moto_garage';
  if (/^(station[ -]?(essence|service)?|essence|carburant|pompe)$/.test(t)) return 'fuel';
  return null;
}

const emojiOf = (cat: NearbyCategory) => NEARBY_CATEGORIES.find((c) => c.value === cat)!.emoji;

// ---------- Cache par zone (~1 km) ----------

type CacheEntry = { t: number; results: SearchResult[] };
const cacheId = (cat: NearbyCategory, near: LatLng) => `${cat}:${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}`;

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function cached(cat: NearbyCategory, near: LatLng): SearchResult[] | null {
  const e = readCache()[cacheId(cat, near)];
  if (!e || Date.now() - e.t > (cat === 'fuel' ? FUEL_TTL_MS : CACHE_TTL_MS)) return null;
  // Distances recalculées depuis ma position actuelle
  return e.results.map((r) => ({ ...r, distanceM: distanceM(near, r) })).sort((a, b) => a.distanceM! - b.distanceM!);
}

function store(cat: NearbyCategory, near: LatLng, results: SearchResult[]) {
  if (!results.length) return;
  try {
    const c = readCache();
    c[cacheId(cat, near)] = { t: Date.now(), results };
    const keys = Object.keys(c).sort((a, b) => c[b].t - c[a].t);
    for (const k of keys.slice(CACHE_MAX)) delete c[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // stockage indisponible : pas de cache
  }
}

// ---------- Sources ----------

async function spotsAround(cat: NearbyCategory, near: LatLng, radius: number): Promise<SearchResult[]> {
  const spots = await fetchPlacesAround(near, radius / 1000, SPOT_KINDS[cat]).catch(() => []);
  return spots
    .map((s) => ({
      latitude: s.latitude,
      longitude: s.longitude,
      label: s.name,
      detail: `Spot PasseRyder${s.rating != null ? ` · ★ ${s.rating.toFixed(1).replace('.', ',')}` : ''}`,
      source: 'lieu' as const,
      emoji: emojiOf(cat),
      distanceM: distanceM(near, s),
    }))
    .filter((s) => s.distanceM <= radius);
}

/** Parking OSM (cache de l'appareil ou Overpass) → résultat */
const fromParking = (p: MotoParking & { distanceM: number }): SearchResult => ({
  latitude: p.latitude,
  longitude: p.longitude,
  label: parkingTitle(p),
  detail: [p.address, parkingFacts(p)].filter(Boolean).join(' · ') || undefined,
  source: 'lieu',
  emoji: '🅿️',
  distanceM: p.distanceM,
});

/** Station aux prix officiels → résultat : SP95-E10 et SP98 (essence moto), ouverte ou non */
const fromStation = (s: FuelStation & { distanceM: number }): SearchResult => {
  const prices = (['e10', 'sp98'] as const)
    .map((f) => {
      const p = priceOf(s, f);
      return p === null ? null : `${f === 'e10' ? 'E10' : 'SP98'} ${formatPrice(p)}`;
    })
    .filter(Boolean);
  const open = stationOpenState(s);
  return {
    latitude: s.latitude,
    longitude: s.longitude,
    label: stationTitle(s),
    detail: [...prices, open.state === 'unknown' ? null : open.text, s.address].filter(Boolean).join(' · ') || undefined,
    source: 'lieu',
    emoji: '⛽',
    distanceM: s.distanceM,
  };
};

async function photonCat(cat: NearbyCategory, near: LatLng, radius: number): Promise<SearchResult[]> {
  const list = await photonAround(PHOTON_TAGS[cat], near, radius / 1000);
  // Parking « nommé » d'un simple numéro (« 7 ») : Parking moto n° 7
  return cat === 'parking' ? list.map((r) => (/^\d+$/.test(r.label) ? { ...r, label: `Parking moto n° ${r.label}` } : r)) : list;
}

async function overpassCat(cat: Exclude<NearbyCategory, 'parking'>, near: LatLng, radius: number): Promise<SearchResult[]> {
  const ll = `${near.latitude.toFixed(3)},${near.longitude.toFixed(3)}`;
  const body = OSM_FILTERS[cat].map((f) => `nwr${f}(around:${radius},${ll});`).join('');
  const elements = await overpass(`[out:json][timeout:8];(${body});out center tags 80;`, { timeoutMs: 8000 });
  const out: SearchResult[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    const name = tags.name || tags.brand || FALLBACK[cat];
    const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
    const point = { latitude: lat, longitude: lon };
    out.push({
      ...point,
      label: name,
      detail: [street, tags['addr:city']].filter(Boolean).join(', ') || undefined,
      source: 'lieu',
      emoji: cat === 'food' && (tags.amenity === 'cafe' || tags.amenity === 'bar') ? '☕' : emojiOf(cat),
      distanceM: distanceM(near, point),
    });
  }
  return out;
}

/** Spots d'abord (ils ont des avis), puis lieux OSM sans doublon (< 60 m), du plus proche au plus loin */
function merge(spots: SearchResult[], ...others: SearchResult[][]): SearchResult[] {
  const out = [...spots];
  for (const list of others)
    for (const r of list) if (!out.some((o) => distanceM(o, r) < (spots.includes(o) ? 60 : 12))) out.push(r);
  return out.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0)).slice(0, MAX);
}

/**
 * Lieux de la catégorie autour d'un point, du plus proche au plus loin.
 * onUpdate reçoit les résultats au fur et à mesure (cache, spots, Photon…) ; la promesse rend la liste finale.
 */
export async function searchNearby(
  cat: NearbyCategory,
  near: LatLng,
  onUpdate?: (results: SearchResult[]) => void,
): Promise<SearchResult[]> {
  const hit = cached(cat, near);
  if (hit) {
    onUpdate?.(hit.slice(0, MAX));
    return hit.slice(0, MAX);
  }

  let spots: SearchResult[] = [];
  let osm: SearchResult[] = [];
  let extra: SearchResult[] = [];
  // Stations aux prix officiels : remplacent celles d'OpenStreetMap (même station, positions différentes)
  let official: SearchResult[] = [];
  const others = () => (official.length ? official : osm);
  const push = () => onUpdate?.(merge(spots, others(), extra));

  if (cat === 'parking') {
    extra = cachedParkings(near, 5000).map(fromParking);
    if (extra.length) push();
  }

  const spotsP = spotsAround(cat, near, 15000).then((s) => {
    spots = s;
    push();
  });

  let failures = 0;
  const quick = async (radius: number) => {
    try {
      osm = await photonCat(cat, near, radius);
      push();
    } catch (e) {
      failures++;
      console.warn('Recherche autour de moi impossible (Photon)', e);
      if (cat !== 'parking') {
        try {
          osm = await overpassCat(cat, near, radius);
          push();
        } catch {
          failures++;
        }
      }
    }
  };

  // Parkings : Overpass (plus complet que Photon) en parallèle, intégré dès qu'il répond
  const fullP =
    cat === 'parking'
      ? nearestParkings(near, 5000)
          .then((list) => {
            extra = merge([], extra, list.map(fromParking));
            push();
          })
          .catch(() => {
            failures++;
          })
      : Promise.resolve();

  const officialP =
    cat === 'fuel'
      ? nearestFuelStations(near, 20)
          .then((list) => {
            official = list.map(fromStation);
            push();
          })
          .catch((e) => console.warn('Prix des carburants indisponibles', e))
      : Promise.resolve();

  // Une seule requête : Photon rend les plus proches d'abord (20 km ; parkings : 5 km, inutile plus loin)
  await Promise.all([quick(cat === 'parking' ? 5000 : 20000), spotsP, officialP]);
  await fullP;

  const final = merge(spots, others(), extra);
  if (!final.length && failures >= (cat === 'parking' ? 2 : 1)) throw new Error('Recherche indisponible pour le moment.');
  store(cat, near, final);
  return final;
}
