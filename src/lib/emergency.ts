import { useSyncExternalStore } from 'react';

import { sendAlertSms, type AlertSmsResult } from '@/lib/alert-sms';
import type { LatLng } from '@/lib/geo';
import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Contacts d'urgence et SOS.
// - Amis de l'app : enregistrés sur le serveur ; un SOS leur envoie une notification et un message.
// - Numéros de téléphone : gardés sur ce téléphone ; un SOS leur envoie un SMS automatique via le
//   serveur (Brevo, lib/alert-sms.ts). Si ça échoue : SMS prérempli à envoyer soi-même (pas de
//   permission SEND_SMS, interdite par Google Play).

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
/** Une seule liste de contacts d'urgence : amis de l'app + numéros, 5 au total */
export const MAX_EMERGENCY_CONTACTS = 5;

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

export const PHONE_ERROR = 'Numéro invalide : un portable français commence par 06 ou 07 (ou +33 6 / +33 7), 10 chiffres.';

/** Portable français (06 / 07, +33 6 / +33 7, 0033…) → +33612345678 ; null si invalide */
export function parseFrenchMobile(raw: string): string | null {
  const n = raw.replace(/[\s.\-()]/g, '');
  const m = /^(?:0|\+33|0033)([67]\d{8})$/.exec(n);
  return m ? `+33${m[1]}` : null;
}

/** +33612345678 → 06 12 34 56 78 (autres formats laissés tels quels) */
export function formatPhone(phone: string) {
  const fr = parseFrenchMobile(phone);
  return fr ? `0${fr.slice(3)}`.replace(/(\d{2})(?=\d)/g, '$1 ') : phone;
}

/** Ajoute un numéro ; totalContacts = taille actuelle de la liste (amis + numéros) */
export function addPhoneContact(name: string, rawPhone: string, totalContacts: number) {
  const phone = parseFrenchMobile(rawPhone);
  if (!phone) throw new Error(PHONE_ERROR);
  if (!name.trim()) throw new Error('Indique un nom');
  if (totalContacts >= MAX_EMERGENCY_CONTACTS) throw new Error(`${MAX_EMERGENCY_CONTACTS} contacts d’urgence maximum`);
  if (phones.some((p) => (parseFrenchMobile(p.phone) ?? p.phone) === phone)) throw new Error('Ce numéro est déjà dans la liste');
  writePhones([...phones, { id: `${Date.now()}`, name: name.trim().slice(0, 60), phone }]);
}

export function removePhoneContact(id: string) {
  writePhones(phones.filter((p) => p.id !== id));
}

// ---------- SOS ----------

export function mapLink(p: LatLng) {
  return `https://maps.google.com/?q=${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
}

export type SosResult = {
  /** Id du SOS enregistré (null si le serveur n'a pas pu être joint) */
  id: string | null;
  /** Message d'erreur du serveur, le cas échéant */
  error: string | null;
  /** SMS aux numéros de téléphone (null : aucun numéro) */
  sms: AlertSmsResult | null;
};

/**
 * Envoie un SOS : notification + message aux amis contacts d'urgence (serveur), puis SMS
 * automatique aux numéros de téléphone (SMS prérempli à envoyer soi-même si ça échoue).
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

  const sms = await sendAlertSms(
    kind === 'fall' ? 'chute' : 'sos',
    phones.map((p) => p.phone),
    position,
  );
  return { id, error, sms };
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
