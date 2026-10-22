import { angleDelta, circularMean } from '@/lib/heading-filter';

// Faisceau de la boussole (cône bleu autour de ma position, à l'arrêt) : où pointe le téléphone.
// Pur (sans React : scripts/dev/compass-filter-test.mjs). Très lissé pour ne pas trembler dans une
// voiture : oscillations < 15° ignorées, un changement n'est suivi que s'il tient 0,5 s ; boussole
// peu fiable (calibration faible, valeurs qui sautent) → faisceau masqué.

/** Fenêtre d'analyse des mesures */
const WINDOW_MS = 1000;
/** Un nouveau cap doit tenir ce temps avant d'être suivi */
export const STABLE_MS = 500;
/** En dessous, une variation est ignorée */
export const MIN_CHANGE_DEG = 15;
/** Boussole affolée : plusieurs sauts brusques (> 30° d'une mesure à l'autre) dans la dernière seconde */
const JUMP_DEG = 30;
const MAX_JUMPS = 3;
/** Calibration (expo-location) : 3 bonne, 2 moyenne, 1 faible, 0 aucune */
const MIN_ACCURACY = 2;
/** Peu fiable depuis ce temps : faisceau masqué */
const HIDE_AFTER_MS = 1000;

export type CompassSample = { value: number; accuracy: number; time: number };

export type CompassState = {
  samples: CompassSample[];
  shown: number | null;
  pending: { value: number; since: number } | null;
  badSince: number | null;
};

export function initialCompass(): CompassState {
  return { samples: [], shown: null, pending: null, badSince: null };
}

/** Sauts brusques d'une mesure à l'autre (un vrai demi-tour sur sa chaise n'en fait qu'un) */
function jumps(values: number[]) {
  let n = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(angleDelta(values[i - 1], values[i])) > JUMP_DEG) n++;
  return n;
}

/** Nouvelle mesure de la boussole → état suivant (shown = cap du faisceau, null = masqué) */
export function stepCompass(s: CompassState, sample: CompassSample): CompassState {
  const samples = [...s.samples, sample].filter((x) => x.time > sample.time - WINDOW_MS);
  const values = samples.map((x) => x.value);
  const bad = sample.accuracy < MIN_ACCURACY || jumps(values) >= MAX_JUMPS;
  if (bad) {
    const badSince = s.badSince ?? sample.time;
    const hide = sample.time - badSince >= HIDE_AFTER_MS;
    return { samples, shown: hide ? null : s.shown, pending: null, badSince };
  }
  const recent = samples.filter((x) => x.time >= sample.time - STABLE_MS).map((x) => x.value);
  const candidate = circularMean(recent);
  // Premier affichage (ou après un masquage) : des mesures calmes depuis au moins 0,5 s
  if (s.shown === null) {
    const calmFor = sample.time - samples[0].time;
    return { samples, shown: calmFor >= STABLE_MS ? candidate : null, pending: null, badSince: null };
  }
  if (Math.abs(angleDelta(s.shown, candidate)) < MIN_CHANGE_DEG) return { samples, shown: s.shown, pending: null, badSince: null };
  if (s.pending && Math.abs(angleDelta(s.pending.value, candidate)) < MIN_CHANGE_DEG) {
    if (sample.time - s.pending.since >= STABLE_MS) return { samples, shown: candidate, pending: null, badSince: null };
    return { samples, shown: s.shown, pending: s.pending, badSince: null };
  }
  return { samples, shown: s.shown, pending: { value: candidate, since: sample.time }, badSince: null };
}
