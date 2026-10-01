import { useSyncExternalStore } from 'react';

import type { SearchResult } from '@/lib/search';

// Lieux favoris (Maison, Travail, favoris perso), en raccourci sous la recherche de la carte.
// Gardés sur le téléphone, jamais envoyés.

export type FavoriteKind = 'home' | 'work' | 'custom';

export type Favorite = SearchResult & { id: string; kind: FavoriteKind };

const KEY = 'moto.favorites';
const MAX_CUSTOM = 20;

function read(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

let favorites = read();
const listeners = new Set<() => void>();

function write(next: Favorite[]) {
  favorites = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // pas grave : gardé pour cette session
  }
  listeners.forEach((l) => l());
}

export function useFavorites() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => favorites,
  );
}

const ORDER: Record<FavoriteKind, number> = { home: 0, work: 1, custom: 2 };

/** Maison, puis Travail, puis les favoris perso du plus récent au plus ancien */
export function sortFavorites(list: Favorite[]) {
  return [...list].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

/** Même lieu (à ~20 m près) */
export function samePlace(a: SearchResult, b: SearchResult) {
  return Math.abs(a.latitude - b.latitude) < 2e-4 && Math.abs(a.longitude - b.longitude) < 2e-4;
}

export function findFavorite(place: SearchResult) {
  return favorites.find((f) => samePlace(f, place)) ?? null;
}

/** Maison et Travail sont uniques : les redéfinir remplace l'ancienne adresse */
export function setFavorite(place: SearchResult, kind: FavoriteKind) {
  const { label, detail, latitude, longitude, source } = place;
  const fav: Favorite = { id: `${kind}-${Date.now()}`, kind, label, detail, latitude, longitude, source };
  const others = favorites.filter((f) => !samePlace(f, place) && (kind === 'custom' || f.kind !== kind));
  const custom = others.filter((f) => f.kind === 'custom');
  // Trop de favoris perso : le plus ancien part
  const kept = kind === 'custom' && custom.length >= MAX_CUSTOM ? others.filter((f) => f !== custom[custom.length - 1]) : others;
  write([fav, ...kept]);
}

export function removeFavorite(id: string) {
  write(favorites.filter((f) => f.id !== id));
}

export const FAVORITE_LABELS: Record<Exclude<FavoriteKind, 'custom'>, string> = { home: 'Maison', work: 'Travail' };
