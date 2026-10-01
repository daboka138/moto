import * as SMS from 'expo-sms';
import { useSyncExternalStore } from 'react';

import type { LatLng } from '@/lib/geo';
import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Contacts d'urgence et SOS.
// - Amis de l'app : enregistrés sur le serveur ; un SOS leur envoie une notification et un message.
// - Numéros de téléphone : restent sur ce téléphone ; un SOS ouvre un SMS prérempli (envoyé par
//   moi : pas de permission SEND_SMS, interdite par Google Play).

export type MemberContact = { id: string; username: string; avatarUrl: string };
export type PhoneContact = { id: string; name: string; phone: string };
export type SosKind = 'manual' | 'fall' | 'homecoming';

export async function fetchMemberContacts(userId: string): Promise<MemberContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('contact_id, profile:profiles!emergency_contacts_contact_id_fkey(username, avatar_path)')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw error;
  type Row = { contact_id: string; profile: { username: string; avatar_path: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.contact_id,
    username: r.profile?.username ?? '?',
    avatarUrl: photoUrl(r.profile?.avatar_path ?? ''),
  }));
}

export async function addMemberContact(userId: string, contactId: string) {
  const { error } = await supabase.from('emergency_contacts').insert({ user_id: userId, contact_id: contactId });
  if (error) throw new Error(error.message);
}

export async function removeMemberContact(userId: string, contactId: string) {
  const { error } = await supabase.from('emergency_contacts').delete().eq('user_id', userId).eq('contact_id', contactId);
  if (error) throw new Error(error.message);
}

/** Les membres qui m'ont choisi comme contact d'urgence */
export async function fetchContactOf(): Promise<MemberContact[]> {
  const { data, error } = await supabase.rpc('my_emergency_contact_of');
  if (error) throw error;
  return ((data ?? []) as { user_id: string; username: string; avatar_path: string }[]).map((r) => ({
    id: r.user_id,
    username: r.username,
    avatarUrl: photoUrl(r.avatar_path),
  }));
}

export async function leaveContactOf(ownerId: string) {
  const { error } = await supabase.rpc('leave_emergency_contact', { owner: ownerId });
  if (error) throw new Error(error.message);
}

// ---------- Numéros de téléphone (sur le téléphone uniquement) ----------

const PHONES_KEY = 'moto.emergencyPhones';
const MAX_PHONES = 5;

function readPhones(): PhoneContact[] {
  try {
    return JSON.parse(localStorage.getItem(PHONES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

let phones = readPhones();
const listeners = new Set<() => void>();

function writePhones(next: PhoneContact[]) {
  phones = next;
  try {
    localStorage.setItem(PHONES_KEY, JSON.stringify(next));
  } catch {
    // pas grave : gardé pour cette session
  }
  listeners.forEach((l) => l());
}

export function usePhoneContacts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => phones,
  );
}

export function getPhoneContacts() {
  return phones;
}

/** Numéro saisi → format compact (+33612345678 ou 0612345678), null si invalide */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s.\-()]/g, '');
  return /^\+?\d{6,15}$/.test(compact) ? compact : null;
}

export function addPhoneContact(name: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error('Numéro de téléphone invalide');
  if (!name.trim()) throw new Error('Indique un nom');
  if (phones.length >= MAX_PHONES) throw new Error(`${MAX_PHONES} numéros maximum`);
  if (phones.some((p) => p.phone === phone)) throw new Error('Ce numéro est déjà dans la liste');
  writePhones([...phones, { id: `${Date.now()}`, name: name.trim().slice(0, 60), phone }]);
}

export function removePhoneContact(id: string) {
  writePhones(phones.filter((p) => p.id !== id));
}

// ---------- SOS ----------

export function mapLink(p: LatLng) {
  return `https://maps.google.com/?q=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
}

const SMS_TEXT: Record<SosKind, string> = {
  manual: 'SOS : j’ai besoin d’aide.',
  fall: 'SOS : chute détectée par PasseRyder, je ne réponds pas.',
  homecoming: 'SOS : je ne suis pas arrivé(e) à l’heure prévue.',
};

export type SosResult = {
  /** Id du SOS enregistré (null si le serveur n'a pas pu être joint) */
  id: string | null;
  /** Message d'erreur du serveur, le cas échéant */
  error: string | null;
  /** Un SMS prérempli a été ouvert pour les numéros de téléphone */
  smsOpened: boolean;
};

/**
 * Envoie un SOS : notification + message aux amis contacts d'urgence (serveur), puis ouvre un
 * SMS prérempli pour les numéros de téléphone (il faut appuyer sur Envoyer).
 */
export async function sendSos(kind: Exclude<SosKind, 'homecoming'>, position: LatLng | null): Promise<SosResult> {
  let id: string | null = null;
  let error: string | null = null;
  try {
    const { data, error: rpcError } = await supabase.rpc('trigger_sos', {
      sos_kind: kind,
      lat: position?.latitude ?? null,
      lng: position?.longitude ?? null,
    });
    if (rpcError) throw new Error(rpcError.message);
    id = data as string;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  let smsOpened = false;
  const numbers = phones.map((p) => p.phone);
  if (numbers.length && (await SMS.isAvailableAsync())) {
    const where = position ? ` Ma position : ${mapLink(position)}` : ' Position inconnue.';
    try {
      smsOpened = true;
      await SMS.sendSMSAsync(numbers, `${SMS_TEXT[kind]}${where}`);
    } catch (e) {
      console.warn('SMS impossible', e);
    }
  }
  return { id, error, smsOpened };
}

/** « Je vais bien » : l'alerte est levée et les contacts prévenus */
export async function resolveSos(id: string) {
  const { error } = await supabase.rpc('resolve_sos', { sos: id });
  if (error) throw new Error(error.message);
}

export type SosEvent = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  kind: SosKind;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  resolvedAt: string | null;
};

export async function fetchSos(id: string): Promise<SosEvent | null> {
  const { data, error } = await supabase
    .from('sos_events')
    .select('id, user_id, kind, latitude, longitude, created_at, resolved_at, profile:profiles(username, avatar_path)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  type Row = {
    id: string;
    user_id: string;
    kind: SosKind;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
    resolved_at: string | null;
    profile: { username: string; avatar_path: string } | null;
  };
  const r = data as unknown as Row | null;
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    username: r.profile?.username ?? '?',
    avatarUrl: photoUrl(r.profile?.avatar_path ?? ''),
    kind: r.kind,
    latitude: r.latitude,
    longitude: r.longitude,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

export const SOS_KIND_LABELS: Record<SosKind, string> = {
  manual: 'Demande d’aide (bouton SOS)',
  fall: 'Chute détectée, sans réponse',
  homecoming: 'Pas arrivé(e) à l’heure prévue (« Je rentre »)',
};
