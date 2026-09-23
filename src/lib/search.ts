import { distanceM, type LatLng } from '@/lib/geo';

// Recherche de destination :
// - adresses : API Adresse (Base Adresse Nationale, désormais servie par la
//   Géoplateforme IGN : l'ancienne URL api-adresse.data.gouv.fr y redirige). Gratuite, sans clé.
// - lieux (restos, stations…) : Nominatim (OpenStreetMap). Sa charte interdit
//   l'autocomplétion : on ne l'appelle que sur demande explicite, 1 requête à la fois.

export type SearchResult = LatLng & { label: string; detail?: string; source: 'adresse' | 'lieu' };

const BAN = 'https://data.geopf.fr/geocodage/search';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const HISTORY_KEY = 'moto.searchHistory';
const HISTORY_MAX = 8;

export async function searchAddresses(query: string, near: LatLng | null): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: '6', autocomplete: '1' });
  if (near) {
    params.set('lat', String(near.latitude));
    params.set('lon', String(near.longitude));
  }
  const res = await fetch(`${BAN}?${params}`);
  if (!res.ok) throw new Error(`Recherche d'adresse indisponible (${res.status})`);
  const json = await res.json();
  return (json.features ?? []).map(
    (f: { geometry: { coordinates: [number, number] }; properties: { label: string; context?: string } }) => ({
      label: f.properties.label,
      detail: f.properties.context,
      latitude: f.geometry.coordinates[1],
      longitude: f.geometry.coordinates[0],
      source: 'adresse' as const,
    }),
  );
}

let lastNominatimCall = 0;

async function nominatim(params: URLSearchParams): Promise<SearchResult[]> {
  // Charte Nominatim : 1 requête par seconde maximum
  const wait = lastNominatimCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  const res = await fetch(`${NOMINATIM}?${params}`, { headers: { 'User-Agent': 'MotoApp/0.1 (application mobile, dev)' } });
  if (!res.ok) throw new Error(`Recherche de lieux indisponible (${res.status})`);
  const json: { lat: string; lon: string; name?: string; display_name: string }[] = await res.json();
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
