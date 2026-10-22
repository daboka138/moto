import { useSyncExternalStore } from 'react';

// Moteur de la carte de navigation : 3D = MapLibre GL (vue inclinée, par défaut), 2D = Leaflet (vue
// du dessus). Choix dans le menu « ⋯ » de la navigation, mémorisé ; état de la dernière navigation
// gardé pour le diagnostic de Paramètres (« Moteur de navigation : 3D (MapLibre) · raison »).

export type NavEngine = '3d' | '2d';
export type NavEngineStatus = { engine: NavEngine; reason: string; at: number };

const PREF_KEY = 'moto.nav.engine';
const STATUS_KEY = 'moto.nav.engineStatus';

function read<T>(key: string, parse: (v: string) => T, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // stockage indisponible : vaut pour cette session
  }
}

let pref: NavEngine = read(PREF_KEY, (v) => (v === '2d' ? '2d' : '3d'), '3d');
let status: NavEngineStatus | null = read(STATUS_KEY, (v) => JSON.parse(v) as NavEngineStatus, null);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setNavEnginePref(value: NavEngine) {
  if (value === pref) return;
  pref = value;
  write(PREF_KEY, value);
  emit();
}

export function useNavEnginePref(): NavEngine {
  return useSyncExternalStore(subscribe, () => pref);
}

/** Moteur réellement utilisé par la dernière navigation, et pourquoi */
export function recordNavEngine(engine: NavEngine, reason: string) {
  status = { engine, reason, at: Date.now() };
  write(STATUS_KEY, JSON.stringify(status));
  emit();
}

export function useNavEngineStatus(): NavEngineStatus | null {
  return useSyncExternalStore(subscribe, () => status);
}

export function navEngineLabel(engine: NavEngine) {
  return engine === '3d' ? '3D (MapLibre)' : '2D (Leaflet)';
}
