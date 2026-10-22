import { angleDelta } from '@/lib/heading-filter';

// Boussole lissée : faisceau autour de ma position (hors navigation) et flèche en navigation à
// l'arrêt. Pur (sans React : scripts/dev/compass-filter-test.mjs).
// - au repos : la valeur affichée ne bouge pas tant que la boussole reste à moins de 15° (oscillations
//   d'une voiture, d'un support aimanté…) ;
// - dès qu'elle s'en écarte de 15° : la valeur suit la boussole en continu (fluide, sans paliers),
//   jusqu'à ce qu'elle se stabilise 0,5 s ; elle repasse alors au repos ;
// - boussole peu fiable (calibration faible, valeurs qui sautent, téléphone presque vertical sur un
//   support) → null (faisceau masqué, flèche sur le cap de déplacement).

/** Lissage des mesures (constante de temps) */
const SMOOTH_MS = 80;
/** Suivi : la valeur affichée rejoint la boussole lissée (constante de temps) */
const FOLLOW_MS = 60;
/** Écart qui réveille le suivi */
export const MIN_CHANGE_DEG = 15;
/** Suivi terminé quand la boussole bouge de moins de STILL_DEG pendant STABLE_MS */
export const STABLE_MS = 500;
const STILL_DEG = 3;
/** Boussole affolée : plusieurs sauts brusques (> 30° d'une mesure à l'autre) dans la dernière seconde */
const WINDOW_MS = 1000;
const JUMP_DEG = 30;
const MAX_JUMPS = 3;
/** Calibration (expo-location) : 3 bonne, 2 moyenne, 1 faible, 0 aucune */
const MIN_ACCURACY = 2;
/** Téléphone plus incliné que ça (debout sur un support) : le cap de la boussole n'a plus de sens */
const MAX_TILT_DEG = 70;
/** Peu fiable depuis ce temps : masqué */
const HIDE_AFTER_MS = 1000;

export type CompassSample = {
  value: number;
  /** Calibration 0-3 (null = inconnue, considérée bonne) */
  accuracy: number | null;
  /** Inclinaison avant / arrière du téléphone en degrés (0 = à plat), null = inconnue */
  tilt?: number | null;
  time: number;
};

export type CompassState = {
  raw: { value: number; time: number }[];
  smooth: number | null;
  shown: number | null;
  tracking: boolean;
  /** Dernier point où la boussole a bougé de plus de STILL_DEG (pour sortir du suivi) */
  anchor: { value: number; time: number } | null;
  badSince: number | null;
  calmSince: number | null;
  at: number;
};

export function initialCompass(): CompassState {
  return { raw: [], smooth: null, shown: null, tracking: false, anchor: null, badSince: null, calmSince: null, at: 0 };
}

function jumps(values: number[]) {
  let n = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(angleDelta(values[i - 1], values[i])) > JUMP_DEG) n++;
  return n;
}

const norm = (a: number) => ((a % 360) + 360) % 360;

/** Nouvelle mesure → état suivant (shown = valeur à afficher, null = masquée) */
export function stepCompass(s: CompassState, sample: CompassSample): CompassState {
  const raw = [...s.raw, { value: sample.value, time: sample.time }].filter((x) => x.time > sample.time - WINDOW_MS);
  const bad =
    (sample.accuracy != null && sample.accuracy < MIN_ACCURACY) ||
    (sample.tilt != null && Math.abs(sample.tilt) > MAX_TILT_DEG) ||
    jumps(raw.map((x) => x.value)) >= MAX_JUMPS;
  if (bad) {
    const badSince = s.badSince ?? sample.time;
    const hide = sample.time - badSince >= HIDE_AFTER_MS;
    return { ...s, raw, badSince, calmSince: null, shown: hide ? null : s.shown, smooth: hide ? null : s.smooth, tracking: false, at: sample.time };
  }
  const dt = s.at ? Math.min(500, Math.max(0, sample.time - s.at)) : 0;
  const smooth = s.smooth === null ? sample.value : norm(s.smooth + angleDelta(s.smooth, sample.value) * (1 - Math.exp(-dt / SMOOTH_MS)));
  const calmSince = s.calmSince ?? sample.time;
  const base = { ...s, raw, smooth, badSince: null, calmSince, at: sample.time };

  // Premier affichage (ou après un masquage) : 0,5 s de mesures calmes
  if (s.shown === null) {
    return sample.time - calmSince >= STABLE_MS ? { ...base, shown: smooth, tracking: false, anchor: { value: smooth, time: sample.time } } : base;
  }
  if (!s.tracking && Math.abs(angleDelta(s.shown, smooth)) < MIN_CHANGE_DEG) return base;
  // Suivi : la valeur affichée rejoint la boussole lissée en douceur (pas de saut en entrant) ;
  // fin quand la boussole ne bouge plus
  const shown = norm(s.shown + angleDelta(s.shown, smooth) * (1 - Math.exp(-dt / FOLLOW_MS)));
  const moved = !s.anchor || Math.abs(angleDelta(s.anchor.value, smooth)) > STILL_DEG;
  const anchor = moved ? { value: smooth, time: sample.time } : s.anchor!;
  const settled = sample.time - anchor.time >= STABLE_MS && Math.abs(angleDelta(shown, smooth)) < 1;
  return { ...base, shown, tracking: !settled, anchor };
}

/**
 * Cap de la boussole à partir de l'orientation du téléphone (expo-sensors DeviceMotion, Android :
 * rotation.alpha = -azimut en radians, beta = -inclinaison avant / arrière).
 */
export function headingFromRotation(alpha: number, beta: number): { value: number; tilt: number } {
  return { value: norm((-alpha * 180) / Math.PI), tilt: (-beta * 180) / Math.PI };
}
