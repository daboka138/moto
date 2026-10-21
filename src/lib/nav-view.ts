import { bearingDeg, type LatLng } from '@/lib/geo';

// Vue « conduite » de la navigation (comme Waze / Google Maps) : zoom selon la vitesse, retour
// automatique au suivi. Pur (sans React) : testé par scripts/dev/heading-filter-test.mjs.

/** Carte déplacée à la main en navigation : retour au mode conduite après ce délai sans toucher */
export const AUTO_RECENTER_MS = 10_000;

/** Paliers de zoom : rapproché en ville / à basse vitesse, plus large sur route rapide */
const ZOOM_LEVELS: { upToKmh: number; zoom: number }[] = [
  { upToKmh: 30, zoom: 17 },
  { upToKmh: 50, zoom: 16.5 },
  { upToKmh: 70, zoom: 16 },
  { upToKmh: 95, zoom: 15.5 },
  { upToKmh: Infinity, zoom: 15 },
];
/** Marge autour de chaque seuil : pas d'aller-retour entre deux paliers à 50 km/h pile */
const HYSTERESIS_KMH = 5;
/** Un nouveau palier doit tenir ce temps avant de changer le zoom */
const HOLD_MS = 4000;
/** Vitesse lissée (constante de temps) : un coup de frein ou d'accélérateur ne change rien */
const SMOOTH_MS = 6000;

export type NavZoomState = { level: number; kmh: number; at: number; pending: number | null; pendingSince: number };

export function initialNavZoom(): NavZoomState {
  return { level: 0, kmh: 0, at: 0, pending: null, pendingSince: 0 };
}

function levelFor(kmh: number, current: number) {
  let level = current;
  // Monter d'un palier : au-dessus du seuil + marge ; descendre : en dessous du seuil inférieur - marge
  while (level < ZOOM_LEVELS.length - 1 && kmh > ZOOM_LEVELS[level].upToKmh + HYSTERESIS_KMH) level++;
  while (level > 0 && kmh < ZOOM_LEVELS[level - 1].upToKmh - HYSTERESIS_KMH) level--;
  return level;
}

/** Nouvel état après une mesure de vitesse (km/h) */
export function stepNavZoom(s: NavZoomState, kmh: number, now: number): NavZoomState {
  const dt = s.at ? Math.max(0, now - s.at) : SMOOTH_MS;
  const smooth = s.kmh + (kmh - s.kmh) * (1 - Math.exp(-dt / SMOOTH_MS));
  const wanted = levelFor(smooth, s.level);
  if (wanted === s.level) return { level: s.level, kmh: smooth, at: now, pending: null, pendingSince: 0 };
  if (s.pending !== wanted) return { level: s.level, kmh: smooth, at: now, pending: wanted, pendingSince: now };
  if (now - s.pendingSince < HOLD_MS) return { ...s, kmh: smooth, at: now };
  return { level: wanted, kmh: smooth, at: now, pending: null, pendingSince: 0 };
}

export function navZoomOf(s: NavZoomState) {
  return ZOOM_LEVELS[s.level].zoom;
}

/**
 * Cap de l'itinéraire à cette distance du départ (sur ~30 m) : sert de cap au démarrage de la
 * navigation à l'arrêt, avant le premier cap GPS fiable (la carte est déjà dans le sens de la route).
 */
export function routeBearingAt(points: LatLng[], cumulative: number[], alongM: number): number | null {
  if (points.length < 2) return null;
  let i = 0;
  while (i < cumulative.length - 2 && cumulative[i + 1] <= alongM) i++;
  let j = i + 1;
  while (j < points.length - 1 && cumulative[j] - Math.max(alongM, cumulative[i]) < 30) j++;
  const a = points[i];
  const b = points[j];
  if (!a || !b || (a.latitude === b.latitude && a.longitude === b.longitude)) return null;
  return bearingDeg(a, b);
}
