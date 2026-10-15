import { useSyncExternalStore } from 'react';

import { fetchEventsByIds, type MotoEvent } from '@/lib/events';
import { fetchPlacesByIds, type CommunityPlace } from '@/lib/places';
import { photoUrl } from '@/lib/profile';
import { fetchRidesByIds, type RideSummary } from '@/lib/rides';
import { supabase } from '@/lib/supabase';

// Recherche globale (Mur, Profil) : motards par pseudo, balades, lieux, événements.
// Le serveur compare sans majuscules ni accents (fold_text) et applique les règles de
// visibilité : motards bloqués (dans un sens ou dans l'autre) jamais renvoyés, jamais de
// prénom / nom ni de position.

export const MIN_QUERY = 2;

export type SearchTab = 'riders' | 'rides' | 'places' | 'events';

export const SEARCH_TABS: { value: SearchTab; label: string }[] = [
  { value: 'riders', label: 'Motards' },
  { value: 'rides', label: 'Balades' },
  { value: 'places', label: 'Lieux' },
  { value: 'events', label: 'Événements' },
];

export type FriendRelation = 'friend' | 'incoming' | 'outgoing' | 'none';

export type RiderHit = {
  id: string;
  username: string;
  avatarUrl: string;
  city: string | null;
  moto: string | null;
  relation: FriendRelation;
  /** Motards près de moi : distance arrondie (jamais la position) */
  distanceKm?: number;
};

/** Minuscules sans accents (même règle que fold_text côté serveur) */
export function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .toLowerCase()
    .trim();
}

type RiderRow = {
  id: string;
  username: string;
  avatar_path: string;
  city: string | null;
  moto_brand: string | null;
  moto_model: string | null;
  relation: FriendRelation;
};

export async function searchRiders(query: string): Promise<RiderHit[]> {
  if (fold(query).length < MIN_QUERY) return [];
  const { data, error } = await supabase.rpc('search_riders', { p_query: query.trim(), p_limit: 30 });
  if (error) throw error;
  return ((data ?? []) as RiderRow[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: photoUrl(r.avatar_path),
    city: r.city,
    moto: r.moto_brand ? `${r.moto_brand} ${r.moto_model ?? ''}`.trim() : null,
    relation: r.relation,
  }));
}

async function ids(fn: 'search_rides' | 'search_places' | 'search_events', query: string): Promise<string[]> {
  const { data, error } = await supabase.rpc(fn, { p_query: query.trim(), p_limit: 30 });
  if (error) throw error;
  // setof uuid : tableau de chaînes, ou d'objets selon la version de PostgREST
  return ((data ?? []) as (string | Record<string, string>)[]).map((x) => (typeof x === 'string' ? x : Object.values(x)[0]));
}

export async function searchRides(query: string, userId: string): Promise<RideSummary[]> {
  if (fold(query).length < MIN_QUERY) return [];
  return fetchRidesByIds(await ids('search_rides', query), userId);
}

export async function searchPlaces(query: string): Promise<CommunityPlace[]> {
  if (fold(query).length < MIN_QUERY) return [];
  return fetchPlacesByIds(await ids('search_places', query));
}

export async function searchEvents(query: string, userId: string): Promise<MotoEvent[]> {
  if (fold(query).length < MIN_QUERY) return [];
  return fetchEventsByIds(await ids('search_events', query), userId);
}

// ---------- Historique des recherches (sur l'appareil) ----------

const HISTORY_KEY = 'moto.globalSearchHistory';
const HISTORY_MAX = 10;

function readHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

let history = readHistory();
const listeners = new Set<() => void>();

function writeHistory(next: string[]) {
  history = next;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // pas grave : gardé pour cette session
  }
  listeners.forEach((l) => l());
}

export function addToHistory(query: string) {
  const q = query.trim();
  if (fold(q).length < MIN_QUERY) return;
  writeHistory([q, ...history.filter((h) => fold(h) !== fold(q))].slice(0, HISTORY_MAX));
}

export const removeFromHistory = (query: string) => writeHistory(history.filter((h) => h !== query));
export const clearHistory = () => writeHistory([]);

export function useSearchHistory() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => history,
  );
}
