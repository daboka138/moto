import { useSyncExternalStore } from 'react';

import type { AstuceId } from '@/guide/contenu';

// Guide : présentation déjà vue et bulles d'astuces déjà lues, mémorisées sur l'appareil.
// Réinitialisables dans Paramètres › Aide.

type GuideState = { welcomeDone: boolean; tipsSeen: AstuceId[] };

const KEY = 'moto.guide';
const DEFAULTS: GuideState = { welcomeDone: false, tipsSeen: [] };

let state: GuideState | null = null;
const listeners = new Set<() => void>();

function current(): GuideState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GuideState>) } : DEFAULTS;
  } catch {
    state = DEFAULTS;
  }
  return state;
}

function update(patch: Partial<GuideState>) {
  state = { ...current(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // pas grave : vaut pour cette session
  }
  listeners.forEach((l) => l());
}

export function useGuideState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    current,
  );
}

export const setWelcomeDone = (done: boolean) => update({ welcomeDone: done });

export function markTipSeen(id: AstuceId) {
  const seen = current().tipsSeen;
  if (!seen.includes(id)) update({ tipsSeen: [...seen, id] });
}

export const resetTips = () => update({ tipsSeen: [] });
