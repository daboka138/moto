import { distanceM, type LatLng } from '@/lib/geo';
import type { LimitRun } from '@/lib/speed-limit';

// Annonce des changements de limitation en navigation (pur, testé par scripts/dev/limit-changes-test.mjs).
// Source UNIQUE : la limitation OSM (maxspeed) de la route, celle du panneau rond. Inconnue = rien.
// - Sur l'itinéraire : portions chargées d'avance (useRouteSpeedLimit) → « Bientôt limitation à 50. »
//   100-200 m avant une baisse, puis « Limitation à 50. » en y entrant (une seule annonce des deux).
// - Hors itinéraire / morceau pas encore chargé : limitation en direct, retenue après 150 m stables.
// Une portion de moins de 150 m (micro-changement, donnée incohérente) est ignorée.

/** Portion plus courte : ignorée */
export const MIN_STABLE_M = 150;
/** Même limitation annoncée à moins de 400 m dans les 10 dernières minutes : pas répétée */
const SAME_LIMIT_M = 400;
const SPOKEN_MEMORY_MS = 10 * 60_000;

/** Distance d'annonce d'une baisse à venir : ~8 s à ma vitesse, entre 100 et 200 m */
export function soonDistance(kmh: number) {
  return Math.max(100, Math.min(200, (kmh / 3.6) * 8));
}

/** Portions fiables : connues, d'au moins 150 m (portions voisines de même limitation réunies) */
export function stableRuns(runs: LimitRun[]): LimitRun[] {
  const merged: LimitRun[] = [];
  for (const r of runs) {
    const last = merged.at(-1);
    if (last && last.limit === r.limit && r.fromM - last.toM < 1) last.toM = r.toM;
    else merged.push({ ...r });
  }
  return merged.filter((r) => r.limit !== null && r.toM - r.fromM >= MIN_STABLE_M);
}

type Spoken = { at: LatLng; limit: number; time: number };
export type LimitState = {
  /** Dernière limitation fiable (null : pas encore connue) */
  last: number | null;
  spoken: Spoken[];
  /** Hors itinéraire : nouvelle valeur en attente de confirmation (150 m) */
  pending: { limit: number; from: LatLng } | null;
};
export type LimitEvent = { type: 'enter' | 'soon'; limit: number; speak: boolean; text: string };

export const initialLimitState = (): LimitState => ({ last: null, spoken: [], pending: null });

export type LimitInput = {
  /** Portions de l'itinéraire chargées ([] hors navigation / hors itinéraire) */
  runs: LimitRun[];
  alongM: number | null;
  position: LatLng | null;
  kmh: number;
  /** Limitation en direct (hors itinéraire), null si inconnue */
  live: number | null;
  now: number;
};

function alreadySaid(state: LimitState, limit: number, at: LatLng, now: number) {
  return state.spoken.some((s) => s.limit === limit && now - s.time < SPOKEN_MEMORY_MS && distanceM(s.at, at) < SAME_LIMIT_M);
}

function said(state: LimitState, limit: number, at: LatLng, now: number): Spoken[] {
  return [...state.spoken.filter((s) => now - s.time < SPOKEN_MEMORY_MS), { at, limit, time: now }];
}

function enter(state: LimitState, limit: number, at: LatLng, now: number): { state: LimitState; event: LimitEvent | null } {
  // Première limitation connue : point de départ, rien à annoncer
  if (state.last === null) return { state: { ...state, last: limit, pending: null }, event: null };
  const speak = !alreadySaid(state, limit, at, now);
  return {
    state: { last: limit, pending: null, spoken: speak ? said(state, limit, at, now) : state.spoken },
    event: { type: 'enter', limit, speak, text: `Limitation à ${limit}.` },
  };
}

/** Une position de plus : nouvel état + éventuelle annonce */
export function stepLimits(state: LimitState, input: LimitInput): { state: LimitState; event: LimitEvent | null } {
  const { runs, alongM, position, kmh, live, now } = input;
  if (!position) return { state, event: null };

  // Sur l'itinéraire, morceau chargé
  if (alongM !== null && runs.some((r) => alongM >= r.fromM && alongM < r.toM)) {
    const stable = stableRuns(runs);
    const current = stable.find((r) => alongM >= r.fromM && alongM < r.toM) ?? null;
    if (current && current.limit !== state.last) return enter(state, current.limit!, position, now);
    const base = current?.limit ?? state.last;
    const next = stable.find((r) => r.fromM > alongM);
    if (
      next &&
      base !== null &&
      next.limit! < base &&
      next.fromM - alongM <= soonDistance(kmh) &&
      !alreadySaid(state, next.limit!, position, now)
    ) {
      return {
        state: { ...state, pending: null, spoken: said(state, next.limit!, position, now) },
        event: { type: 'soon', limit: next.limit!, speak: true, text: `Bientôt limitation à ${next.limit}.` },
      };
    }
    return { state: state.pending ? { ...state, pending: null } : state, event: null };
  }

  // Limitation en direct : retenue quand elle tient 150 m
  if (live === null) return { state, event: null };
  if (live === state.last) return { state: state.pending ? { ...state, pending: null } : state, event: null };
  if (state.last === null) return enter(state, live, position, now);
  if (!state.pending || state.pending.limit !== live) return { state: { ...state, pending: { limit: live, from: position } }, event: null };
  if (distanceM(state.pending.from, position) < MIN_STABLE_M) return { state, event: null };
  return enter(state, live, position, now);
}
