import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Démarrage de l'app : mesures de temps et travail différé.
// - startupMark(étape) : temps écoulé depuis le chargement du JS, gardé en mémoire (Paramètres ›
//   Démarrage, admin) et écrit dans les logs (« [démarrage] … », adb logcat).
// - Blocages du fil JS pendant les 15 premières secondes (minuterie en retard de plus de 120 ms) :
//   ce sont les saccades ressenties.
// - La carte signale qu'elle est prête (signalMapReady) : l'écran de démarrage est alors retiré, et
//   tout ce qui n'est pas la carte et ma position (stories, messages, notifs, mise à jour, push…)
//   démarre 1,5 s plus tard (useStartupDone / whenStartupDone). Au plus tard 6 s après le lancement.

const T0 = Date.now();
const DEFER_AFTER_MAP_MS = 1500;
const MAX_WAIT_MS = Platform.OS === 'web' ? 2500 : 6000;
const STALL_WATCH_MS = 15_000;
const STALL_MIN_MS = 120;

export type StartupMark = { label: string; ms: number };
const marks: StartupMark[] = [];
const stalls: StartupMark[] = [];

export function startupMark(label: string) {
  if (marks.some((m) => m.label === label)) return;
  const ms = Date.now() - T0;
  marks.push({ label, ms });
  console.log(`[démarrage] ${label} : ${ms} ms`);
}

/** Étapes et blocages du lancement en cours (pour l'écran de diagnostic) */
export function startupReport(): { marks: StartupMark[]; stalls: StartupMark[] } {
  return { marks: [...marks], stalls: [...stalls] };
}

// Blocages du fil JS : une minuterie de 50 ms qui arrive en retard = le JS était occupé
(function watchStalls() {
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const late = now - last - 50;
    last = now;
    if (late >= STALL_MIN_MS) {
      stalls.push({ label: `bloqué ${late} ms`, ms: now - T0 - late });
      console.log(`[démarrage] fil JS bloqué ${late} ms vers ${now - T0 - late} ms`);
    }
    if (now - T0 > STALL_WATCH_MS) clearInterval(timer);
  }, 50);
})();

// ---------- Carte prête → fin du démarrage ----------
let mapReady = false;
let done = false;
const mapListeners = new Set<() => void>();
const doneListeners = new Set<() => void>();

function finish() {
  if (done) return;
  done = true;
  startupMark('travail différé lancé');
  doneListeners.forEach((l) => l());
  doneListeners.clear();
}

setTimeout(finish, MAX_WAIT_MS);

export function signalMapReady() {
  if (mapReady) return;
  mapReady = true;
  startupMark('carte prête');
  mapListeners.forEach((l) => l());
  mapListeners.clear();
  setTimeout(finish, DEFER_AFTER_MAP_MS);
}

export function isMapReady() {
  return mapReady;
}

export function onMapReady(listener: () => void): () => void {
  if (mapReady) {
    listener();
    return () => {};
  }
  mapListeners.add(listener);
  return () => mapListeners.delete(listener);
}

/** Résolu quand le démarrage est fini (carte prête + 1,5 s, ou 6 s au plus) */
export function whenStartupDone(): Promise<void> {
  return done ? Promise.resolve() : new Promise((resolve) => doneListeners.add(resolve));
}

/** false pendant le démarrage : les chargements non essentiels attendent */
export function useStartupDone(): boolean {
  const [ok, setOk] = useState(done);
  useEffect(() => {
    if (ok) return;
    let alive = true;
    whenStartupDone().then(() => alive && setOk(true));
    return () => {
      alive = false;
    };
  }, [ok]);
  return ok;
}
