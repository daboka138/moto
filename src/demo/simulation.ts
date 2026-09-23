import { Path, randomPointAround, type LatLng } from '@/demo/geo';
import { DEMO_RIDERS, type DemoRider } from '@/demo/riders';

// Les motards suivent de vraies routes calculées par OSRM (serveur de démo public).
// Si OSRM ne répond pas, ils suivent un tracé approximatif.

const AREA_RADIUS_M = 20_000;
const DESTINATION_RADIUS_M = 15_000;
const GROUP_SPACING_M = 45;
const GROUP_SPEEDS: Record<'A' | 'B', number> = { A: 72, B: 104 };

/** Limite supposée pour la démo (routes départementales) */
export const DEMO_SPEED_LIMIT_KMH = 80;

/** Tolérance de 10 km/h avant de considérer un excès */
export function isSpeeding(speedKmh: number) {
  return speedKmh > DEMO_SPEED_LIMIT_KMH + 10;
}

/** Combien de trajets viennent d'OSRM ou du tracé de secours (diagnostic) */
export type RoutingStats = { osrm: number; fallback: number };

export type DemoRiderState = {
  rider: DemoRider;
  position: LatLng;
  speedKmh: number;
};

/** Un "mobile" = un motard seul ou un groupe qui avance sur le même tracé. */
type Mover = {
  riderIds: string[];
  baseKmh: number;
  phase: number;
  path: Path | null;
  progress: number;
  speedKmh: number;
  loading: boolean;
  started: boolean;
  position: LatLng;
};

export class DemoSimulation {
  private readonly movers: Mover[] = [];
  /** Motards à l'arrêt ; position null tant qu'elle n'est pas recalée sur une route */
  private readonly stopped = new Map<string, LatLng | null>();
  private elapsed = 0;
  private disposed = false;
  readonly routing: RoutingStats = { osrm: 0, fallback: 0 };

  constructor(private readonly center: LatLng) {
    const groups: Record<string, string[]> = { A: [], B: [] };
    for (const rider of DEMO_RIDERS) {
      const b = rider.behavior;
      if (b.kind === 'stopped') {
        this.placeStopped(rider.id);
      } else if (b.kind === 'group') {
        groups[b.group].push(rider.id);
      } else {
        this.addMover([rider.id], b.baseKmh);
      }
    }
    this.addMover(groups.A, GROUP_SPEEDS.A);
    this.addMover(groups.B, GROUP_SPEEDS.B);
  }

  dispose() {
    this.disposed = true;
  }

  /** Avance la simulation de dtSec secondes et renvoie l'état de tous les motards. */
  tick(dtSec: number): DemoRiderState[] {
    this.elapsed += dtSec;
    for (const mover of this.movers) this.advance(mover, dtSec);

    const states: DemoRiderState[] = [];
    for (const rider of DEMO_RIDERS) {
      if (this.stopped.has(rider.id)) {
        const stoppedAt = this.stopped.get(rider.id);
        if (stoppedAt) states.push({ rider, position: stoppedAt, speedKmh: 0 });
        continue;
      }
      const mover = this.movers.find((m) => m.riderIds.includes(rider.id))!;
      // Pas affiché avant sa première route (le point de départ tiré au hasard peut être en mer)
      if (!mover.started) continue;
      const rank = mover.riderIds.indexOf(rider.id);
      const position = mover.path
        ? mover.path.pointAt(mover.progress - rank * GROUP_SPACING_M)
        : mover.position;
      states.push({ rider, position, speedKmh: mover.speedKmh });
    }
    return states;
  }

  private addMover(riderIds: string[], baseKmh: number) {
    const mover: Mover = {
      riderIds,
      baseKmh,
      phase: Math.random() * 100,
      path: null,
      progress: 0,
      speedKmh: 0,
      loading: false,
      started: false,
      position: randomPointAround(this.center, DESTINATION_RADIUS_M),
    };
    this.movers.push(mover);
    // Requêtes étalées pour ne pas surcharger le serveur OSRM de démo
    setTimeout(() => this.planRoute(mover), (this.movers.length - 1) * 300);
  }

  private async placeStopped(riderId: string) {
    this.stopped.set(riderId, null);
    const point = randomPointAround(this.center, AREA_RADIUS_M);
    const onRoad = await fetchNearestRoad(point);
    if (!this.disposed) this.stopped.set(riderId, onRoad ?? point);
  }

  private advance(mover: Mover, dtSec: number) {
    if (!mover.path) {
      mover.speedKmh = 0;
      return;
    }
    // Vitesse qui varie doucement autour de la vitesse de base (±15 %)
    const wave = Math.sin(this.elapsed / 17 + mover.phase) * 0.6 + Math.sin(this.elapsed / 5 + mover.phase * 2) * 0.4;
    let speed = mover.baseKmh * (1 + 0.15 * wave);
    // Ralentit à l'approche de la destination
    const remaining = mover.path.length - mover.progress;
    if (remaining < 300) speed *= Math.max(0.25, remaining / 300);
    mover.speedKmh = speed;
    mover.progress += (speed / 3.6) * dtSec;

    if (mover.progress >= mover.path.length) {
      mover.position = mover.path.pointAt(mover.path.length);
      mover.path = null;
      mover.speedKmh = 0;
      this.planRoute(mover);
    }
  }

  private async planRoute(mover: Mover) {
    if (mover.loading || this.disposed) return;
    mover.loading = true;
    const from = mover.position;
    const to = randomPointAround(this.center, DESTINATION_RADIUS_M);
    const road = await fetchRoadRoute(from, to);
    const points = road ?? approximateRoute(from, to);
    mover.loading = false;
    if (this.disposed) return;
    if (road) this.routing.osrm++;
    else this.routing.fallback++;
    mover.path = new Path(points);
    mover.started = true;
    // Le groupe démarre déjà étiré sur la route
    mover.progress = (mover.riderIds.length - 1) * GROUP_SPACING_M;
  }
}

const OSRM_TIMEOUT_MS = 6000;

/** Appel OSRM qui renvoie null en cas d'échec ou après OSRM_TIMEOUT_MS, quoi qu'il arrive. */
async function fetchOsrm(path: string): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, OSRM_TIMEOUT_MS);
  });
  const request = (async () => {
    try {
      const res = await fetch(`https://router.project-osrm.org/${path}`, { signal: controller.signal });
      if (!res.ok) {
        console.warn('[démo] OSRM a répondu', res.status);
        return null;
      }
      return await res.json();
    } catch (e) {
      console.warn('[démo] OSRM injoignable', e instanceof Error ? e.message : e);
      return null;
    }
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRoadRoute(from: LatLng, to: LatLng): Promise<LatLng[] | null> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const json = await fetchOsrm(`route/v1/driving/${coords}?overview=full&geometries=geojson`);
  const line: [number, number][] | undefined = json?.routes?.[0]?.geometry?.coordinates;
  if (!line || line.length < 2) return null;
  return line.map(([longitude, latitude]) => ({ latitude, longitude }));
}

async function fetchNearestRoad(point: LatLng): Promise<LatLng | null> {
  const json = await fetchOsrm(`nearest/v1/driving/${point.longitude},${point.latitude}`);
  const location: [number, number] | undefined = json?.waypoints?.[0]?.location;
  return location ? { latitude: location[1], longitude: location[0] } : null;
}

/** Tracé de secours : ligne brisée légèrement sinueuse entre deux points. */
function approximateRoute(from: LatLng, to: LatLng): LatLng[] {
  const steps = 20;
  const points: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 0.004;
    points.push({
      latitude: from.latitude + (to.latitude - from.latitude) * t + wobble,
      longitude: from.longitude + (to.longitude - from.longitude) * t + wobble,
    });
  }
  return points;
}
