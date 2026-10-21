import { distanceM, type LatLng } from '@/lib/geo';

// Cap et position de ma flèche, filtrés (pur, sans React : scripts/dev/heading-filter-test.mjs).
// À l'arrêt, le cap GPS est du bruit et la boussole du téléphone est faussée dans une voiture (masse
// métallique, support aimanté) : la flèche tournait de gauche à droite. Règles :
// - en dessous de STILL_KMH : cap FIGÉ sur le dernier cap fiable (ni GPS ni boussole) ;
// - en mouvement : cap GPS lissé (moyenne circulaire des derniers points, 359° → 0° géré), un saut
//   improbable n'est pris qu'une fois confirmé par la mesure suivante ;
// - quasi immobile : petits sauts de position de quelques mètres ignorés.
// Le cap filtré est aussi celui publié aux amis.

/** En dessous : cap figé */
export const STILL_KMH = 6;
/** En dessous : position tenue tant qu'elle ne s'écarte pas de plus de quelques mètres */
const HOLD_KMH = 5;
const HOLD_MIN_M = 6;
const HOLD_MAX_M = 20;
/** Moyenne sur les N derniers caps GPS (une mesure toutes les 0,5 à 1 s) */
const SMOOTH_POINTS = 3;
/** Saut de cap au-delà duquel on attend une 2e mesure qui le confirme */
const MAX_JUMP_DEG = 75;
const CONFIRM_DEG = 35;
/** Mesure trop imprécise : son cap n'est pas pris */
const MAX_ACCURACY_M = 40;
/** Hors navigation, un cap figé depuis plus longtemps est oublié (je marche, la boussole reprend) */
export const FROZEN_MAX_MS = 10 * 60_000;

export type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** m/s, null ou négatif = inconnu */
  speed: number | null;
  /** degrés, null ou négatif = inconnu */
  heading: number | null;
  /** ms */
  time: number;
};

export type HeadingFilterState = {
  heading: number | null;
  headingAt: number;
  recent: number[];
  pending: number | null;
  held: LatLng | null;
};

export function initialHeadingFilter(): HeadingFilterState {
  return { heading: null, headingAt: 0, recent: [], pending: null, held: null };
}

/** Écart d'angle le plus court, entre -180 et 180 */
export function angleDelta(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** Moyenne circulaire (359° et 1° → 0°) */
export function circularMean(angles: number[]): number {
  let x = 0;
  let y = 0;
  for (const a of angles) {
    x += Math.cos((a * Math.PI) / 180);
    y += Math.sin((a * Math.PI) / 180);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Nouvelle mesure GPS → état suivant, cap de la flèche (null = inconnu) et position affichée.
 * keepFrozen : en navigation, le cap figé ne s'oublie jamais (feu rouge, bouchon).
 */
export function stepHeadingFilter(
  s: HeadingFilterState,
  fix: Fix,
  keepFrozen: boolean,
): { state: HeadingFilterState; heading: number | null; position: LatLng } {
  const kmh = fix.speed != null && fix.speed >= 0 ? fix.speed * 3.6 : 0;
  const here = { latitude: fix.latitude, longitude: fix.longitude };
  let { heading, headingAt, recent, pending, held } = s;

  // ---- Cap ----
  const reliable =
    kmh >= STILL_KMH && fix.heading != null && fix.heading >= 0 && (fix.accuracy == null || fix.accuracy <= MAX_ACCURACY_M);
  if (reliable) {
    const h = fix.heading! % 360;
    if (heading === null) {
      recent = [h];
      pending = null;
    } else if (Math.abs(angleDelta(heading, h)) > MAX_JUMP_DEG) {
      // Saut improbable : gardé de côté, pris seulement si la mesure suivante va dans le même sens
      if (pending !== null && Math.abs(angleDelta(pending, h)) <= CONFIRM_DEG) {
        recent = [pending, h];
        pending = null;
      } else {
        pending = h;
      }
    } else {
      recent = [...recent, h].slice(-SMOOTH_POINTS);
      pending = null;
    }
    if (pending === null) {
      heading = circularMean(recent);
      headingAt = fix.time;
    }
  } else if (heading !== null && !keepFrozen && fix.time - headingAt > FROZEN_MAX_MS) {
    heading = null;
    recent = [];
    pending = null;
  }

  // ---- Position ----
  let position: LatLng = here;
  if (kmh < HOLD_KMH && held) {
    const radius = Math.max(HOLD_MIN_M, Math.min(HOLD_MAX_M, fix.accuracy ?? HOLD_MIN_M));
    if (distanceM(held, here) < radius) position = held;
  }
  held = position;

  return { state: { heading, headingAt, recent, pending, held }, heading, position };
}
