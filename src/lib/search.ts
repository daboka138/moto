import { Platform } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';

// Recherche de destination :
// - lieux ET adresses pendant la frappe : Photon (komoot, OpenStreetMap). Gratuit, sans clé, fait
//   pour l'autocomplétion, trouve restos, commerces, lieux nommés ; biais de proximité sur ma position.
//   Usage raisonnable demandé (sinon ralenti) : 350 ms après la dernière frappe, 3 lettres minimum.
// - adresses : API Adresse (Base Adresse Nationale, désormais servie par la
//   Géoplateforme IGN : l'ancienne URL api-adresse.data.gouv.fr y redirige). Gratuite, sans clé.
// - repli lieux (bouton « Chercher dans les lieux ») : Nominatim (OpenStreetMap). Sa charte interdit
//   l'autocomplétion : on ne l'appelle que sur demande explicite, 1 requête à la fois.

export type SearchResult = LatLng & {
  label: string;
  detail?: string;
  source: 'adresse' | 'lieu';
  /** Catégorie du lieu (🍴 restaurant, ⛽ station…) */
  emoji?: string;
  /** Distance depuis ma position (m), si connue */
  distanceM?: number;
};

const BAN = 'https://data.geopf.fr/geocodage';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io/api/';
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
  return (json.features ?? []).map((f) => {
    const point = { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] };
    return {
      ...point,
      label: f.properties.label,
      detail: f.properties.context,
      source: 'adresse' as const,
      emoji: '🏠',
      distanceM: near ? distanceM(near, point) : undefined,
    };
  });
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    district?: string;
    county?: string;
    countrycode?: string;
  };
};

/** Catégorie d'un lieu OSM : emoji + libellé (« 🍴 Restaurant ») */
const CATEGORIES: Record<string, Record<string, [string, string]>> = {
  amenity: {
    restaurant: ['🍴', 'Restaurant'],
    fast_food: ['🍔', 'Restauration rapide'],
    cafe: ['☕', 'Café'],
    bar: ['🍺', 'Bar'],
    pub: ['🍺', 'Bar'],
    fuel: ['⛽', 'Station-service'],
    charging_station: ['🔌', 'Borne de recharge'],
    motorcycle_parking: ['🅿️', 'Parking moto'],
    parking: ['🅿️', 'Parking'],
    pharmacy: ['💊', 'Pharmacie'],
    hospital: ['🏥', 'Hôpital'],
    toilets: ['🚻', 'Toilettes'],
    bank: ['🏧', 'Banque'],
    atm: ['🏧', 'Distributeur'],
    townhall: ['🏛️', 'Mairie'],
    place_of_worship: ['⛪', 'Lieu de culte'],
  },
  shop: {
    supermarket: ['🛒', 'Supermarché'],
    convenience: ['🛒', 'Épicerie'],
    bakery: ['🥖', 'Boulangerie'],
    motorcycle: ['🏍️', 'Magasin moto'],
    motorcycle_repair: ['🔧', 'Garage moto'],
    car_repair: ['🔧', 'Garage'],
    tyres: ['🔧', 'Pneus'],
  },
  craft: { motorcycle_repair: ['🔧', 'Garage moto'] },
  tourism: {
    hotel: ['🏨', 'Hôtel'],
    motel: ['🏨', 'Hôtel'],
    guest_house: ['🏨', 'Chambre d’hôtes'],
    camp_site: ['⛺', 'Camping'],
    viewpoint: ['📸', 'Point de vue'],
    museum: ['🏛️', 'Musée'],
    attraction: ['⭐', 'Attraction'],
  },
  place: {
    city: ['🏙️', 'Ville'],
    town: ['🏙️', 'Ville'],
    village: ['🏘️', 'Village'],
    hamlet: ['🏘️', 'Hameau'],
    suburb: ['🏘️', 'Quartier'],
    locality: ['📍', 'Lieu-dit'],
  },
  natural: { peak: ['⛰️', 'Sommet'], beach: ['🏖️', 'Plage'] },
  mountain_pass: { yes: ['⛰️', 'Col'] },
};
const KEY_DEFAULTS: Record<string, [string, string]> = {
  shop: ['🛒', 'Commerce'],
  amenity: ['📍', 'Lieu'],
  tourism: ['⭐', 'Tourisme'],
  leisure: ['🌳', 'Loisirs'],
  natural: ['🌲', 'Nature'],
  craft: ['🔧', 'Artisan'],
};
const PHOTON_COUNTRIES = ['FR', 'BE', 'CH', 'LU', 'MC', 'AD', 'ES', 'IT', 'DE'];

/** Résultat Photon → lieu (null pour ce qui ne sert pas : frontières, pays, régions…) */
function fromPhoton(f: PhotonFeature, near: LatLng | null): SearchResult | null {
  const p = f.properties;
  const key = p.osm_key ?? '';
  const value = p.osm_value ?? '';
  if (key === 'boundary' || (key === 'place' && /^(country|state|region|county|province)$/.test(value))) return null;
  // Mobilier sans intérêt comme destination (distributeur automatique « Pizza », banc…)
  if (key === 'amenity' && /^(vending_machine|bench|waste_basket|recycling|post_box|telephone|drinking_water|parcel_locker)$/.test(value)) return null;
  const isAddress = !p.name && !!p.street;
  const cat: [string, string] =
    CATEGORIES[key]?.[value] ??
    (key === 'highway' ? ['🛣️', 'Rue'] : null) ??
    (isAddress ? ['🏠', 'Adresse'] : null) ??
    KEY_DEFAULTS[key] ??
    ['📍', 'Lieu'];
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const town = [p.postcode, p.city ?? p.district].filter(Boolean).join(' ');
  const label = p.name ?? (street || town);
  if (!label) return null;
  const point = { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] };
  const address = (p.name ? [street, town] : [town]).filter(Boolean).join(', ');
  return {
    ...point,
    label,
    detail: [cat[1], address].filter(Boolean).join(' · '),
    emoji: cat[0],
    source: isAddress || key === 'highway' || key === 'place' ? 'adresse' : 'lieu',
    distanceM: near ? distanceM(near, point) : undefined,
  };
}

/** Lieux (restos, commerces, lieux nommés) et adresses pendant la frappe (Photon), proches de moi d'abord */
export async function searchPhoton(query: string, near: LatLng | null): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: '10', lang: 'fr' });
  if (near) {
    params.set('lat', near.latitude.toFixed(5));
    params.set('lon', near.longitude.toFixed(5));
    // Biais de proximité fort : le resto du coin passe avant un homonyme à 500 km
    params.set('zoom', '12');
    params.set('location_bias_scale', '0.3');
  }
  const json = await getJson<{ features?: PhotonFeature[] }>(`${PHOTON}?${params}`, 'Recherche de lieux');
  return (json.features ?? [])
    .filter((f) => !f.properties.countrycode || PHOTON_COUNTRIES.includes(f.properties.countrycode))
    .map((f) => fromPhoton(f, near))
    .filter((r): r is SearchResult => !!r);
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

async function nominatim(params: URLSearchParams, near: LatLng | null): Promise<SearchResult[]> {
  const json = await nominatimGet<NominatimPlace[]>('search', params);
  return json.map((p) => {
    const parts = p.display_name.split(', ');
    const point = { latitude: Number(p.lat), longitude: Number(p.lon) };
    return {
      ...point,
      label: p.name || parts[0],
      detail: parts.slice(1, 4).join(', '),
      source: 'lieu' as const,
      emoji: '📍',
      distanceM: near ? distanceM(near, point) : undefined,
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
    const results = await nominatim(local, near);
    if (results.length) return results;
    return (await nominatim(params, near)).filter((r) => distanceM(near, r) <= MAX_PLACE_DISTANCE_M);
  }
  return nominatim(params, null);
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
