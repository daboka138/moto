import { distanceM, type LatLng } from '@/lib/geo';
import type { RouteOptions } from '@/lib/moto';
import { fetchValhalla, needsValhalla } from '@/lib/navigation';

// Calcul d'itinéraire via le serveur de démo public OSRM.
// OK pour le dev, à remplacer par un service avec clé (ou un OSRM hébergé) avant la prod.

export type ComputedRoute = {
  /** [[lat, lng], ...] */
  points: [number, number][];
  distanceM: number;
  durationS: number;
  /** false si OSRM n'a pas répondu : tracé en ligne droite et durée estimée */
  onRoads: boolean;
};

const MAX_POINTS = 500;
const TIMEOUT_MS = 10_000;

/**
 * Tracé passant par les étapes. Avec des options (ex. balade ouverte aux 50 cm³),
 * le calcul passe par Valhalla ; pour les 50 cm³, jamais de repli sur OSRM
 * (il emprunterait l'autoroute) mais sur le tracé de secours.
 */
export async function computeRoute(stops: LatLng[], options?: RouteOptions): Promise<ComputedRoute> {
  if (stops.length < 2) throw new Error('Il faut au moins un départ et une arrivée');
  if (options && needsValhalla(options)) {
    try {
      const r = await fetchValhalla(stops, options);
      return {
        points: downsample(
          r.points.map((p) => [p.latitude, p.longitude] as [number, number]),
          MAX_POINTS,
        ),
        distanceM: Math.round(r.distanceM),
        durationS: Math.round(r.durationS),
        onRoads: true,
      };
    } catch {
      if (options.scooter50) return straightRoute(stops);
    }
  }
  const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(';');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: controller.signal },
    );
    if (res.ok) {
      const json = await res.json();
      const route = json.routes?.[0];
      if (route) {
        const line: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
        return {
          points: downsample(line, MAX_POINTS),
          distanceM: Math.round(route.distance),
          durationS: Math.round(route.duration),
          onRoads: true,
        };
      }
    }
  } catch {
    // on passe au tracé de secours
  } finally {
    clearTimeout(timer);
  }
  return straightRoute(stops);
}

/** Tracé de secours : lignes droites, distance majorée de 30 %, 50 km/h de moyenne. */
function straightRoute(stops: LatLng[]): ComputedRoute {
  let direct = 0;
  for (let i = 1; i < stops.length; i++) direct += distanceM(stops[i - 1], stops[i]);
  const dist = Math.round(direct * 1.3);
  return {
    points: stops.map((s) => [s.latitude, s.longitude]),
    distanceM: dist,
    durationS: Math.round(dist / (50 / 3.6)),
    onRoads: false,
  };
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
