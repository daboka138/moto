import type { Place } from '@/lib/geocoding';
import { photoUrl, uploadPhoto, type PhotoValue } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Événements et rassemblements motards : ouverts à tous les membres, inscription « J'y vais »
// ou « Intéressé ». Supprimés automatiquement 30 jours après leur fin (purge_old_events).

export type EventKind = 'rassemblement' | 'salon' | 'sortie' | 'circuit' | 'concert' | 'autre';

export const EVENT_KINDS: { value: EventKind; label: string; emoji: string }[] = [
  { value: 'rassemblement', label: 'Rassemblement', emoji: '🏍️' },
  { value: 'sortie', label: 'Sortie / balade géante', emoji: '🛣️' },
  { value: 'salon', label: 'Salon / expo', emoji: '🎪' },
  { value: 'circuit', label: 'Journée circuit', emoji: '🏁' },
  { value: 'concert', label: 'Concert / soirée', emoji: '🎸' },
  { value: 'autre', label: 'Autre', emoji: '📍' },
];

export const eventKindInfo = (k: EventKind) => EVENT_KINDS.find((x) => x.value === k)!;

export type AttendStatus = 'going' | 'interested';

export type Attendee = { id: string; username: string; avatarUrl: string; status: AttendStatus };

export type MotoEvent = {
  id: string;
  kind: EventKind;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  place: Place;
  photoUrl: string | null;
  photoPath: string | null;
  maxAttendees: number | null;
  createdBy: string;
  organizerName: string;
  attendees: Attendee[];
  going: number;
  interested: number;
  /** Mon inscription */
  myStatus: AttendStatus | null;
  isDemo?: boolean;
};

type Row = {
  id: string;
  kind: EventKind;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  place_label: string;
  latitude: number;
  longitude: number;
  photo_path: string | null;
  max_attendees: number | null;
  created_by: string;
  organizer: { username: string } | null;
  attendees: { user_id: string; status: AttendStatus; profile: { username: string; avatar_path: string } | null }[];
};

const FIELDS = `id, kind, title, description, starts_at, ends_at, place_label, latitude, longitude, photo_path, max_attendees, created_by,
  organizer:profiles!events_created_by_fkey(username),
  attendees:event_attendees(user_id, status, profile:profiles(username, avatar_path))`;

function toEvent(r: Row, userId: string): MotoEvent {
  const attendees = r.attendees.map((a) => ({
    id: a.user_id,
    username: a.profile?.username ?? 'motard',
    avatarUrl: photoUrl(a.profile?.avatar_path ?? ''),
    status: a.status,
  }));
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    place: { label: r.place_label, latitude: r.latitude, longitude: r.longitude },
    photoPath: r.photo_path,
    photoUrl: r.photo_path ? photoUrl(r.photo_path) : null,
    maxAttendees: r.max_attendees,
    createdBy: r.created_by,
    organizerName: r.organizer?.username ?? 'motard',
    attendees,
    going: attendees.filter((a) => a.status === 'going').length,
    interested: attendees.filter((a) => a.status === 'interested').length,
    myStatus: attendees.find((a) => a.id === userId)?.status ?? null,
  };
}

/** Fin réelle (sans date de fin : le lendemain du début) */
export const eventEnd = (e: Pick<MotoEvent, 'startsAt' | 'endsAt'>) =>
  e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 24 * 3600 * 1000);

/** Événement terminé (hors rendu : Date.now) */
export const isEventOver = (e: Pick<MotoEvent, 'startsAt' | 'endsAt'>) => eventEnd(e).getTime() < Date.now();

/** Événements à venir ou en cours */
export async function fetchUpcomingEvents(userId: string): Promise<MotoEvent[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase.from('events').select(FIELDS).gte('starts_at', since).order('starts_at').limit(200);
  if (error) throw error;
  // Événements de plusieurs jours commencés avant hier : récupérés par leur date de fin
  const { data: running, error: runningError } = await supabase
    .from('events')
    .select(FIELDS)
    .lt('starts_at', since)
    .gte('ends_at', new Date().toISOString())
    .limit(50);
  if (runningError) throw runningError;
  const now = Date.now();
  return [...((running ?? []) as unknown as Row[]), ...((data ?? []) as unknown as Row[])]
    .map((r) => toEvent(r, userId))
    .filter((e) => eventEnd(e).getTime() > now);
}

/** Événements par identifiants (résultats de recherche), dans l'ordre donné */
export async function fetchEventsByIds(ids: string[], userId: string): Promise<MotoEvent[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('events').select(FIELDS).in('id', ids);
  if (error) throw error;
  const events = ((data ?? []) as unknown as Row[]).map((r) => toEvent(r, userId));
  return ids.map((id) => events.find((e) => e.id === id)).filter((e): e is MotoEvent => !!e);
}

export async function fetchEvent(id: string, userId: string): Promise<MotoEvent | null> {
  const { data, error } = await supabase.from('events').select(FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toEvent(data as unknown as Row, userId) : null;
}

export type EventDraft = {
  kind: EventKind;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  place: Place;
  maxAttendees: number | null;
  photo: PhotoValue;
};

export async function createEvent(userId: string, d: EventDraft): Promise<string> {
  const photoPath = d.photo.localUri ? await uploadPhoto(userId, 'event', d.photo) : null;
  const { data, error } = await supabase
    .from('events')
    .insert({
      created_by: userId,
      kind: d.kind,
      title: d.title.trim(),
      description: d.description.trim() || null,
      starts_at: d.startsAt.toISOString(),
      ends_at: d.endsAt?.toISOString() ?? null,
      place_label: d.place.label.slice(0, 200),
      latitude: d.place.latitude,
      longitude: d.place.longitude,
      max_attendees: d.maxAttendees,
      photo_path: photoPath,
    })
    .select('id')
    .single();
  if (error) {
    if (photoPath) await supabase.storage.from('photos').remove([photoPath]);
    throw new Error(error.message);
  }
  // L'organisateur y va
  await setAttendance(data.id, userId, 'going').catch(() => {});
  return data.id;
}

/** S'inscrire (going / interested) ou se désinscrire (null) */
export async function setAttendance(eventId: string, userId: string, status: AttendStatus | null) {
  const { error } = status
    ? await supabase.from('event_attendees').upsert({ event_id: eventId, user_id: userId, status }, { onConflict: 'event_id,user_id' })
    : await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId);
  if (error) throw new Error(error.message.includes('complet') ? 'Cet événement est complet.' : error.message);
}

export async function deleteEvent(e: MotoEvent) {
  const { error } = await supabase.from('events').delete().eq('id', e.id);
  if (error) throw error;
  if (e.photoPath) await supabase.storage.from('photos').remove([e.photoPath]);
}

/** « sam. 12 oct. · 10:00 → dim. 13 oct. » */
export function formatEventDates(e: Pick<MotoEvent, 'startsAt' | 'endsAt'>) {
  const s = new Date(e.startsAt);
  const day = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (!e.endsAt) return `${day(s)} · ${time(s)}`;
  const end = new Date(e.endsAt);
  return s.toDateString() === end.toDateString() ? `${day(s)} · ${time(s)} – ${time(end)}` : `${day(s)} ${time(s)} → ${day(end)}`;
}
