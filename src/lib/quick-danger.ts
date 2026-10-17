import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';

// Dangers « notés en roulant » (un tap sur ⚠️ au-dessus de 10 km/h) et mode passager.
// Le signalement générique « danger » est créé tout de suite sur le serveur (id) ; on garde ici,
// sur le téléphone, ceux dont le type reste à choisir à l'arrêt. id null : pas de réseau au moment
// du tap, il sera envoyé à l'arrêt (ou en « Zone de danger » au bout de 30 min).

export type PendingDanger = LatLng & { key: string; id: string | null; at: number };

const KEY = 'moto.pendingDangers';
const PASSENGER_KEY = 'moto.passenger';
/** Sans réponse au bout de 30 min, le danger reste « Zone de danger » */
export const PENDING_MAX_MS = 30 * 60_000;
/** Le mode passager se coupe tout seul après 12 h (on ne reste pas « passager » le lendemain en pilotant) */
const PASSENGER_MAX_MS = 12 * 3600_000;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function readPending(): PendingDanger[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writePending(list: PendingDanger[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // pas grave
  }
  emit();
}

export function addPending(p: PendingDanger) {
  writePending([...readPending(), p]);
}

export function removePending(key: string) {
  writePending(readPending().filter((p) => p.key !== key));
}

/** Dangers dont le type reste à choisir (les plus anciens d'abord) */
export function usePendingDangers(): PendingDanger[] {
  const [list, setList] = useState(readPending);
  useEffect(() => {
    const l = () => setList(readPending());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return list;
}

function readPassenger(): boolean {
  try {
    const at = Number(localStorage.getItem(PASSENGER_KEY) ?? 0);
    return at > 0 && Date.now() - at < PASSENGER_MAX_MS;
  } catch {
    return false;
  }
}

/** « Je suis passager » : accès complet à la grille des dangers même en roulant */
export function usePassengerMode(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(readPassenger);
  useEffect(() => {
    const l = () => setOn(readPassenger());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const set = (v: boolean) => {
    try {
      if (v) localStorage.setItem(PASSENGER_KEY, String(Date.now()));
      else localStorage.removeItem(PASSENGER_KEY);
    } catch {
      // pas grave
    }
    emit();
  };
  return [on, set];
}
