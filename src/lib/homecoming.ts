import { useSyncExternalStore } from 'react';

import type { LatLng } from '@/lib/geo';
import type { SearchResult } from '@/lib/search';
import { supabase } from '@/lib/supabase';

// Mode « Je rentre » : destination + heure d'arrivée max. Si je ne suis pas arrivé (et que je
// n'ai pas prolongé), le serveur (pg_cron, check_homecomings) alerte mes contacts d'urgence avec
// ma dernière position connue. L'app envoie ma position toutes les minutes tant qu'elle est ouverte.

export type Homecoming = {
  id: string;
  destination: string;
  latitude: number;
  longitude: number;
  deadline: string;
};

type Row = { id: string; destination_label: string; dest_latitude: number; dest_longitude: number; deadline: string };

const FIELDS = 'id, destination_label, dest_latitude, dest_longitude, deadline';

function toHomecoming(r: Row): Homecoming {
  return { id: r.id, destination: r.destination_label, latitude: r.dest_latitude, longitude: r.dest_longitude, deadline: r.deadline };
}

// « Je rentre » en cours, partagé entre la carte et l'écran Je rentre
let active: Homecoming | null = null;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function set(next: Homecoming | null) {
  active = next;
  listeners.forEach((l) => l());
}

export function useHomecoming() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => active,
  );
}

export async function refreshHomecoming(userId: string) {
  const { data, error } = await supabase
    .from('homecomings')
    .select(FIELDS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  loadedFor = userId;
  set(data ? toHomecoming(data as Row) : null);
}

/** Chargé une fois par session (puis tenu à jour par les actions ci-dessous) */
export function ensureHomecomingLoaded(userId: string) {
  if (loadedFor === userId) return;
  loadedFor = userId;
  refreshHomecoming(userId).catch((e) => console.warn('« Je rentre » indisponible', e));
}

export async function startHomecoming(userId: string, dest: SearchResult, deadline: Date, me: LatLng | null) {
  const { data, error } = await supabase
    .from('homecomings')
    .insert({
      user_id: userId,
      destination_label: dest.label.slice(0, 200),
      dest_latitude: dest.latitude,
      dest_longitude: dest.longitude,
      deadline: deadline.toISOString(),
      last_latitude: me?.latitude ?? null,
      last_longitude: me?.longitude ?? null,
    })
    .select(FIELDS)
    .single();
  if (error) throw new Error(error.message.includes('homecomings_one_active') ? '« Je rentre » déjà en cours' : error.message);
  set(toHomecoming(data as Row));
}

/** Repousse l'heure limite (à partir de l'heure limite actuelle, ou de maintenant si elle est passée) */
export async function extendHomecoming(minutes: number) {
  if (!active) return;
  const base = Math.max(new Date(active.deadline).getTime(), Date.now());
  const deadline = new Date(base + minutes * 60_000).toISOString();
  const { error } = await supabase.from('homecomings').update({ deadline }).eq('id', active.id);
  if (error) throw new Error(error.message);
  set({ ...active, deadline });
}

export async function finishHomecoming(status: 'arrived' | 'cancelled') {
  if (!active) return;
  const { error } = await supabase.from('homecomings').update({ status }).eq('id', active.id);
  if (error) throw new Error(error.message);
  set(null);
}

export async function sendHomecomingPosition(p: LatLng) {
  if (!active) return;
  const { error } = await supabase
    .from('homecomings')
    .update({ last_latitude: p.latitude, last_longitude: p.longitude })
    .eq('id', active.id);
  // Déjà terminé côté serveur (alerte envoyée) : on recharge
  if (error && loadedFor) await refreshHomecoming(loadedFor);
}
