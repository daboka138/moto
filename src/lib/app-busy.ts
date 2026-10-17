import { useSyncExternalStore } from 'react';

// Moments où l'app ne doit JAMAIS redémarrer d'elle-même (mise à jour) : navigation, convoi,
// SOS / chute. Signalés par la carte ; « Je rentre » est lu directement (lib/homecoming.ts).

export type BusyReason = 'navigation' | 'convoy' | 'sos';

let busy = new Set<BusyReason>();
const listeners = new Set<() => void>();

export function setAppBusy(reason: BusyReason, on: boolean) {
  if (busy.has(reason) === on) return;
  busy = new Set(busy);
  if (on) busy.add(reason);
  else busy.delete(reason);
  listeners.forEach((l) => l());
}

export function useAppBusy(): ReadonlySet<BusyReason> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => busy,
  );
}
