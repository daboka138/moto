import { useEffect, useMemo, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import { projectOnRoute, type NavRoute } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';

// Prix des carburants en France : flux instantané officiel (data.economie.gouv.fr, Licence Ouverte
// v2.0 Etalab), importé toutes les 30 min dans fuel_stations par le serveur (Edge Function
// fuel-prices) : l'app ne lit que notre base. Hors France : aucune donnée (repli OpenStreetMap).

export const FUEL_CREDIT = 'Prix : data.economie.gouv.fr (Licence Ouverte Etalab)';

export type FuelType = 'e10' | 'sp95' | 'sp98' | 'gazole' | 'e85' | 'gplc';

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'e10', label: 'SP95-E10' },
  { value: 'sp98', label: 'SP98' },
  { value: 'sp95', label: 'SP95' },
  { value: 'e85', label: 'E85' },
  { value: 'gazole', label: 'Gazole' },
  { value: 'gplc', label: 'GPL' },
];

export const fuelLabel = (f: FuelType) => FUEL_TYPES.find((x) => x.value === f)?.label ?? f;

/** Carburants montrés en premier sur une fiche (essence moto) */
const SHOWN: FuelType[] = ['e10', 'sp98', 'sp95', 'gazole', 'e85', 'gplc'];

export type FuelStation = LatLng & {
  id: number;
  address: string | null;
  city: string | null;
  prices: Partial<Record<FuelType, { price: number; at: string | null }>>;
  /** Carburants en rupture temporaire (libellés du flux : « SP98 », « E10 »…) */
  shortages: string[];
  automate24: boolean;
  hours: Record<string, [string, string][] | null> | null;
};

type Row = {
  id: number;
  lat: number;
  lon: number;
  address: string | null;
  city: string | null;
  shortages: string[] | null;
  automate24: boolean;
  hours: FuelStation['hours'];
} & Partial<Record<FuelType | `${FuelType}_at`, number | string | null>>;

function toStation(r: Row): FuelStation {
  const prices: FuelStation['prices'] = {};
  for (const f of SHOWN) {
    const v = r[f];
    if (v !== null && v !== undefined) prices[f] = { price: Number(v), at: (r[`${f}_at`] as string | null) ?? null };
  }
  return {
    id: r.id,
    latitude: r.lat,
    longitude: r.lon,
    address: r.address,
    city: r.city,
    prices,
    shortages: r.shortages ?? [],
    automate24: r.automate24,
    hours: r.hours,
  };
}

/** « 1,899 € » */
export const formatPrice = (p: number) => `${p.toFixed(3).replace('.', ',')} €`;

export const stationTitle = (s: FuelStation) => (s.city ? `Station · ${s.city}` : 'Station-service');

/** Prix de ce carburant (null : pas vendu ou en rupture) */
export function priceOf(s: FuelStation, fuel: FuelType): number | null {
  const label = fuelLabel(fuel).replace('SP95-E10', 'E10').replace('GPL', 'GPLc');
  if (s.shortages.includes(label)) return null;
  return s.prices[fuel]?.price ?? null;
}

/** Carburants vendus, dans l'ordre d'affichage */
export function stationPrices(s: FuelStation): { fuel: FuelType; label: string; price: number; at: string | null; shortage: boolean }[] {
  return SHOWN.filter((f) => s.prices[f]).map((f) => ({
    fuel: f,
    label: fuelLabel(f),
    price: s.prices[f]!.price,
    at: s.prices[f]!.at,
    shortage: priceOf(s, f) === null,
  }));
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split('.').map(Number);
  return h * 60 + m;
};

/** Ouverte maintenant ? (horaires du flux ; automate 24/24 = toujours, carte bancaire) */
export function stationOpenState(s: FuelStation, now = new Date()): { state: 'open' | 'closed' | 'unknown'; text: string } {
  const day = String(now.getDay() === 0 ? 7 : now.getDay());
  const slots = s.hours ? s.hours[day] : undefined;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (slots) {
    const open = slots.find(([a, b]) => {
      const start = toMin(a);
      const end = toMin(b);
      return end > start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
    });
    if (open) return { state: 'open', text: `Ouverte · ferme à ${open[1].replace('.', 'h')}` };
  }
  if (s.automate24) return { state: 'open', text: slots === undefined ? 'Automate 24/24' : 'Fermée · automate 24/24 (CB)' };
  if (slots === null) return { state: 'closed', text: 'Fermée aujourd’hui' };
  if (slots) {
    const next = slots.find(([a]) => toMin(a) > minutes);
    return { state: 'closed', text: next ? `Fermée · ouvre à ${next[0].replace('.', 'h')}` : 'Fermée' };
  }
  return { state: 'unknown', text: 'Horaires inconnus' };
}

/** « mis à jour il y a 2 h » */
export function priceAge(at: string | null): string {
  if (!at) return '';
  const h = (Date.now() - Date.parse(at)) / 3600_000;
  if (h < 1) return 'il y a moins d’1 h';
  if (h < 24) return `il y a ${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} jour${d > 1 ? 's' : ''}`;
}

// ---------- Carte : stations de la zone affichée (cases de 0,1°, cache 30 min en mémoire) ----------

export const FUEL_MIN_ZOOM = 12;
const TILE = 0.1;
const TILE_TTL_MS = 30 * 60_000;
const MAX_SHOWN = 120;

const tiles = new Map<string, { at: number; stations: FuelStation[] }>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const tileKey = (i: number, j: number) => `${i}:${j}`;

function loadTile(i: number, j: number): Promise<void> {
  const key = tileKey(i, j);
  const t = tiles.get(key);
  if (t && Date.now() - t.at < TILE_TTL_MS) return Promise.resolve();
  const pending = loading.get(key);
  if (pending) return pending;
  const p = (async () => {
    const { data, error } = await supabase.rpc('fuel_stations_in_box', {
      p_min_lat: i * TILE,
      p_min_lon: j * TILE,
      p_max_lat: (i + 1) * TILE,
      p_max_lon: (j + 1) * TILE,
    });
    if (error) throw error;
    tiles.set(key, { at: Date.now(), stations: ((data ?? []) as Row[]).map(toStation) });
    listeners.forEach((l) => l());
  })().finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}

/** Rayon de la vue (degrés de latitude) selon le zoom */
const viewRadius = (zoom: number) => 0.06 * 2 ** (14 - zoom);

/** Stations de la zone affichée (vide si désactivé ou zoom < 12) */
export function useFuelStations(view: { center: LatLng; zoom: number } | null, enabled: boolean): FuelStation[] {
  const [tick, setTick] = useState(0);
  const lat = view ? Math.round(view.center.latitude * 200) / 200 : null;
  const lng = view ? Math.round(view.center.longitude * 200) / 200 : null;
  const zoom = view ? Math.round(view.zoom) : 0;
  const active = enabled && lat !== null && lng !== null && zoom >= FUEL_MIN_ZOOM;

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      const r = viewRadius(zoom);
      const kx = Math.cos((lat! * Math.PI) / 180);
      for (let i = Math.floor((lat! - r) / TILE); i <= Math.floor((lat! + r) / TILE); i++) {
        for (let j = Math.floor((lng! - r / kx) / TILE); j <= Math.floor((lng! + r / kx) / TILE); j++) {
          loadTile(i, j).catch((e) => console.warn('Stations-service indisponibles', e));
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [active, lat, lng, zoom]);

  return useMemo(() => {
    if (!active) return [];
    const center = { latitude: lat!, longitude: lng! };
    const maxM = viewRadius(zoom) * 111_000 * 1.4;
    const out: (FuelStation & { d: number })[] = [];
    for (const t of tiles.values()) {
      for (const s of t.stations) {
        const d = distanceM(center, s);
        if (d <= maxM) out.push({ ...s, d });
      }
    }
    return out.sort((a, b) => a.d - b.d).slice(0, MAX_SHOWN);
    // tick : nouvelles cases chargées
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lat, lng, zoom, tick]);
}

// ---------- Recherche « Station » ----------

/** Stations les plus proches (France), triées par distance */
export async function nearestFuelStations(center: LatLng, radiusKm = 15): Promise<(FuelStation & { distanceM: number })[]> {
  const { data, error } = await supabase.rpc('fuel_stations_near', { p_lat: center.latitude, p_lon: center.longitude, p_km: radiusKm });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toStation).map((s) => ({ ...s, distanceM: distanceM(center, s) }));
}

// ---------- Itinéraire : stations sur le trajet ou à moins de ~2 km ----------

export const ROUTE_CORRIDOR_M = 2000;
const SAMPLE_M = 1000;

export type RouteStation = FuelStation & {
  /** Position sur le trajet depuis le départ (m) */
  alongM: number;
  /** Écart au tracé (m) */
  offRouteM: number;
};

const alongCache = new Map<string, RouteStation[]>();

/** Stations à moins de 2 km du tracé, dans l'ordre du trajet */
export async function fetchRouteStations(route: Pick<NavRoute, 'points' | 'cumulative' | 'distanceM'>): Promise<RouteStation[]> {
  const key = `${route.points.length}:${Math.round(route.distanceM)}:${route.points[0]?.latitude.toFixed(4)}:${route.points.at(-1)?.longitude.toFixed(4)}`;
  const hit = alongCache.get(key);
  if (hit) return hit;
  const lat: number[] = [];
  const lon: number[] = [];
  let next = 0;
  route.points.forEach((p, i) => {
    if (route.cumulative[i] >= next || i === route.points.length - 1) {
      lat.push(Math.round(p.latitude * 1e5) / 1e5);
      lon.push(Math.round(p.longitude * 1e5) / 1e5);
      next = route.cumulative[i] + SAMPLE_M;
    }
  });
  const { data, error } = await supabase.rpc('fuel_stations_along', { p_lat: lat.slice(0, 3000), p_lon: lon.slice(0, 3000), p_m: ROUTE_CORRIDOR_M });
  if (error) throw error;
  const out = ((data ?? []) as Row[])
    .map(toStation)
    .map((s) => ({ ...s, ...projectOnRoute(route, s) }))
    .filter((s) => s.offRouteM <= ROUTE_CORRIDOR_M)
    .sort((a, b) => a.alongM - b.alongM);
  if (alongCache.size > 20) alongCache.clear();
  alongCache.set(key, out);
  return out;
}

/** Stations du trajet (aperçu et navigation), rechargées quand l'itinéraire change */
export function useRouteStations(route: NavRoute | null, enabled: boolean) {
  const key = route && enabled ? `${route.points.length}:${Math.round(route.distanceM)}` : null;
  const [state, setState] = useState<{ key: string; stations: RouteStation[] } | null>(null);
  useEffect(() => {
    if (!key || !route) return;
    let cancelled = false;
    fetchRouteStations(route)
      .then((stations) => !cancelled && setState({ key, stations }))
      .catch((e) => console.warn('Stations du trajet indisponibles', e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state && state.key === key ? state.stations : null;
}

/** La moins chère pour ce carburant (parmi celles qui le vendent) */
export function cheapestStation<T extends FuelStation>(stations: T[], fuel: FuelType): (T & { price: number }) | null {
  let best: (T & { price: number }) | null = null;
  for (const s of stations) {
    const price = priceOf(s, fuel);
    if (price !== null && (!best || price < best.price)) best = { ...s, price };
  }
  return best;
}

/** Résumé de l'aperçu : « ⛽ 12 stations sur le trajet · la moins chère 1,849 € (SP98) à 35 km » */
export function routeFuelSummary(stations: RouteStation[] | null, fuel: FuelType): string | null {
  if (!stations) return null;
  if (!stations.length) return 'Aucune station-service à moins de 2 km du trajet';
  const cheap = cheapestStation(stations, fuel);
  const count = `${stations.length} station${stations.length > 1 ? 's' : ''} sur le trajet`;
  return cheap ? `${count} · la moins chère ${formatPrice(cheap.price)} (${fuelLabel(fuel)}) à ${Math.round(cheap.alongM / 1000)} km` : count;
}

/** Prochaine station devant moi (à plus de 300 m) */
export function nextStation(stations: RouteStation[] | null, alongM: number): RouteStation | null {
  return stations?.find((s) => s.alongM > alongM + 300) ?? null;
}

/**
 * Longue portion sans station (routes de montagne) : je suis à moins de 5 km de la station et,
 * après elle, la suivante (ou l'arrivée) est plus loin que ce qui me reste d'autonomie moins une
 * marge. Renvoie la distance jusqu'à la station d'après (km), sinon null. Fonction pure.
 */
export function sparseStationsAhead(
  stations: RouteStation[] | null,
  alongM: number,
  routeM: number,
  leftKm: number | null,
): { station: RouteStation; gapKm: number; afterIsArrival: boolean } | null {
  if (!stations || leftKm === null) return null;
  const i = stations.findIndex((s) => s.alongM > alongM + 300);
  if (i < 0) return null;
  const station = stations[i];
  if (station.alongM - alongM > 5000) return null;
  const after = stations[i + 1];
  const gapM = (after ? after.alongM : routeM) - alongM;
  const gapKm = gapM / 1000;
  // Assez d'essence pour la portion avec 30 km de marge : rien à dire
  if (gapKm + 30 <= leftKm || gapKm < 40) return null;
  return { station, gapKm, afterIsArrival: !after };
}
