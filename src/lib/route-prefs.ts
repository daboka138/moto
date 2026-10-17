import { useSyncExternalStore } from 'react';

import type { RouteOptions } from '@/lib/moto';
import { supabase } from '@/lib/supabase';

// Préférences de route du membre (cases « Éviter l'autoroute / les péages / les villes »), reprises
// à chaque nouvel itinéraire : création de balade, navigation, boucles. Copie sur le téléphone
// (moto.routePrefs, lecture immédiate) et sur le serveur (profile_private.route_prefs, lisible par
// le membre seul) pour les retrouver sur un autre appareil.

export type RoutePrefs = { avoidHighways: boolean; avoidTolls: boolean; avoidCities: boolean };

const KEY = 'moto.routePrefs';
const NONE: RoutePrefs = { avoidHighways: false, avoidTolls: false, avoidCities: false };

function clean(v: unknown): RoutePrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<RoutePrefs>;
  return { avoidHighways: o.avoidHighways === true, avoidTolls: o.avoidTolls === true, avoidCities: o.avoidCities === true };
}

function read(): RoutePrefs {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return NONE;
  }
}

let prefs = read();
const listeners = new Set<() => void>();

function setLocal(next: RoutePrefs) {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // gardé pour cette session
  }
  listeners.forEach((l) => l());
}

export function getRoutePrefs() {
  return prefs;
}

export function useRoutePrefs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

/** Coche / décoche une préférence (téléphone tout de suite, serveur en arrière-plan) */
export function setRoutePrefs(userId: string | undefined, patch: Partial<RoutePrefs>) {
  const next = { ...prefs, ...patch };
  setLocal(next);
  if (!userId) return;
  supabase
    .from('profile_private')
    .update({ route_prefs: next })
    .eq('user_id', userId)
    .then(({ error }) => error && console.warn('Préférences de route non enregistrées', error.message));
}

/** Au démarrage (AccountSync) : reprend les préférences enregistrées sur le serveur */
export async function loadRoutePrefs(userId: string) {
  const { data, error } = await supabase.from('profile_private').select('route_prefs').eq('user_id', userId).maybeSingle();
  if (error || !data?.route_prefs) return;
  setLocal(clean(data.route_prefs));
}

/** Options de la moto + préférences du membre (une case cochée l'emporte ; 50 cm³ : jamais d'autoroute) */
export function withRoutePrefs(o: RouteOptions, p: RoutePrefs = prefs): RouteOptions {
  return {
    ...o,
    avoidHighways: o.avoidHighways || o.scooter50 || p.avoidHighways,
    avoidTolls: o.avoidTolls || p.avoidTolls,
    avoidCities: !!o.avoidCities || p.avoidCities,
  };
}
