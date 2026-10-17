import { useEffect, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import { overpass, type OverpassElement } from '@/lib/pois';

// Parkings moto OpenStreetMap (amenity=motorcycle_parking, et parkings marqués motorcycle=yes /
// designated), chargés par l'API Overpass case par case (0,1° ≈ 11 × 8 km) et gardés 14 jours sur
// l'appareil : une zone déjà vue ne refait jamais de requête. Une seule requête à la fois, pause de
// 2 min après une erreur, rien en dessous du zoom 12 (charte d'usage d'Overpass).

export type MotoParking = LatLng & {
  /** « n123 », « w456 » : identifiant OSM */
  id: string;
  name: string | null;
  address: string | null;
  /** true payant, false gratuit, null inconnu */
  fee: boolean | null;
  /** Places moto, si renseigné */
  capacity: number | null;
  covered: boolean;
};

const CELL = 0.1;
const TTL_MS = 14 * 24 * 3600_000;
const MAX_CELLS = 150;
const CACHE_KEY = 'moto.parkings.v1';
/** Zoom minimal pour charger et afficher les parkings */
export const PARKINGS_MIN_ZOOM = 12;

type Cell = { t: number; items: MotoParking[] };
let cache: Record<string, Cell> | null = null;
let inFlight = false;
let pausedUntil = 0;
const listeners = new Set<() => void>();

function load(): Record<string, Cell> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {};
  } catch {
    cache = {};
  }
  return cache!;
}

function save() {
  const c = load();
  const keys = Object.keys(c).sort((a, b) => c[b].t - c[a].t);
  for (const k of keys.slice(MAX_CELLS)) delete c[k];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // stockage plein : le cache reste en mémoire
  }
}

const cellKey = (i: number, j: number) => `${i}:${j}`;

/** Cases couvrant la vue (centre + zoom) */
function cellsAround(center: LatLng, zoom: number): [number, number][] {
  const r = zoom >= 15 ? 0.03 : zoom >= 14 ? 0.05 : zoom >= 13 ? 0.09 : 0.16;
  const i0 = Math.floor((center.latitude - r) / CELL);
  const i1 = Math.floor((center.latitude + r) / CELL);
  const rl = r / Math.max(0.3, Math.cos((center.latitude * Math.PI) / 180));
  const j0 = Math.floor((center.longitude - rl) / CELL);
  const j1 = Math.floor((center.longitude + rl) / CELL);
  const out: [number, number][] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push([i, j]);
  return out;
}

function address(tags: Record<string, string>) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:city']].filter(Boolean).join(', ') || null;
}

/** Élément Overpass → parking moto */
export function toParking(el: OverpassElement): MotoParking | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null || !el.type || el.id == null) return null;
  const tags = el.tags ?? {};
  const dedicated = tags.amenity === 'motorcycle_parking';
  const capRaw = tags['capacity:motorcycle'] ?? (dedicated ? tags.capacity : undefined);
  const capacity = capRaw && /^\d+$/.test(capRaw) ? Number(capRaw) : null;
  const fee = tags.fee === 'yes' ? true : tags.fee === 'no' ? false : null;
  return {
    id: el.type[0] + el.id,
    latitude: lat,
    longitude: lon,
    name: tags.name || null,
    address: address(tags),
    fee,
    capacity,
    covered: tags.covered === 'yes',
  };
}

const FILTER = (area: string) =>
  `nwr["amenity"="motorcycle_parking"](${area});nwr["amenity"="parking"]["motorcycle"~"^(yes|designated)$"](${area});`;

async function fetchCells(cells: [number, number][]) {
  const is = cells.map((c) => c[0]);
  const js = cells.map((c) => c[1]);
  const s = Math.min(...is) * CELL;
  const n = (Math.max(...is) + 1) * CELL;
  const w = Math.min(...js) * CELL;
  const e = (Math.max(...js) + 1) * CELL;
  const bbox = `${s.toFixed(3)},${w.toFixed(3)},${n.toFixed(3)},${e.toFixed(3)}`;
  const elements = await overpass(`[out:json][timeout:25];(${FILTER(bbox)});out center tags 2000;`);
  const c = load();
  const now = Date.now();
  for (const [i, j] of cells) c[cellKey(i, j)] = { t: now, items: [] };
  for (const el of elements) {
    const p = toParking(el);
    if (!p) continue;
    const k = cellKey(Math.floor(p.latitude / CELL), Math.floor(p.longitude / CELL));
    c[k]?.items.push(p);
  }
  save();
  listeners.forEach((l) => l());
}

/** Au plus 150 repères (les plus proches du centre) : Paris compte des milliers de parkings moto */
const MAX_SHOWN = 150;

function visible(center: LatLng, zoom: number): MotoParking[] {
  const c = load();
  const all = cellsAround(center, zoom).flatMap(([i, j]) => c[cellKey(i, j)]?.items ?? []);
  if (all.length <= MAX_SHOWN) return all;
  return all
    .map((p) => ({ p, d: distanceM(center, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_SHOWN)
    .map((x) => x.p);
}

/**
 * Parkings moto de la zone affichée (vide si désactivé ou zoom < 12). Charge les cases manquantes
 * (au plus 9 d'un coup) et se met à jour quand elles arrivent.
 */
export function useMotoParkings(view: { center: LatLng; zoom: number } | null, enabled: boolean): MotoParking[] {
  const [, setTick] = useState(0);
  const lat = view ? Math.round(view.center.latitude * 200) / 200 : null;
  const lng = view ? Math.round(view.center.longitude * 200) / 200 : null;
  const zoom = view ? Math.round(view.zoom) : 0;
  const active = enabled && lat != null && lng != null && zoom >= PARKINGS_MIN_ZOOM;

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
      if (inFlight || Date.now() < pausedUntil) return;
      const c = load();
      const now = Date.now();
      const missing = cellsAround({ latitude: lat!, longitude: lng! }, zoom).filter(([i, j]) => {
        const cell = c[cellKey(i, j)];
        return !cell || now - cell.t > TTL_MS;
      });
      if (!missing.length || missing.length > 9) return;
      inFlight = true;
      fetchCells(missing)
        .catch(() => {
          pausedUntil = Date.now() + 120_000;
        })
        .finally(() => {
          inFlight = false;
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [active, lat, lng, zoom]);

  return active ? visible({ latitude: lat!, longitude: lng! }, zoom) : [];
}

/** Parkings moto les plus proches d'un point (recherche « parking moto ») : dans 5 km, puis 15 km */
export async function nearestParkings(center: LatLng, limit = 8): Promise<(MotoParking & { distanceM: number })[]> {
  const ll = `${center.latitude.toFixed(5)},${center.longitude.toFixed(5)}`;
  for (const radius of [5000, 15000]) {
    const elements = await overpass(`[out:json][timeout:25];(${FILTER(`around:${radius},${ll}`)});out center tags 200;`);
    const list = elements
      .map(toParking)
      .filter((p): p is MotoParking => !!p)
      .map((p) => ({ ...p, distanceM: distanceM(center, p) }))
      .sort((a, b) => a.distanceM - b.distanceM);
    if (list.length >= 3 || radius === 15000) return list.slice(0, limit);
  }
  return [];
}

/** Libellé d'un parking (nom OSM, sinon « Parking moto ») */
export const parkingTitle = (p: MotoParking) => p.name ?? 'Parking moto';

/** « Gratuit · 12 places · couvert » */
export function parkingFacts(p: MotoParking): string {
  return [
    p.fee === true ? 'Payant' : p.fee === false ? 'Gratuit' : null,
    p.capacity ? `${p.capacity} place${p.capacity > 1 ? 's' : ''} moto` : null,
    p.covered ? 'Couvert' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
