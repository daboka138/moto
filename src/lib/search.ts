import { Platform } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';

// Recherche de destination :
// - adresses : API Adresse (Base Adresse Nationale, désormais servie par la
//   Géoplateforme IGN : l'ancienne URL api-adresse.data.gouv.fr y redirige). Gratuite, sans clé.
// - lieux (restos, stations…) : Nominatim (OpenStreetMap). Sa charte interdit
//   l'autocomplétion : on ne l'appelle que sur demande explicite, 1 requête à la fois.

export type SearchResult = LatLng & { label: string; detail?: string; source: 'adresse' | 'lieu' };

const BAN = 'https://data.geopf.fr/geocodage';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'PasseRyder/1.0 (https://passeryder.fr)';
const TIMEOUT_MS = 10_000;
const HISTORY_KEY = 'moto.searchHistory';
const HISTORY_MAX = 8;

/** Requête JSON avec User-Agent identifié et délai max (sinon une requête bloquée fige l'écran). */
async function getJson<T>(url: string, what: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Navigateur : User-Agent interdit (et il déclencherait une pré-requête CORS) ; le Referer identifie le site
    const headers: Record<string, string> = Platform.OS === 'web' ? { Accept: 'application/json' } : { 'User-Agent': USER_AGENT, Accept: 'application/json' };
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`${what} indisponible (${res.status})`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchAddresses(query: string, near: LatLng | null): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: '6', autocomplete: '1' });
  if (near) {
    params.set('lat', String(near.latitude));
    params.set('lon', String(near.longitude));
  }
  const json = await getJson<{ features?: BanFeature[] }>(`${BAN}/search?${params}`, "Recherche d'adresse");
  return (json.features ?? []).map(
    (f) => ({
      label: f.properties.label,
      detail: f.properties.context,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      source: 'adresse' as const,
    }),
  );
}

type BanFeature = { geometry: { coordinates: [number, number] }; properties: { label: string; context?: string } };
type NominatimPlace = { lat: string; lon: string; name?: string; display_name: string };

let lastNominatimCall = 0;

async function nominatimGet<T>(path: string, params: URLSearchParams): Promise<T> {
  // Charte Nominatim : 1 requête par seconde maximum
  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  return getJson<T>(`${NOMINATIM}/${path}?${params}`, 'Recherche de lieux');
}

async function nominatim(params: URLSearchParams): Promise<SearchResult[]> {
  const json = await nominatimGet<NominatimPlace[]>('search', params);
  return json.map((p) => {
    const parts = p.display_name.split(', ');
    return {
      label: p.name || parts[0],
      detail: parts.slice(1, 4).join(', '),
      latitude: Number(p.lat),
      longitude: Number(p.lon),
      source: 'lieu' as const,
    };
  });
}

// Dans OSM, les lieux portent leur nom propre (« Total », « Chez Paul »). Nominatim reconnaît
// en revanche des mots de catégorie : on traduit les recherches courantes.
const SYNONYMS: [RegExp, string][] = [
  [/^(station[ -]?essence|essence|carburant|pompe|station)$/i, 'station-service'],
  [/^(resto|restau)$/i, 'restaurant'],
  [/^(caf[ée]|bistrot)$/i, 'café'],
  [/^(parking moto)$/i, 'parking'],
];

/** Au-delà, un « lieu » n'est pas pertinent pour une balade */
const MAX_PLACE_DISTANCE_M = 150_000;

/** Lieux (restos, stations…) : d'abord dans un rayon d'environ 50 km, puis plus loin (150 km max). */
export async function searchPlaces(query: string, near: LatLng | null): Promise<SearchResult[]> {
  const raw = query.trim();
  if (raw.length < 3) return [];
  const q = SYNONYMS.find(([re]) => re.test(raw))?.[1] ?? raw;
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '8', 'accept-language': 'fr', countrycodes: 'fr' });
  if (near) {
    const d = 0.5;
    const local = new URLSearchParams(params);
    local.set('viewbox', `${near.longitude - d},${near.latitude + d},${near.longitude + d},${near.latitude - d}`);
    local.set('bounded', '1');
    const results = await nominatim(local);
    if (results.length) return results;
    return (await nominatim(params)).filter((r) => distanceM(near, r) <= MAX_PLACE_DISTANCE_M);
  }
  return nominatim(params);
}

/**
 * Libellé du point touché sur la carte : adresse la plus proche (Géoplateforme), sinon lieu OSM
 * (Nominatim, utile hors agglomération), sinon les coordonnées.
 */
export async function reverseGeocode(point: LatLng): Promise<LatLng & { label: string }> {
  const fallback = { ...point, label: `Point ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}` };
  const coords = { lat: String(point.latitude), lon: String(point.longitude) };
  try {
    const json = await getJson<{ features?: BanFeature[] }>(
      `${BAN}/reverse?${new URLSearchParams({ ...coords, limit: '1' })}`,
      "Recherche d'adresse",
    );
    const label = json.features?.[0]?.properties.label;
    if (label) return { ...point, label };
  } catch (e) {
    console.warn('Adresse du point impossible (Géoplateforme)', e);
  }
  try {
    const json = await nominatimGet<{ name?: string; display_name?: string; error?: string }>(
      'reverse',
      new URLSearchParams({ ...coords, format: 'jsonv2', zoom: '17', 'accept-language': 'fr' }),
    );
    if (json.display_name) {
      const parts = json.display_name.split(', ');
      const label = [json.name || parts[0], parts.find((x, i) => i > 0 && x !== json.name && !/^\d/.test(x))]
        .filter(Boolean)
        .join(', ');
      return { ...point, label };
    }
  } catch (e) {
    console.warn('Adresse du point impossible (Nominatim)', e);
  }
  return fallback;
}

// Historique local des destinations choisies (reste sur le téléphone)
export function readHistory(): SearchResult[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function addToHistory(result: SearchResult) {
  try {
    const next = [result, ...readHistory().filter((h) => h.label !== result.label)].slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // pas grave
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // pas grave
  }
}
