import { Platform } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';
import { projectOnRoute, type NavRoute } from '@/lib/navigation';
import type { SearchResult } from '@/lib/search';

// Arrêts le long de l'itinéraire (station essence, café, resto) : lieux OpenStreetMap
// trouvés par l'API Overpass dans un couloir autour du tracé, devant moi.

export type PoiKind = 'fuel' | 'cafe' | 'food';

export const POI_KINDS: { value: PoiKind; label: string; emoji: string; fallback: string }[] = [
  { value: 'fuel', label: 'Station essence', emoji: '⛽', fallback: 'Station-service' },
  { value: 'cafe', label: 'Pause café', emoji: '☕', fallback: 'Café' },
  { value: 'food', label: 'Restaurant', emoji: '🍴', fallback: 'Restaurant' },
];

export const poiInfo = (k: PoiKind) => POI_KINDS.find((x) => x.value === k)!;

const FILTERS: Record<PoiKind, string> = {
  fuel: '["amenity"="fuel"]',
  cafe: '["amenity"="cafe"]',
  food: '["amenity"~"^(restaurant|fast_food)$"]',
};

export type RoutePoi = SearchResult & {
  /** Distance à parcourir sur le trajet avant d'y arriver (m) */
  aheadM: number;
  /** Écart entre le lieu et le tracé (m) */
  offRouteM: number;
};

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'PasseRyder/1.0 (https://passeryder.fr)';
const TIMEOUT_MS = 20_000;
/** On cherche sur les 50 prochains km, à moins d'1 km du tracé */
const LOOKAHEAD_M = 50_000;
const CORRIDOR_M = 1000;
const SAMPLE_EVERY_M = 1000;
const MAX_RESULTS = 15;

export type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Points du tracé tous les ~1 km, de ma position jusqu'à 50 km devant */
function corridor(route: NavRoute, fromM: number): LatLng[] {
  const out: LatLng[] = [];
  let next = fromM;
  for (let i = 0; i < route.points.length; i++) {
    const at = route.cumulative[i];
    if (at < fromM) continue;
    if (at > fromM + LOOKAHEAD_M) break;
    if (at >= next) {
      out.push(route.points[i]);
      next = at + SAMPLE_EVERY_M;
    }
  }
  const last = route.points[route.points.length - 1];
  if (route.distanceM - fromM <= LOOKAHEAD_M && out.at(-1) !== last) out.push(last);
  return out;
}

/** Délai avant de relancer la même requête sur le serveur suivant (s'il n'a pas encore répondu) */
const HEDGE_MS = 1500;

/**
 * Requête Overpass. Les serveurs publics sont souvent chargés (erreur 500, réponse en 15 s) : au lieu
 * d'attendre l'un puis l'autre, le suivant est lancé si le précédent n'a pas répondu en 1,5 s (ou dès
 * qu'il échoue) ; la première bonne réponse gagne et les autres requêtes sont annulées.
 */
export async function overpass(query: string, { timeoutMs = TIMEOUT_MS }: { timeoutMs?: number } = {}) {
  const controllers = SERVERS.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((c) => c.abort()), timeoutMs);
  const ask = async (server: string, controller: AbortController) => {
    const res = await fetch(server, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(Platform.OS === 'web' ? {} : { 'User-Agent': USER_AGENT }),
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    return ((await res.json()) as { elements?: OverpassElement[] }).elements ?? [];
  };
  try {
    return await new Promise<OverpassElement[]>((resolve, reject) => {
      let failed = 0;
      let started = 0;
      let done = false;
      let lastError: unknown = null;
      let hedge: ReturnType<typeof setTimeout> | null = null;
      const startNext = () => {
        if (hedge) clearTimeout(hedge);
        if (done || started >= SERVERS.length) return;
        const i = started++;
        ask(SERVERS[i], controllers[i]).then(
          (elements) => {
            if (done) return;
            done = true;
            if (hedge) clearTimeout(hedge);
            controllers.forEach((c, j) => j !== i && c.abort());
            resolve(elements);
          },
          (e) => {
            if (done) return;
            lastError = e;
            if (++failed === SERVERS.length) {
              done = true;
              console.warn('Recherche de lieux OpenStreetMap impossible', lastError);
              reject(new Error('Recherche indisponible pour le moment, réessaie dans un instant.'));
            } else startNext();
          },
        );
        hedge = setTimeout(startNext, HEDGE_MS);
      };
      startNext();
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Lieux de ce type devant moi sur le trajet, du plus proche au plus loin. */
export async function poisAlongRoute(route: NavRoute, kind: PoiKind, fromM: number): Promise<RoutePoi[]> {
  const path = corridor(route, fromM);
  if (path.length === 0) return [];
  const coords = path.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(',');
  const elements = await overpass(`[out:json][timeout:20];nwr${FILTERS[kind]}(around:${CORRIDOR_M},${coords});out center 60;`);
  const info = poiInfo(kind);
  const pois: RoutePoi[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const point = { latitude: lat, longitude: lon };
    const proj = projectOnRoute(route, point);
    if (proj.alongM < fromM - 100) continue;
    const tags = el.tags ?? {};
    const name = tags.name || tags.brand || info.fallback;
    const brand = tags.brand && tags.brand !== name ? tags.brand : null;
    pois.push({
      ...point,
      label: name,
      detail: [brand, tags['addr:city']].filter(Boolean).join(' · ') || undefined,
      source: 'lieu',
      aheadM: Math.max(0, proj.alongM - fromM),
      offRouteM: proj.offRouteM,
    });
  }
  // Doublons (une station cartographiée en point et en bâtiment)
  const unique = pois.filter((p, i) => !pois.slice(0, i).some((q) => q.label === p.label && distanceM(p, q) < 150));
  return unique.sort((a, b) => a.aheadM - b.aheadM).slice(0, MAX_RESULTS);
}

/**
 * Spots de la communauté (table places) le long du trajet : devant moi, à moins de `corridorM`
 * du tracé, sur les `lookaheadM` prochains mètres. Triés du plus proche au plus loin.
 */
export function spotsAlongRoute(
  route: NavRoute,
  spots: (LatLng & { label: string; detail?: string })[],
  fromM: number,
  lookaheadM = LOOKAHEAD_M,
  corridorM = CORRIDOR_M,
): RoutePoi[] {
  return spots
    .map((s) => {
      const p = projectOnRoute(route, s);
      return { ...s, source: 'lieu' as const, aheadM: p.alongM - fromM, offRouteM: p.offRouteM };
    })
    .filter((s) => s.aheadM > 200 && s.aheadM <= lookaheadM && s.offRouteM <= corridorM)
    .sort((a, b) => a.aheadM - b.aheadM);
}
