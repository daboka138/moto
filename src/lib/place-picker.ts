import { router } from 'expo-router';

import type { LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';

// Ouvre l'écran de choix d'un lieu et attend le résultat :
//   const place = await pickPlace({ title: 'Point de départ' });
// Renvoie null si l'utilisateur revient sans valider.

type Request = { id: number; initial: LatLng | null; at: number; resolve: (place: Place | null) => void };

let current: Request | null = null;
let nextId = 1;

export function pickPlace(options: { title: string; initial?: LatLng | null }): Promise<Place | null> {
  // Double appui sur le champ : un seul écran de choix, sinon le lieu validé irait à une demande abandonnée
  if (current && Date.now() - current.at < 1500) return Promise.resolve(null);
  current?.resolve(null);
  return new Promise((resolve) => {
    current = { id: nextId++, initial: options.initial ?? null, at: Date.now(), resolve };
    router.push({ pathname: '/pick-place', params: { title: options.title } });
  });
}

/** Demande en cours, lue une fois à l'ouverture de l'écran de choix. */
export function currentPickRequest() {
  return current ? { id: current.id, initial: current.initial } : null;
}

/** Ne répond qu'à la demande qui a ouvert l'écran (id), jamais à une autre. */
export function resolvePick(id: number | undefined, place: Place | null) {
  if (!current || current.id !== id) return;
  const { resolve } = current;
  current = null;
  resolve(place);
}
