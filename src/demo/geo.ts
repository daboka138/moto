import { distanceM, type LatLng } from '@/lib/geo';

export { distanceM, type LatLng };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Point aléatoire uniformément réparti dans un disque de rayon radiusM autour de center. */
export function randomPointAround(center: LatLng, radiusM: number): LatLng {
  const r = radiusM * Math.sqrt(Math.random());
  const bearing = Math.random() * 2 * Math.PI;
  const dLat = (r * Math.cos(bearing)) / EARTH_RADIUS_M;
  const dLon = (r * Math.sin(bearing)) / (EARTH_RADIUS_M * Math.cos(toRad(center.latitude)));
  return {
    latitude: center.latitude + (dLat * 180) / Math.PI,
    longitude: center.longitude + (dLon * 180) / Math.PI,
  };
}

/** Tracé avec distances cumulées, pour se positionner à n mètres du départ. */
export class Path {
  readonly points: LatLng[];
  private readonly cumulative: number[];

  constructor(points: LatLng[]) {
    this.points = points;
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      this.cumulative.push(this.cumulative[i - 1] + distanceM(points[i - 1], points[i]));
    }
  }

  get length() {
    return this.cumulative[this.cumulative.length - 1];
  }

  pointAt(distance: number): LatLng {
    if (this.points.length === 1) return this.points[0];
    const d = Math.max(0, Math.min(distance, this.length));
    let i = 1;
    while (i < this.cumulative.length - 1 && this.cumulative[i] < d) i++;
    const segment = this.cumulative[i] - this.cumulative[i - 1];
    const t = segment > 0 ? (d - this.cumulative[i - 1]) / segment : 0;
    const a = this.points[i - 1];
    const b = this.points[i] ?? a;
    return {
      latitude: a.latitude + (b.latitude - a.latitude) * t,
      longitude: a.longitude + (b.longitude - a.longitude) * t,
    };
  }
}
