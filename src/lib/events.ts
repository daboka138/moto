import type { Place } from '@/lib/geocoding';
import { photoUrl, uploadPhoto, type PhotoValue } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Agenda moto : événements ouverts aux membres, inscription « J'y vais » ou « Intéressé »,
// rappel la veille, discussion, photos après. Validation légère par l'admin (review_status) :
// publié tout de suite pour un membre qui a déjà un événement validé, sinon visible de ses amis,
// invités et membres du club en attendant. Archivés 1 an après la fin (purge_old_events).

export type EventKind =
  | 'rassemblement'
  | 'salon'
  | 'caritative'
  | 'circuit'
  | 'bourse'
  | 'sortie'
  | 'cafe'
  | 'balade'
  | 'concert'
  | 'autre';

export const EVENT_KINDS: { value: EventKind; label: string; emoji: string }[] = [
  { value: 'rassemblement', label: 'Rasso', emoji: '🏍️' },
  { value: 'salon', label: 'Salon', emoji: '🎪' },
  { value: 'caritative', label: 'Balade caritative', emoji: '💛' },
  { value: 'circuit', label: 'Journée circuit', emoji: '🏁' },
  { value: 'bourse', label: 'Bourse / expo', emoji: '🔩' },
  { value: 'sortie', label: 'Sortie club', emoji: '🚩' },
  { value: 'cafe', label: 'Café moto', emoji: '☕' },
  { value: 'balade', label: 'Balade', emoji: '🛣️' },
  { value: 'concert', label: 'Concert / soirée', emoji: '🎸' },
  { value: 'autre', label: 'Autre', emoji: '📍' },
];

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type PriceKind = 'free' | 'paid';

/** Lien de partage : ouvre la version web (app.passeryder.fr), qui propose d'ouvrir l'app */
export const eventShareUrl = (id: string) => `https://app.passeryder.fr/event/${id}`;

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
  linkUrl: string | null;
  priceKind: PriceKind | null;
  priceText: string | null;
  /** Organisateur affiché (club, association) ; sinon le pseudo du créateur */
  organizerLabel: string | null;
  clubId: string | null;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
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
  link_url: string | null;
  price_kind: PriceKind | null;
  price_text: string | null;
  organizer_label: string | null;
  club_id: string | null;
  review_status: ReviewStatus;
  review_note: string | null;
  organizer: { username: string } | null;
  attendees: { user_id: string; status: AttendStatus; profile: { username: string; avatar_path: string } | null }[];
};

const FIELDS = `id, kind, title, description, starts_at, ends_at, place_label, latitude, longitude, photo_path, max_attendees, created_by,
  link_url, price_kind, price_text, organizer_label, club_id, review_status, review_note,
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
    linkUrl: r.link_url,
    priceKind: r.price_kind,
    priceText: r.price_text,
    organizerLabel: r.organizer_label,
    clubId: r.club_id,
    reviewStatus: r.review_status,
    reviewNote: r.review_note,
  };
}

/** Fin réelle (sans date de fin : le lendemain du début) */
export const eventEnd = (e: Pick<MotoEvent, 'startsAt' | 'endsAt'>) =>
  e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 24 * 3600 * 1000);

/** Événement terminé (hors rendu : Date.now) */
export const isEventOver = (e: Pick<MotoEvent, 'startsAt' | 'endsAt'>) => eventEnd(e).getTime() < Date.now();

/** Événement commencé (photos partagées à partir du début) */
export const hasEventStarted = (e: Pick<MotoEvent, 'startsAt'>) => new Date(e.startsAt).getTime() <= Date.now();

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

/** Événements passés (archives : 1 an), les plus récents d'abord */
export async function fetchPastEvents(userId: string): Promise<MotoEvent[]> {
  const now = new Date();
  const { data, error } = await supabase
    .from('events')
    .select(FIELDS)
    .lt('starts_at', now.toISOString())
    .gte('starts_at', new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString())
    .order('starts_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => toEvent(r, userId)).filter((e) => isEventOver(e));
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
  clubId?: string | null;
  linkUrl: string;
  priceKind: PriceKind | null;
  priceText: string;
  organizerLabel: string;
};

/** Lien saisi : https:// ajouté si besoin ; null si vide ; erreur si ce n'est pas une adresse web */
export function normalizeLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  if (!/^https?:\/\/[^\s/]+\.[^\s]{2,}/i.test(url) || url.length > 300) throw new Error('Le lien ne ressemble pas à une adresse web.');
  return url;
}

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
      // Au nom d'un club : ses membres sont invités par le serveur
      club_id: d.clubId ?? null,
      link_url: normalizeLink(d.linkUrl),
      price_kind: d.priceKind,
      price_text: d.priceKind === 'paid' ? d.priceText.trim().slice(0, 60) || null : null,
      organizer_label: d.organizerLabel.trim().slice(0, 80) || null,
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

/** Inviter des amis (le serveur n'accepte que des amis, pour un événement pas encore terminé) */
export async function inviteToEvent(eventId: string, friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase.from('event_invites').insert(friendIds.map((user_id) => ({ event_id: eventId, user_id })));
  if (error) throw new Error(error.message);
}

/** Amis que j'ai déjà invités à cet événement */
export async function fetchMyEventInvites(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_invites').select('user_id').eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

/** Refuser une invitation */
export async function declineEventInvite(eventId: string, userId: string) {
  const { error } = await supabase.from('event_invites').delete().eq('event_id', eventId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// ---------- Discussion et photos ----------

export type EventPhoto = { id: string; authorId: string; username: string; path: string; url: string; createdAt: string };

export async function fetchEventPhotos(eventId: string): Promise<EventPhoto[]> {
  const { data, error } = await supabase
    .from('event_photos')
    .select('id, author_id, photo_path, created_at, author:profiles(username)')
    .eq('event_id', eventId)
    .order('created_at')
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as { id: string; author_id: string; photo_path: string; created_at: string; author: { username: string } | null }[]).map(
    (r) => ({ id: r.id, authorId: r.author_id, username: r.author?.username ?? 'motard', path: r.photo_path, url: photoUrl(r.photo_path), createdAt: r.created_at }),
  );
}

/** Partage mes photos de l'événement (à partir de son début ; 12 par membre) */
export async function addEventPhotos(eventId: string, userId: string, photos: PhotoValue[]) {
  for (const p of photos) {
    const path = await uploadPhoto(userId, 'event', p);
    const { error } = await supabase.from('event_photos').insert({ event_id: eventId, author_id: userId, photo_path: path });
    if (error) {
      await supabase.storage.from('photos').remove([path]);
      throw new Error(error.message);
    }
  }
}

export async function deleteEventPhoto(photo: EventPhoto, userId: string) {
  const { error } = await supabase.from('event_photos').delete().eq('id', photo.id);
  if (error) throw new Error(error.message);
  if (photo.authorId === userId) await supabase.storage.from('photos').remove([photo.path]);
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

/** Titre d'une journée de l'agenda : « Aujourd'hui », « Demain », « samedi 25 octobre » */
export function agendaDayTitle(day: Date, now = new Date()) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(day) - start(now)) / (24 * 3600 * 1000));
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Demain';
  return day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(day.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** Agenda : événements groupés par jour de début (déjà commencés : « En cours ») */
export function groupByDay(events: MotoEvent[], now = new Date()): { title: string; data: MotoEvent[] }[] {
  const sections: { title: string; data: MotoEvent[] }[] = [];
  const running = events.filter((e) => new Date(e.startsAt).getTime() < now.getTime() && !isEventOver(e));
  if (running.length) sections.push({ title: 'En cours', data: running });
  for (const e of events) {
    if (running.includes(e)) continue;
    const title = agendaDayTitle(new Date(e.startsAt), now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(e);
    else sections.push({ title, data: [e] });
  }
  return sections;
}
