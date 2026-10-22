import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

// Noms affichés (profiles.display_name, facultatif) : « Dimitri » en gros, @pseudo en petit.
// Les listes de l'app chargent surtout le pseudo ; les noms affichés sont lus ici à la demande,
// par lots (une requête pour tous les motards visibles à l'écran), et gardés 10 minutes.
// Sans nom affiché : @pseudo, comme avant.

type Entry = { name: string | null; at: number };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, Entry>();
const queued = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

async function flush() {
  timer = null;
  const ids = [...queued];
  queued.clear();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', chunk);
    if (error) {
      console.warn('Noms affichés indisponibles', error);
      continue;
    }
    const now = Date.now();
    for (const id of chunk) cache.set(id, { name: null, at: now });
    for (const r of data ?? []) cache.set(r.id as string, { name: (r.display_name as string | null) ?? null, at: now });
  }
  emit();
}

function request(id: string) {
  const e = cache.get(id);
  if (e && Date.now() - e.at < TTL_MS) return;
  queued.add(id);
  timer ??= setTimeout(flush, 40);
}

/** Nom affiché déjà connu (chargements qui le contiennent, mon profil après modification) */
export function primeDisplayName(id: string, name: string | null | undefined) {
  cache.set(id, { name: name?.trim() || null, at: Date.now() });
  emit();
}

/** Nom affiché d'un motard (null : aucun, ou pas encore chargé) */
export function useDisplayName(id: string | null | undefined): string | null {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  useEffect(() => {
    if (id) request(id);
  }, [id]);
  return id ? (cache.get(id)?.name ?? null) : null;
}

/** « Dimitri » si nom affiché, sinon « @pseudo » (titres, menus) */
export function nameLabel(username: string, displayName: string | null | undefined) {
  return displayName?.trim() || `@${username}`;
}

/** Libellé d'un motard, pour un titre ou un menu */
export function useNameLabel(id: string | null | undefined, username: string) {
  return nameLabel(username, useDisplayName(id));
}
