import { defaultRouteOptions, type RouteOptions } from '@/lib/moto';
import type { LatLng } from '@/lib/geo';
import { fetchOsrm, fetchValhallaRoute, needsValhalla, ROUTE_FAILED_TEXT, type NavRoute } from '@/lib/navigation';

// Tracé des balades (départ, étapes dans l'ordre, arrivée) : toujours sur de vraies routes.
// Avec des options (sans autoroute / péages / villes, 50 cm³, chemins) : Valhalla ; sinon OSRM.
// Chaque moteur a un 2e essai, puis l'autre moteur en secours (jamais OSRM pour les 50 cm³).
// Si tout échoue : erreur ROUTE_FAILED, l'écran propose « Réessayer ». JAMAIS de ligne droite.

export type ComputedRoute = {
  /** [[lat, lng], ...] */
  points: [number, number][];
  distanceM: number;
  durationS: number;
  /** Options appliquées (Valhalla), avec les points évités pour sortir des villes */
  options?: RouteOptions;
  /** « Éviter les villes » : part en ville dense avant / après (0-1) */
  urban?: { before: number; after: number };
};

export const ROUTE_FAILED = ROUTE_FAILED_TEXT;

const MAX_POINTS = 500;
/** Pause avant le 2e essai (serveurs publics : débit limité) */
const RETRY_MS = 1500;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function twice<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await run();
    } catch (e) {
      console.warn(`${label} : calcul impossible (essai ${attempt + 1})`, e);
      if (attempt === 0) await wait(RETRY_MS);
    }
  }
  return null;
}

function toComputed(r: NavRoute, options?: RouteOptions): ComputedRoute {
  return {
    ...(options ? { options: r.options ?? options } : {}),
    ...(r.urban ? { urban: r.urban } : {}),
    points: downsample(
      r.points.map((p) => [p.latitude, p.longitude] as [number, number]),
      MAX_POINTS,
    ),
    distanceM: Math.round(r.distanceM),
    durationS: Math.round(r.durationS),
  };
}

/**
 * Tracé passant par toutes les étapes, dans l'ordre. Lève ROUTE_FAILED si aucun calcul n'a abouti.
 * Sans options Valhalla, le tracé de secours Valhalla n'a pas `options` (rien d'imposé à la balade).
 */
export async function computeRoute(stops: LatLng[], options?: RouteOptions): Promise<ComputedRoute> {
  if (stops.length < 2) throw new Error('Il faut au moins un départ et une arrivée');
  const valhalla = options && needsValhalla(options) ? options : null;
  const viaValhalla = () => twice('Valhalla', () => fetchValhallaRoute(stops, valhalla ?? defaultRouteOptions(null)));
  const viaOsrm = () => twice('OSRM', () => fetchOsrm(stops));
  if (valhalla) {
    const r = await viaValhalla();
    if (r) return toComputed(r, valhalla);
    // Options impossibles pour le moment : itinéraire standard (signalé à l'écran), jamais pour un 50 cm³
    if (!valhalla.scooter50) {
      const std = await viaOsrm();
      if (std) return toComputed(std);
    }
  } else {
    const r = (await viaOsrm()) ?? (await viaValhalla());
    if (r) return toComputed(r);
  }
  throw new Error(ROUTE_FAILED);
}

function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')} km`;
}

export function formatDuration(s: number) {
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
