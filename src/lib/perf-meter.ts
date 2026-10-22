import { useSyncExternalStore } from 'react';

// Mesures de fluidité de la carte (admin, Paramètres) : images/s et temps de calcul par image dans la
// page de la carte, messages envoyés par l'app à la carte par seconde. Affichées en petit pendant la
// navigation. Rien n'est envoyé nulle part.

const KEY = 'moto.perf';

export type PerfStats = { fps: number; workMs: number; worstMs: number; msgsPerS: number };

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
let stats: PerfStats | null = null;
let messages = 0;
let countedSince = Date.now();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setPerfEnabled(on: boolean) {
  enabled = on;
  stats = null;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // vaut pour cette session
  }
  emit();
}

export function usePerfEnabled() {
  return useSyncExternalStore(subscribe, () => enabled);
}

export function usePerfStats() {
  return useSyncExternalStore(subscribe, () => stats);
}

/** Un message envoyé à une page de carte (MapFrame) */
export function countMapMessage() {
  messages++;
}

/** Rapport de la page de la carte (toutes les 2 s) */
export function reportMapPerf(p: { fps: number; workMs: number; worstMs: number }) {
  if (!enabled) return;
  const now = Date.now();
  const msgsPerS = Math.round((messages / Math.max(1, now - countedSince)) * 10_000) / 10;
  messages = 0;
  countedSince = now;
  stats = { ...p, msgsPerS };
  emit();
}
