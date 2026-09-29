import { distanceM, type LatLng } from '@/lib/geo';
import { bearingDeg, projectOnRoute, type NavRoute } from '@/lib/navigation';
import type { RoadReport } from '@/lib/reports';

// Détection du prochain danger devant moi (fonctions pures, testables sans téléphone).

/** Distance max entre le tracé et un signalement pour le considérer « sur mon trajet » */
const ON_ROUTE_M = 35;
/** Annonce quand le danger est à moins de… */
export const ANNOUNCE_M = 600;
/** Rappel quand le danger est tout proche (si la première annonce était loin) */
const REMINDER_M = 200;
/** Conduite libre : danger droit devant à moins de 400 m, cône de ±35° */
const FREE_DRIVE_M = 400;
const FREE_DRIVE_CONE_DEG = 35;
const FREE_DRIVE_MIN_KMH = 15;

export type DangerAhead = { report: RoadReport; distanceM: number };

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Prochain danger devant moi (sur le trajet en navigation, droit devant sinon). */
export function dangerAhead(
  reports: RoadReport[],
  me: LatLng | null,
  heading: number | null,
  speedKmh: number,
  route: NavRoute | null,
  alongM: number | null,
): DangerAhead | null {
  if (!me) return null;
  let best: DangerAhead | null = null;
  for (const report of reports) {
    let ahead: number | null = null;
    if (route && alongM !== null) {
      const proj = projectOnRoute(route, report);
      if (proj.offRouteM <= ON_ROUTE_M && proj.alongM > alongM) ahead = proj.alongM - alongM;
    } else if (heading !== null && speedKmh >= FREE_DRIVE_MIN_KMH) {
      const d = distanceM(me, report);
      if (d <= FREE_DRIVE_M && angleDiff(heading, bearingDeg(me, report)) <= FREE_DRIVE_CONE_DEG) ahead = d;
    }
    if (ahead !== null && ahead <= ANNOUNCE_M * 1.5 && (!best || ahead < best.distanceM)) {
      best = { report, distanceM: ahead };
    }
  }
  return best;
}

/** Faut-il annoncer ce danger maintenant ? Renvoie la nouvelle étape, ou null s'il n'y a rien à dire. */
export function announcementStage(stage: 'far' | 'near' | null, distanceM: number): 'far' | 'near' | null {
  if (distanceM > ANNOUNCE_M || stage === 'near') return null;
  const near = distanceM <= REMINDER_M;
  if (stage === 'far') return near ? 'near' : null;
  // Première annonce déjà proche : pas de rappel ensuite
  return distanceM <= REMINDER_M * 1.5 ? 'near' : 'far';
}
