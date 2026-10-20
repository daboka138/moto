import type { LatLng } from '@/lib/geo';
import { projectOnRoute, type NavRoute } from '@/lib/navigation';
import type { RoadReport } from '@/lib/reports';

// Zones de danger (note 32) : calculs purs (testables avec Node, scripts/dev/danger-zones-test.mjs).
// LÉGAL : uniquement de vrais dangers routiers (accidents officiels, dangers de la commu), jamais de radar ni de contrôle.

export type ZoneRoad = 'urban' | 'rural' | 'expressway';
export type DangerZone = LatLng & { id: number; radiusM: number; road: ZoneRoad };

/** Longueur indicative d'une zone sur la route : ~300 m en ville, ~2 km hors agglo, ~4 km sur voie rapide */
export const ZONE_LENGTH_M: Record<ZoneRoad, number> = { urban: 300, rural: 2000, expressway: 4000 };
/** Écart max entre le tracé et le centre d'une zone (rayon du point noir + marge GPS) */
const ON_ROUTE_EXTRA_M = 40;
/** Deux zones à moins de 200 m l'une de l'autre sur le tracé : une seule */
const MERGE_GAP_M = 200;
/** Une portion fusionnée ne dépasse pas 6 km (au-delà, une nouvelle zone, annoncée à son tour) */
const MAX_MERGED_M = 6000;

/** Portion du tracé en zone de danger. official : au moins un point noir (sinon : dangers de la commu, déjà annoncés) */
export type ZoneSegment = { fromM: number; toM: number; road: ZoneRoad; official: boolean };

const ROAD_RANK: Record<ZoneRoad, number> = { urban: 0, rural: 1, expressway: 2 };

/**
 * Portions du tracé en zone de danger (pur, testable) : chaque zone sur le trajet couvre sa longueur
 * indicative centrée sur le point noir ; les portions qui se touchent sont fusionnées.
 */
export function zoneSegments(route: Pick<NavRoute, 'points' | 'cumulative' | 'distanceM'>, zones: DangerZone[], reports: RoadReport[] = []): ZoneSegment[] {
  const raw: ZoneSegment[] = [];
  const add = (p: LatLng, maxOffM: number, road: ZoneRoad, official: boolean) => {
    const proj = projectOnRoute(route, p);
    if (proj.offRouteM > maxOffM) return;
    const half = ZONE_LENGTH_M[road] / 2;
    raw.push({ fromM: Math.max(0, proj.alongM - half), toM: Math.min(route.distanceM, proj.alongM + half), road, official });
  };
  for (const z of zones) add(z, z.radiusM + ON_ROUTE_EXTRA_M, z.road, true);
  // Dangers de la commu encore là et confirmés par quelqu'un d'autre (pas les bouchons)
  for (const r of reports) if (r.confirmations > 0 && r.confirmations >= r.removals && r.type !== 'traffic_jam') add(r, 35, 'urban', false);
  raw.sort((a, b) => a.fromM - b.fromM);
  const out: ZoneSegment[] = [];
  for (const s of raw) {
    const last = out.at(-1);
    if (last && s.fromM <= last.toM + MERGE_GAP_M && s.toM - last.fromM <= MAX_MERGED_M) {
      last.toM = Math.max(last.toM, s.toM);
      if (ROAD_RANK[s.road] > ROAD_RANK[last.road]) last.road = s.road;
      last.official ||= s.official;
    } else {
      // Jamais deux portions qui se chevauchent
      const fromM = last ? Math.max(s.fromM, last.toM) : s.fromM;
      if (fromM < s.toM) out.push({ ...s, fromM });
    }
  }
  return out;
}

/** « Zone de danger sur 2 kilomètres, prudence. » ; en ville : « Zone de danger, prudence. » */
export function zoneAnnouncement(seg: ZoneSegment): string {
  if (seg.road === 'urban') return 'Zone de danger, prudence.';
  const m = seg.toM - seg.fromM;
  if (m < 900) return `Zone de danger sur ${Math.max(100, Math.round(m / 100) * 100)} mètres, prudence.`;
  const km = Math.round(m / 1000);
  return `Zone de danger sur ${km} kilomètre${km > 1 ? 's' : ''}, prudence.`;
}

/** Points du tracé d'une portion (pour la surligner sur la carte) */
export function segmentPoints(route: Pick<NavRoute, 'points' | 'cumulative'>, seg: ZoneSegment): LatLng[] {
  const pts = route.points.filter((_, i) => route.cumulative[i] >= seg.fromM && route.cumulative[i] <= seg.toM);
  return pts.length >= 2 ? pts : [];
}

