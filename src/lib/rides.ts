import { LevelColors } from '@/constants/theme';
import type { Place } from '@/lib/geocoding';
import type { MotoCategory, Pace, Surface } from '@/lib/moto';

import { photoUrl } from '@/lib/profile';
import type { ComputedRoute } from '@/lib/routing';
import { supabase } from '@/lib/supabase';

export { rideRouteOptions } from '@/lib/moto';

// Balades planifiées = table group_rides. Qui voit quoi et qui peut s'inscrire
// est décidé par Supabase (RLS, can_see_ride, can_join_ride, capacité).

/** Niveau / rythme de la balade (mêmes noms que le rythme du profil ; « sportif » = Arsouille) */
export type RideLevel = 'pepere' | 'tranquille' | 'dynamique' | 'sportif';
export type RideVisibility = 'public' | 'friends' | 'private';
export type RideStatus = 'upcoming' | 'live' | 'ended';

export const RIDE_LEVELS: { value: RideLevel; label: string; emoji: string; description: string; color: string; pace: Pace }[] = [
  { value: 'pepere', label: 'Pépère', emoji: '🐢', description: 'Balade cool, pauses photo', color: LevelColors.pepere, pace: 'pepere' },
  { value: 'tranquille', label: 'Tranquille', emoji: '😎', description: 'Rythme régulier, détente', color: LevelColors.tranquille, pace: 'cool' },
  { value: 'dynamique', label: 'Dynamique', emoji: '🔥', description: 'Ça roule, virages enchaînés', color: LevelColors.dynamique, pace: 'modere' },
  { value: 'sportif', label: 'Arsouille', emoji: '🏁', description: 'Pilotage sportif, motards expérimentés', color: LevelColors.sportif, pace: 'soutenu' },
];

export const RIDE_VISIBILITIES: { value: RideVisibility; label: string; description: string }[] = [
  { value: 'public', label: 'Publique', description: 'Visible par tous, chacun peut participer.' },
  { value: 'friends', label: 'Amis', description: 'Visible par tes amis, qui peuvent participer.' },
  { value: 'private', label: 'Privée', description: 'Uniquement sur invitation.' },
];

export const levelInfo = (level: RideLevel) => RIDE_LEVELS.find((l) => l.value === level) ?? RIDE_LEVELS[1];
export const visibilityInfo = (v: RideVisibility) => RIDE_VISIBILITIES.find((x) => x.value === v)!;

export type RidePerson = { id: string; username: string; avatarUrl: string };

/** Participant tel que vu dans la liste : sert au fil d'actualité (« X participe à… ») */
export type RideMember = { id: string; status: 'invited' | 'joined'; since: string };

export type RideSummary = {
  id: string;
  title: string;
  level: RideLevel;
  visibility: RideVisibility;
  meetingAt: string;
  meeting: Place;
  distanceM: number | null;
  durationS: number | null;
  participantsCount: number;
  maxParticipants: number | null;
  /** Places passager encore libres (« 🏍️ J'ai une place passager » non prise) */
  passengerSeats: number;
  /** Inscrits qui cherchent encore une place (sac de sable) */
  passengerSeekers: number;
  organizer: RidePerson;
  members: RideMember[];
  createdAt: string;
  /** Catégories de motos acceptées */
  categories: MotoCategory[];
  pace: Pace | null;
  surface: Surface;
  status: RideStatus;
  /** Je suis inscrit (joined) */
  joined: boolean;
  /** J'ai une invitation en attente */
  invited: boolean;
};

export type RideDetails = RideSummary & {
  description: string | null;
  start: Place;
  end: Place;
  waypoints: Place[];
  route: [number, number][] | null;
  participants: RideParticipant[];
  startedAt: string | null;
  endedAt: string | null;
  /** Convoi : écart toléré avec le motard le plus proche avant alerte (km, réglé par l'organisateur) */
  convoyGapKm: number;
  /** Point de regroupement posé par l'ouvreur ou l'organisateur pendant la balade */
  regroup: (Place & { at: string }) | null;
};

/** Rôle dans le convoi : ouvreur (devant) ou serre-file (derrière) */
export type RideRole = 'leader' | 'sweeper';

export const RIDE_ROLES: Record<RideRole, { label: string; emoji: string }> = {
  leader: { label: 'Ouvreur', emoji: '🚩' },
  sweeper: { label: 'Serre-file', emoji: '🧹' },
};

export type RideParticipant = RidePerson & {
  status: 'invited' | 'joined';
  role: RideRole | null;
  /** Pointé présent au RDV */
  checkedInAt: string | null;
  /** « Je fais une pause » : pas d'alerte de décrochage jusqu'à cette heure */
  pausedUntil: string | null;
  /** offer : a une place passager ; seek : cherche une place (sac de sable) */
  passenger: PassengerMode | null;
  /** Pilote ↔ passager associés (place prise) */
  passengerPartner: string | null;
};

export type PassengerMode = 'offer' | 'seek';

export const PASSENGER_MODES: Record<PassengerMode, { label: string; short: string; emoji: string }> = {
  offer: { label: 'J’ai une place passager', short: 'Place passager', emoji: '🏍️' },
  seek: { label: 'Je cherche une place (sac de sable)', short: 'Cherche une place', emoji: '🎒' },
};

/** Rappel affiché partout où il est question de passager */
export const PASSENGER_GEAR_NOTICE = 'Équipement obligatoire pour le passager : casque homologué et gants certifiés.';

export type RideDraft = {
  title: string;
  start: Place;
  end: Place;
  waypoints: Place[];
  route: ComputedRoute;
  meeting: Place;
  meetingAt: Date;
  level: RideLevel;
  visibility: RideVisibility;
  maxParticipants: number | null;
  description: string;
  categories: MotoCategory[];
  pace: Pace | null;
  surface: Surface;
  clubId?: string | null;
};

type Row = {
  id: string;
  title: string;
  created_by: string;
  description: string | null;
  level: RideLevel;
  visibility: RideVisibility;
  max_participants: number | null;
  meeting_at: string;
  meeting_label: string;
  meeting_lat: number;
  meeting_lng: number;
  start_label: string;
  start_lat: number;
  start_lng: number;
  end_label: string;
  end_lat: number;
  end_lng: number;
  waypoints: { label: string; lat: number; lng: number }[];
  route: [number, number][] | null;
  distance_m: number | null;
  duration_s: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  categories: MotoCategory[];
  pace: Pace | null;
  surface: Surface;
  convoy_gap_km?: number;
  regroup_lat?: number | null;
  regroup_lng?: number | null;
  regroup_label?: string | null;
  regroup_at?: string | null;
  organizer: { id: string; username: string; avatar_path: string } | null;
  participants: {
    user_id: string;
    status: 'invited' | 'joined';
    created_at: string;
    role?: RideRole | null;
    checked_in_at?: string | null;
    paused_until?: string | null;
    passenger?: PassengerMode | null;
    passenger_partner?: string | null;
    profile?: { id: string; username: string; avatar_path: string } | null;
  }[];
};

const SUMMARY_FIELDS = `id, title, created_by, level, visibility, max_participants, meeting_at, meeting_label,
  meeting_lat, meeting_lng, distance_m, duration_s, started_at, ended_at, created_at, categories, pace, surface,
  organizer:profiles!group_rides_created_by_fkey(id, username, avatar_path),
  participants:group_ride_participants(user_id, status, created_at, passenger, passenger_partner)`;

const DETAIL_FIELDS = `*,
  organizer:profiles!group_rides_created_by_fkey(id, username, avatar_path),
  participants:group_ride_participants(user_id, status, created_at, role, checked_in_at, paused_until, passenger, passenger_partner, profile:profiles!group_ride_participants_user_id_fkey(id, username, avatar_path))`;

/** Pendant combien de temps après le RDV une balade non démarrée reste listée */
const LISTED_AFTER_MEETING_MS = 12 * 3600 * 1000;

function statusOf(r: Pick<Row, 'started_at' | 'ended_at'>): RideStatus {
  if (r.ended_at) return 'ended';
  if (r.started_at) return 'live';
  return 'upcoming';
}

function toSummary(r: Row, userId: string): RideSummary {
  const mine = r.participants.find((p) => p.user_id === userId);
  return {
    id: r.id,
    title: r.title,
    level: r.level,
    visibility: r.visibility,
    meetingAt: r.meeting_at,
    meeting: { label: r.meeting_label, latitude: r.meeting_lat, longitude: r.meeting_lng },
    distanceM: r.distance_m,
    durationS: r.duration_s,
    participantsCount: r.participants.filter((p) => p.status === 'joined').length,
    maxParticipants: r.max_participants,
    passengerSeats: r.participants.filter((p) => p.status === 'joined' && p.passenger === 'offer' && !p.passenger_partner).length,
    passengerSeekers: r.participants.filter((p) => p.status === 'joined' && p.passenger === 'seek' && !p.passenger_partner).length,
    organizer: {
      id: r.created_by,
      username: r.organizer?.username ?? '?',
      avatarUrl: r.organizer ? photoUrl(r.organizer.avatar_path) : '',
    },
    members: r.participants.map((p) => ({ id: p.user_id, status: p.status, since: p.created_at })),
    createdAt: r.created_at,
    categories: r.categories,
    pace: r.pace,
    surface: r.surface,
    status: statusOf(r),
    joined: mine?.status === 'joined',
    invited: mine?.status === 'invited',
  };
}

/** Balades à venir ou en cours que j'ai le droit de voir. */
export async function fetchUpcomingRides(userId: string): Promise<RideSummary[]> {
  const since = new Date(Date.now() - LISTED_AFTER_MEETING_MS).toISOString();
  const { data, error } = await supabase
    .from('group_rides')
    .select(SUMMARY_FIELDS)
    .is('ended_at', null)
    .not('meeting_at', 'is', null)
    .gte('meeting_at', since)
    .order('meeting_at');
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => toSummary(r, userId));
}

/** Balades par identifiants (résultats de recherche), dans l'ordre donné */
export async function fetchRidesByIds(ids: string[], userId: string): Promise<RideSummary[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('group_rides').select(SUMMARY_FIELDS).in('id', ids);
  if (error) throw error;
  const rides = ((data ?? []) as unknown as Row[]).map((r) => toSummary(r, userId));
  return ids.map((id) => rides.find((r) => r.id === id)).filter((r): r is RideSummary => !!r);
}

export async function fetchRide(id: string, userId: string): Promise<RideDetails | null> {
  const { data, error } = await supabase.from('group_rides').select(DETAIL_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Row;
  return {
    ...toSummary(r, userId),
    description: r.description,
    start: { label: r.start_label, latitude: r.start_lat, longitude: r.start_lng },
    end: { label: r.end_label, latitude: r.end_lat, longitude: r.end_lng },
    waypoints: (r.waypoints ?? []).map((w) => ({ label: w.label, latitude: w.lat, longitude: w.lng })),
    route: r.route,
    participants: r.participants
      .filter((p) => p.profile)
      .map((p) => ({
        id: p.user_id,
        username: p.profile!.username,
        avatarUrl: photoUrl(p.profile!.avatar_path),
        status: p.status,
        role: p.role ?? null,
        checkedInAt: p.checked_in_at ?? null,
        pausedUntil: p.paused_until ?? null,
        passenger: p.passenger ?? null,
        passengerPartner: p.passenger_partner ?? null,
      }))
      // Organisateur en premier, puis les inscrits, puis les invités
      .sort((a, b) => Number(b.id === r.created_by) - Number(a.id === r.created_by) || b.status.localeCompare(a.status)),
    startedAt: r.started_at,
    endedAt: r.ended_at,
    convoyGapKm: r.convoy_gap_km ?? 2,
    regroup:
      r.regroup_lat != null && r.regroup_lng != null && r.regroup_at
        ? { label: r.regroup_label ?? 'Point de regroupement', latitude: r.regroup_lat, longitude: r.regroup_lng, at: r.regroup_at }
        : null,
  };
}

export type RideUnavailable = 'private' | 'missing' | 'error';

/** Balade non lisible : privée (existe mais réservée) ou supprimée / purgée après la fin */
export async function rideUnavailableReason(id: string): Promise<RideUnavailable> {
  const { data, error } = await supabase.rpc('ride_access', { p_ride: id });
  if (error) return 'error';
  return data === 'private' ? 'private' : data === 'ok' ? 'error' : 'missing';
}

export async function createRide(userId: string, d: RideDraft): Promise<string> {
  const { data, error } = await supabase
    .from('group_rides')
    .insert({
      created_by: userId,
      title: d.title.trim(),
      description: d.description.trim() || null,
      level: d.level,
      visibility: d.visibility,
      max_participants: d.maxParticipants,
      categories: d.categories,
      pace: d.pace,
      surface: d.surface,
      meeting_at: d.meetingAt.toISOString(),
      meeting_label: d.meeting.label,
      meeting_lat: d.meeting.latitude,
      meeting_lng: d.meeting.longitude,
      start_label: d.start.label,
      start_lat: d.start.latitude,
      start_lng: d.start.longitude,
      end_label: d.end.label,
      end_lat: d.end.latitude,
      end_lng: d.end.longitude,
      waypoints: d.waypoints.map((w) => ({ label: w.label, lat: w.latitude, lng: w.longitude })),
      route: d.route.points,
      distance_m: d.route.distanceM,
      duration_s: d.route.durationS,
      // Au nom d'un club : ses membres sont invités par le serveur
      club_id: d.clubId ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  // L'organisateur participe à sa balade
  const { error: joinError } = await supabase
    .from('group_ride_participants')
    .insert({ ride_id: data.id, user_id: userId, status: 'joined' });
  if (joinError) throw joinError;
  return data.id;
}

export async function joinRide(rideId: string, userId: string, invited: boolean) {
  const { error } = invited
    ? await supabase
        .from('group_ride_participants')
        .update({ status: 'joined' })
        .eq('ride_id', rideId)
        .eq('user_id', userId)
    : await supabase.from('group_ride_participants').insert({ ride_id: rideId, user_id: userId, status: 'joined' });
  if (error) throw new Error(error.message.includes('complète') ? 'Cette balade est complète.' : error.message);
}

export async function leaveRide(rideId: string, userId: string) {
  const { error } = await supabase.from('group_ride_participants').delete().eq('ride_id', rideId).eq('user_id', userId);
  if (error) throw error;
}

export async function inviteToRide(rideId: string, friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase
    .from('group_ride_participants')
    .upsert(
      friendIds.map((user_id) => ({ ride_id: rideId, user_id, status: 'invited' })),
      { onConflict: 'ride_id,user_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function startRide(rideId: string) {
  const { error } = await supabase.from('group_rides').update({ started_at: new Date().toISOString() }).eq('id', rideId);
  if (error) throw new Error(error.message);
}

export async function endRide(rideId: string) {
  const { error } = await supabase.from('group_rides').update({ ended_at: new Date().toISOString() }).eq('id', rideId);
  if (error) throw error;
}

export async function deleteRide(rideId: string) {
  const { error } = await supabase.from('group_rides').delete().eq('id', rideId);
  if (error) throw error;
}

/** L'organisateur donne un rôle (ouvreur / serre-file) à un inscrit, ou le retire (null). */
/** Convoi : écart toléré (organisateur) */
export async function setConvoyGap(rideId: string, km: number) {
  const { error } = await supabase.from('group_rides').update({ convoy_gap_km: km }).eq('id', rideId);
  if (error) throw new Error(error.message);
}

/** « Je fais une pause » (minutes) ou « Je repars » (0) : renvoie la fin de la pause */
export async function setRidePause(rideId: string, minutes: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_ride_pause', { p_ride: rideId, p_minutes: minutes });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Point de regroupement (ouvreur ou organisateur) : tout le groupe reçoit une notification ; null = retirer */
export async function setRegroupPoint(rideId: string, place: Place | null) {
  const { error } = await supabase.rpc('set_regroup_point', {
    p_ride: rideId,
    p_lat: place?.latitude ?? null,
    p_lng: place?.longitude ?? null,
    p_label: place?.label ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function setRideRole(rideId: string, userId: string, role: RideRole | null) {
  const { error } = await supabase.rpc('set_ride_role', { p_ride: rideId, p_user: userId, p_role: role });
  if (error) throw new Error(error.message);
}

/** Pointage au RDV : moi (userId absent) ou, pour l'organisateur, un inscrit. present = false : annule. */
export async function checkInRide(rideId: string, userId?: string, present = true) {
  const { error } = await supabase.rpc('ride_check_in', { p_ride: rideId, p_user: userId ?? null, p_present: present });
  if (error) throw new Error(error.message);
}

/** L'organisateur peut démarrer entre 2 h avant et 12 h après le RDV (même règle que le serveur). */
export function canStartNow(meetingAt: string) {
  const t = new Date(meetingAt).getTime();
  const now = Date.now();
  return now >= t - 2 * 3600 * 1000 && now <= t + 12 * 3600 * 1000;
}

export function formatRideDate(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** « 🏍️ J'ai une place passager » / « 🎒 Je cherche une place » (null = rien) */
export async function setRidePassenger(rideId: string, mode: PassengerMode | null) {
  const { error } = await supabase.rpc('set_ride_passenger', { p_ride: rideId, p_mode: mode });
  if (error) throw new Error(error.message);
}

/** Le pilote emmène ce motard (qui cherche une place) */
export async function pairRidePassenger(rideId: string, seekerId: string) {
  const { error } = await supabase.rpc('pair_ride_passenger', { p_ride: rideId, p_seeker: seekerId });
  if (error) throw new Error(error.message);
}

/** « 2 places passager dispo » */
export function passengerSeatsLabel(n: number) {
  return `${n} place${n > 1 ? 's' : ''} passager dispo`;
}
