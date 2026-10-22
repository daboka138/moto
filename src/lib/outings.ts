import { useSyncExternalStore } from 'react';
import { trackUsage } from '@/lib/usage';
import { Alert, Linking, Platform, Share } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';
import { simplifyTrack } from '@/lib/gpx';
import { fetchRide } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { readTrack, type TripSummary } from '@/lib/trips';

// Récap de sortie (« Ta sortie ») : navigation, boucle ou balade de plus de 5 km.
// Partage = lien https://passeryder.fr/s/ID (page du site qui dessine aussi l'image story
// 1080×1920 ou carrée : l'app n'a pas de module natif de capture d'écran ni de partage de
// fichier, tout passe par un lien et l'API Share). Le tracé envoyé est simplifié et, par défaut,
// coupé de 500 m au départ et à l'arrivée (domicile). JAMAIS de vitesse (ni max ni moyenne).

export const OUTING_MIN_KM = 5;
/** Départ et arrivée masqués : 500 m coupés de chaque côté */
const HIDDEN_ENDS_M = 500;
const MAX_TRACK_POINTS = 400;

export type OutingKind = 'trip' | 'loop' | 'ride';

export type OutingDraft = {
  source: string;
  kind: OutingKind;
  title: string;
  startedAt: string;
  distanceM: number;
  durationS: number;
  participants: number | null;
  participantNames: string[];
  track: LatLng[];
};

export const outingUrl = (id: string, format?: 'story' | 'square') =>
  `https://passeryder.fr/s/${id}${format ? `?format=${format}` : ''}`;

/** Coupe les premiers et derniers mètres (domicile) ; garde au moins le milieu du tracé */
export function trimEnds(track: LatLng[], meters = HIDDEN_ENDS_M): LatLng[] {
  if (track.length < 3) return track;
  const cumul = [0];
  for (let i = 1; i < track.length; i++) cumul.push(cumul[i - 1] + distanceM(track[i - 1], track[i]));
  const total = cumul[cumul.length - 1];
  // Trajet court : on garde le tiers du milieu
  const cut = total > meters * 3 ? meters : total / 3;
  const kept = track.filter((_, i) => cumul[i] >= cut && cumul[i] <= total - cut);
  return kept.length >= 2 ? kept : track.slice(Math.floor(track.length / 3), Math.ceil((track.length * 2) / 3) + 1);
}

/** Dénivelé positif (m) via l'API d'altitude Open-Meteo (sans clé) ; null si indisponible */
export async function elevationGain(track: LatLng[]): Promise<number | null> {
  if (track.length < 2) return null;
  const n = Math.min(100, track.length);
  const sample = Array.from({ length: n }, (_, i) => track[Math.round((i * (track.length - 1)) / (n - 1))]);
  try {
    const url =
      'https://api.open-meteo.com/v1/elevation?latitude=' +
      sample.map((p) => p.latitude.toFixed(4)).join(',') +
      '&longitude=' +
      sample.map((p) => p.longitude.toFixed(4)).join(',');
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    const e = json.elevation;
    if (!e || e.length < 2) return null;
    let gain = 0;
    for (let i = 1; i < e.length; i++) if (e[i] > e[i - 1]) gain += e[i] - e[i - 1];
    return Math.round(gain);
  } catch {
    return null;
  }
}

/** Sortie à partir d'un trajet de « Mes trajets » (trace gardée sur le téléphone) */
export function outingFromTrip(trip: TripSummary): OutingDraft | null {
  const track = readTrack(trip.id);
  if (!track || track.length < 2) return null;
  const loop = trip.destination.startsWith('Fin de « Boucle');
  return {
    source: `trip:${trip.id}`,
    kind: loop ? 'loop' : 'trip',
    title: loop ? 'Ma boucle à moto' : `Vers ${trip.destination}`.slice(0, 100),
    startedAt: trip.startedAt,
    distanceM: trip.distanceM,
    durationS: trip.durationS,
    participants: null,
    participantNames: [],
    track: track.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
  };
}

/** Sortie à partir d'une balade (tracé prévu, inscrits, heures de départ / fin) */
export async function outingFromRide(rideId: string, userId: string): Promise<OutingDraft | null> {
  const ride = await fetchRide(rideId, userId).catch(() => null);
  // Balade déjà supprimée (1 h après la fin) : récap gardé 7 jours par le serveur
  if (!ride) return fetchSavedOuting(`ride:${rideId}`);
  if (!ride.route || ride.route.length < 2) return null;
  const joined = ride.participants.filter((p) => p.status === 'joined');
  const started = ride.startedAt ?? ride.meetingAt;
  const durationS =
    ride.startedAt && ride.endedAt
      ? Math.max(0, (new Date(ride.endedAt).getTime() - new Date(ride.startedAt).getTime()) / 1000)
      : (ride.durationS ?? 0);
  return {
    source: `ride:${ride.id}`,
    kind: 'ride',
    title: ride.title,
    startedAt: started,
    distanceM: ride.distanceM ?? 0,
    durationS: Math.round(durationS),
    participants: joined.length,
    participantNames: joined.map((p) => p.username),
    track: ride.route.map(([latitude, longitude]) => ({ latitude, longitude })),
  };
}

export type OutingExtras = { hideEnds: boolean; elevationGainM: number | null; points: number | null; badges: string[] };

/** Envoie (ou met à jour) le récap et renvoie son identifiant public */
export async function saveOuting(userId: string, d: OutingDraft, x: OutingExtras): Promise<string> {
  const shown = x.hideEnds ? trimEnds(d.track) : d.track;
  const track = simplifyTrack(shown, MAX_TRACK_POINTS).map((p) => [Number(p.latitude.toFixed(5)), Number(p.longitude.toFixed(5))]);
  const { data, error } = await supabase
    .from('outings')
    .upsert(
      {
        owner_id: userId,
        source: d.source,
        kind: d.kind,
        title: d.title.slice(0, 100) || 'Ma sortie',
        started_at: d.startedAt,
        distance_m: Math.round(d.distanceM),
        duration_s: Math.round(d.durationS),
        elevation_gain_m: x.elevationGainM,
        participants: d.participants,
        points: x.points,
        badges: x.badges.slice(0, 6),
        track,
        hide_ends: x.hideEnds,
      },
      { onConflict: 'owner_id,source' },
    )
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export function outingMessage(d: OutingDraft) {
  const km = (d.distanceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const what = d.kind === 'ride' ? `Balade « ${d.title} »` : d.kind === 'loop' ? 'Boucle' : 'Sortie';
  return `${what} : ${km} km à moto avec PasseRyder 🏍️`;
}

export async function shareOutingLink(id: string, d: OutingDraft) {
  const url = outingUrl(id);
  trackUsage('outing_share');
  const message = `${outingMessage(d)}\n${url}`;
  try {
    if (Platform.OS === 'web' && !navigator.share) {
      await navigator.clipboard.writeText(url);
      Alert.alert('Lien copié', url);
      return;
    }
    await Share.share(Platform.OS === 'web' ? { title: d.title, message, url } : { title: d.title, message });
  } catch (e) {
    console.warn('Partage impossible', e);
  }
}

/** Image story / carrée : dessinée par la page du site, qui propose « Partager l'image » ou « Télécharger » */
export function openOutingImage(id: string, format: 'story' | 'square') {
  const url = outingUrl(id, format);
  if (Platform.OS === 'web') window.open(url, '_blank');
  else Linking.openURL(url);
}

// ---------- Récaps de balades gardés 7 jours par le serveur ----------

type OutingRow = {
  source: string;
  kind: OutingKind;
  title: string;
  started_at: string;
  distance_m: number;
  duration_s: number;
  participants: number | null;
  track: [number, number][];
};

const toDraft = (r: OutingRow): OutingDraft => ({
  source: r.source,
  kind: r.kind,
  title: r.title,
  startedAt: r.started_at,
  distanceM: r.distance_m,
  durationS: r.duration_s,
  participants: r.participants,
  participantNames: [],
  track: r.track.map(([latitude, longitude]) => ({ latitude, longitude })),
});

const OUTING_FIELDS = 'source, kind, title, started_at, distance_m, duration_s, participants, track';

export async function fetchSavedOuting(source: string): Promise<OutingDraft | null> {
  const { data, error } = await supabase.from('outings').select(OUTING_FIELDS).eq('source', source).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDraft(data as OutingRow) : null;
}

/** Mes balades des 7 derniers jours (Mes trajets) */
export async function fetchRecentRideOutings(): Promise<(OutingDraft & { rideId: string })[]> {
  const { data, error } = await supabase
    .from('outings')
    .select(OUTING_FIELDS)
    .eq('kind', 'ride')
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as OutingRow[]).map((r) => ({ ...toDraft(r), rideId: r.source.replace(/^ride:/, '') }));
}

// ---------- Points et badges gagnés à la fin d'une navigation (pour « Ta sortie ») ----------

type Reward = { points: number; badges: string[] };
let rewards: Record<string, Reward> = {};
const listeners = new Set<() => void>();

export function setTripReward(tripId: string, reward: Reward) {
  rewards = { ...rewards, [tripId]: reward };
  listeners.forEach((l) => l());
}

export function useTripReward(tripId: string | undefined) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => (tripId ? (rewards[tripId] ?? null) : null),
  );
}
