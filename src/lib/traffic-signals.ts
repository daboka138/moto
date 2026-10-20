import { useEffect, useMemo, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { overpass, type OverpassElement } from '@/lib/pois';

// Feux tricolores OpenStreetMap (highway=traffic_signals), même méthode que les parkings moto hors
// France : API Overpass case par case (0,05° ≈ 5 × 4 km), gardée 30 jours sur l'appareil, une seule
// requête à la fois, pause de 2 min après une erreur (charte d'usage d'Overpass).
// Affichés seulement à partir du zoom 15 ; en navigation, seulement ceux de l'itinéraire.
// Un carrefour compte souvent plusieurs feux dans OSM (un par voie) : regroupés en un seul repère.
// Rien d'autre (jamais de radar ni de contrôle : règle de l'appli).

/** Zoom minimal pour charger et afficher les feux */
export const SIGNALS_MIN_ZOOM = 15;
/** Feux à moins de cette distance du même carrefour : un seul repère */
const MERGE_M = 30;
/** Navigation : feux à moins de 20 m du tracé */
const ON_ROUTE_M = 20;
const MAX_SHOWN = 200;

const CELL = 0.05;
const TTL_MS = 30 * 24 * 3600_000;
const MAX_CELLS = 80;
const CACHE_KEY = 'moto.signals.v1';

/** Case : [lat, lon] arrondis à 5 décimales (~1 m), pour un stockage compact */
type Cell = { t: number; pts: [number, number][] };
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

function cellsAround(center: LatLng, r: number): [number, number][] {
  const rl = r / Math.max(0.3, Math.cos((center.latitude * Math.PI) / 180));
  const out: [number, number][] = [];
  for (let i = Math.floor((center.latitude - r) / CELL); i <= Math.floor((center.latitude + r) / CELL); i++)
    for (let j = Math.floor((center.longitude - rl) / CELL); j <= Math.floor((center.longitude + rl) / CELL); j++) out.push([i, j]);
  return out;
}

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

async function fetchCells(cells: [number, number][]) {
  const is = cells.map((c) => c[0]);
  const js = cells.map((c) => c[1]);
  const bbox = [Math.min(...is) * CELL, Math.min(...js) * CELL, (Math.max(...is) + 1) * CELL, (Math.max(...js) + 1) * CELL]
    .map((v) => v.toFixed(3))
    .join(',');
  const elements = await overpass(`[out:json][timeout:25];node["highway"="traffic_signals"](${bbox});out skel qt 5000;`, { timeoutMs: 30_000 });
  const c = load();
  const now = Date.now();
  for (const [i, j] of cells) c[cellKey(i, j)] = { t: now, pts: [] };
  for (const el of elements as OverpassElement[]) {
    if (el.lat == null || el.lon == null) continue;
    c[cellKey(Math.floor(el.lat / CELL), Math.floor(el.lon / CELL))]?.pts.push([round5(el.lat), round5(el.lon)]);
  }
  save();
  listeners.forEach((l) => l());
}

/** Distance approchée en mètres (petites distances) */
function metres(a: LatLng, b: LatLng) {
  const kx = 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot((b.longitude - a.longitude) * kx, (b.latitude - a.latitude) * 110_540);
}

/** Un repère par carrefour (feux à moins de 30 m regroupés, position moyenne) */
export function mergeSignals(points: LatLng[]): LatLng[] {
  const groups: { lat: number; lng: number; n: number }[] = [];
  for (const p of points) {
    const g = groups.find((x) => metres({ latitude: x.lat / x.n, longitude: x.lng / x.n }, p) < MERGE_M);
    if (g) {
      g.lat += p.latitude;
      g.lng += p.longitude;
      g.n += 1;
    } else groups.push({ lat: p.latitude, lng: p.longitude, n: 1 });
  }
  return groups.map((g) => ({ latitude: g.lat / g.n, longitude: g.lng / g.n }));
}

/** Distance d'un point au tracé (m), en ne regardant que les segments proches */
function distanceToLine(p: LatLng, line: LatLng[]): number {
  const kx = 111_320 * Math.cos((p.latitude * Math.PI) / 180);
  const ky = 110_540;
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1].longitude - p.longitude) * kx;
    const ay = (line[i - 1].latitude - p.latitude) * ky;
    const bx = (line[i].longitude - p.longitude) * kx;
    const by = (line[i].latitude - p.latitude) * ky;
    // Segment loin de toute façon : inutile de projeter
    if (Math.min(Math.abs(ax), Math.abs(bx)) > 2000 && Math.sign(ax) === Math.sign(bx)) continue;
    if (Math.min(Math.abs(ay), Math.abs(by)) > 2000 && Math.sign(ay) === Math.sign(by)) continue;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/**
 * Feux tricolores de la zone affichée (zoom ≥ 15). route : en navigation, seulement ceux du tracé.
 * Charge les cases manquantes (Overpass) et se met à jour quand elles arrivent.
 */
export function useTrafficSignals(
  view: { center: LatLng; zoom: number } | null,
  enabled: boolean,
  route: LatLng[] | null,
): LatLng[] {
  const [tick, setTick] = useState(0);
  const lat = view ? Math.round(view.center.latitude * 500) / 500 : null;
  const lng = view ? Math.round(view.center.longitude * 500) / 500 : null;
  const zoom = view ? Math.round(view.zoom) : 0;
  const active = enabled && lat != null && lng != null && zoom >= SIGNALS_MIN_ZOOM;
  // Zone affichée (degrés) : ~2 km autour du centre au zoom 15, moins au-delà
  const r = zoom >= 17 ? 0.006 : zoom >= 16 ? 0.01 : 0.018;

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
      const missing = cellsAround({ latitude: lat!, longitude: lng! }, r).filter(([i, j]) => {
        const cell = c[cellKey(i, j)];
        return !cell || now - cell.t > TTL_MS;
      });
      if (!missing.length || missing.length > 6) return;
      inFlight = true;
      fetchCells(missing)
        .catch(() => {
          pausedUntil = Date.now() + 120_000;
        })
        .finally(() => {
          inFlight = false;
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [active, lat, lng, r]);

  // Recalculé seulement quand la zone (arrondie à ~200 m), le tracé ou les cases chargées changent
  return useMemo(() => {
    if (!active) return [];
    const center = { latitude: lat!, longitude: lng! };
    const radiusM = r * 111_000 * 1.4;
    // Navigation : seulement la partie du tracé proche de la zone affichée
    const near = route ? sliceNear(route, center, radiusM + 500) : null;
    const c = load();
    const pts: LatLng[] = [];
    for (const [i, j] of cellsAround(center, r)) {
      for (const [la, lo] of c[cellKey(i, j)]?.pts ?? []) {
        const p = { latitude: la, longitude: lo };
        if (metres(center, p) > radiusM) continue;
        if (near && !near.some((part) => distanceToLine(p, part) <= ON_ROUTE_M)) continue;
        pts.push(p);
      }
    }
    return mergeSignals(pts).slice(0, MAX_SHOWN);
    // tick : nouvelles cases chargées
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lat, lng, r, route, tick]);
}

/** Morceaux du tracé à moins de radiusM du centre (chaque morceau garde ses segments contigus) */
function sliceNear(line: LatLng[], center: LatLng, radiusM: number): LatLng[][] {
  const parts: LatLng[][] = [];
  let cur: LatLng[] = [];
  for (const p of line) {
    if (metres(center, p) <= radiusM) cur.push(p);
    else if (cur.length) {
      cur.push(p);
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length) parts.push(cur);
  return parts.map((part) => (part.length === 1 ? [part[0], part[0]] : part));
}

/**
 * Nombre de carrefours à feux sur un itinéraire (aperçu : « 🚦 3 feux »). Une requête Overpass le
 * long du tracé simplifié ; null si le trajet est trop long (> 60 km) ou si Overpass ne répond pas.
 */
const routeCounts = new WeakMap<object, Promise<number | null>>();
export function countSignalsOnRoute(route: { points: LatLng[]; distanceM: number }): Promise<number | null> {
  let p = routeCounts.get(route);
  if (!p) {
    p = countOnLine(route.points, route.distanceM);
    routeCounts.set(route, p);
  }
  return p;
}

async function countOnLine(points: LatLng[], distanceM: number): Promise<number | null> {
  if (distanceM > 60_000 || points.length < 2) return null;
  // Un point tous les ~150 m au plus (Overpass « around » sur une ligne)
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.round(distanceM / 150))));
  const line: LatLng[] = points.filter((_, i) => i % step === 0);
  if (line[line.length - 1] !== points[points.length - 1]) line.push(points[points.length - 1]);
  const coords = line.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(',');
  try {
    const elements = await overpass(`[out:json][timeout:20];node["highway"="traffic_signals"](around:${ON_ROUTE_M},${coords});out skel qt 3000;`, {
      timeoutMs: 20_000,
    });
    const pts = (elements as OverpassElement[])
      .filter((el) => el.lat != null && el.lon != null)
      .map((el) => ({ latitude: el.lat!, longitude: el.lon! }));
    return mergeSignals(pts).length;
  } catch {
    return null;
  }
}
