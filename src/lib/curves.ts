import { bearingDeg, type LatLng } from '@/lib/geo';
import type { NavRoute } from '@/lib/navigation';

// Virages serrés d'un itinéraire, calculés sur sa géométrie (module pur, testable avec tsx).

/** Pas de rééchantillonnage du tracé et demi-fenêtre de mesure du changement de cap */
const STEP_M = 10;
const HALF_WINDOW = 5;
/** Changement de cap sur ~100 m à partir duquel le virage est « serré » (rayon < ~90 m) */
const SHARP_DEG = 65;
/** Les carrefours et ronds-points sont déjà annoncés par le guidage */
const NEAR_MANEUVER_M = 60;
/** Annonce vers 200 m avant */
export const ANNOUNCE_MIN_M = 140;
export const ANNOUNCE_MAX_M = 260;
/** Virages enchaînés (moins de 400 m entre deux) : « série de virages » */
export const SERIES_M = 400;

export type SharpCurve = { alongM: number; side: 'left' | 'right'; angle: number; series: boolean };

/** Points du tracé tous les STEP_M mètres, avec leur distance depuis le départ */
function resample(route: Pick<NavRoute, 'points' | 'cumulative'>): { p: LatLng; along: number }[] {
  const out: { p: LatLng; along: number }[] = [];
  const total = route.cumulative[route.cumulative.length - 1] ?? 0;
  let j = 0;
  for (let d = 0; d <= total; d += STEP_M) {
    while (j < route.points.length - 2 && route.cumulative[j + 1] < d) j++;
    const a = route.points[j];
    const b = route.points[j + 1] ?? a;
    const seg = route.cumulative[j + 1] - route.cumulative[j] || 1;
    const t = Math.min(1, Math.max(0, (d - route.cumulative[j]) / seg));
    out.push({ p: { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t }, along: d });
  }
  return out;
}

/** Virages serrés hors carrefours, dans l'ordre du trajet */
export function findSharpCurves(route: Pick<NavRoute, 'points' | 'cumulative' | 'steps'>): SharpCurve[] {
  const pts = resample(route);
  const turns: { along: number; delta: number }[] = [];
  for (let i = HALF_WINDOW; i < pts.length - HALF_WINDOW; i++) {
    const before = bearingDeg(pts[i - HALF_WINDOW].p, pts[i].p);
    const after = bearingDeg(pts[i].p, pts[i + HALF_WINDOW].p);
    const delta = ((after - before + 540) % 360) - 180;
    turns.push({ along: pts[i].along, delta });
  }
  const maneuvers = route.steps.map((s) => s.alongM);
  const curves: SharpCurve[] = [];
  let i = 0;
  while (i < turns.length) {
    if (Math.abs(turns[i].delta) < SHARP_DEG) {
      i++;
      continue;
    }
    // Un virage = suite de points au-dessus du seuil ; on garde le plus fort
    let best = turns[i];
    let j = i;
    while (j < turns.length && Math.abs(turns[j].delta) >= SHARP_DEG * 0.6 && Math.sign(turns[j].delta) === Math.sign(turns[i].delta)) {
      if (Math.abs(turns[j].delta) > Math.abs(best.delta)) best = turns[j];
      j++;
    }
    const start = turns[i].along;
    const isManeuver = maneuvers.some((m) => Math.abs(m - start) < NEAR_MANEUVER_M || Math.abs(m - best.along) < NEAR_MANEUVER_M);
    // Demi-tour (> 160°) : artefact du tracé, pas un virage
    if (!isManeuver && Math.abs(best.delta) < 160) {
      curves.push({ alongM: start, side: best.delta > 0 ? 'right' : 'left', angle: Math.abs(best.delta), series: false });
    }
    i = j + 1;
  }
  return curves.map((c, k) => ({ ...c, series: !!curves[k + 1] && curves[k + 1].alongM - c.alongM < SERIES_M }));
}

