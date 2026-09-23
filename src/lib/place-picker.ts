import { router } from 'expo-router';

import type { LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';

// Ouvre l'écran de choix d'un lieu et attend le résultat :
//   const place = await pickPlace({ title: 'Point de départ' });
// Renvoie null si l'utilisateur revient sans valider.

let pending: ((place: Place | null) => void) | null = null;
let pendingInitial: LatLng | null = null;

export function pickPlace(options: { title: string; initial?: LatLng | null }): Promise<Place | null> {
  pending?.(null);
  pendingInitial = options.initial ?? null;
  router.push({ pathname: '/pick-place', params: { title: options.title } });
  return new Promise((resolve) => {
    pending = resolve;
  });
}

export function pickerInitialPoint() {
  return pendingInitial;
}

export function resolvePick(place: Place | null) {
  pending?.(place);
  pending = null;
}
