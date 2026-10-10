import { useEffect, useRef, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import type { LiveRider } from '@/lib/live-location';
import {
  canStartNow,
  checkInRide,
  fetchRide,
  RIDE_ROLES,
  type RideDetails,
  type RideParticipant,
  type RideSummary,
} from '@/lib/rides';
import { speak } from '@/lib/voice';

// Mode convoi pendant une balade en cours : chaque participant est suivi (positions visibles
// grâce à la balade, règle can_view_location côté serveur). Un motard qui décroche (trop loin
// du groupe, ou arrêté alors que le groupe roule) est signalé ; l'organisateur, l'ouvreur et le
// serre-file reçoivent une alerte vocale. Le jour J, check-in automatique en arrivant au RDV.

export type ConvoyState = 'ok' | 'stopped' | 'far' | 'lost';

export type ConvoyMember = RideParticipant & {
  isMe: boolean;
  position: LatLng | null;
  state: ConvoyState;
  /** « arrêté depuis 4 min », « à 2,1 km du groupe »… */
  detail: string;
};

export type Convoy = {
  ride: RideDetails;
  members: ConvoyMember[];
  /** Je reçois les alertes (organisateur, ouvreur ou serre-file) */
  watcher: boolean;
  /** Motards qui ont décroché (hors moi) */
  dropped: ConvoyMember[];
};

/** Plus loin que ça du motard le plus proche : décroché */
const FAR_M = 1500;
/** Immobile depuis 3 min alors que d'autres roulent : décroché */
const STOPPED_MS = 3 * 60_000;
/** Bouger de moins de 80 m = rester sur place (bruit GPS, parking) */
const ANCHOR_M = 80;
/** Pas de position depuis 3 min : signal perdu (app fermée, plus de réseau) */
const LOST_MS = 3 * 60_000;
/** Un motard qui a bougé dans la dernière minute est « en route » */
const MOVING_MS = 60_000;
const TICK_MS = 5_000;
const RIDE_REFRESH_MS = 30_000;
/** Check-in automatique : à moins de 150 m du RDV, d'1 h avant à 1 h après */
const AUTO_CHECKIN_M = 150;
const AUTO_CHECKIN_WINDOW_MS = 3600_000;

type Anchor = LatLng & { at: number };

function km(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** État de chaque participant (fonction pure, testable) */
export function analyzeConvoy(
  participants: (RideParticipant & { isMe: boolean; position: LatLng | null; updatedAt: number | null })[],
  anchors: Map<string, Anchor>,
  now: number,
): ConvoyMember[] {
  const fresh = participants.filter((p) => p.position && p.updatedAt !== null && now - p.updatedAt < LOST_MS);
  // Mise à jour des points d'immobilité
  for (const p of fresh) {
    const a = anchors.get(p.id);
    if (!a || distanceM(a, p.position!) > ANCHOR_M) anchors.set(p.id, { ...p.position!, at: now });
  }
  const moving = (id: string) => {
    const a = anchors.get(id);
    return !!a && now - a.at < MOVING_MS;
  };

  return participants.map(({ updatedAt, ...p }) => {
    if (!p.position || updatedAt === null) return { ...p, state: 'lost' as const, detail: 'pas de position' };
    if (now - updatedAt >= LOST_MS) {
      return { ...p, state: 'lost' as const, detail: `signal perdu depuis ${Math.round((now - updatedAt) / 60_000)} min` };
    }
    const others = fresh.filter((o) => o.id !== p.id);
    if (!others.length) return { ...p, state: 'ok' as const, detail: '' };
    const nearest = Math.min(...others.map((o) => distanceM(o.position!, p.position!)));
    const anchor = anchors.get(p.id);
    const stoppedMs = anchor ? now - anchor.at : 0;
    // Arrêté pendant que d'autres roulent plus loin (une pause de tout le groupe n'alerte pas)
    const groupLeft = others.some((o) => moving(o.id) && distanceM(o.position!, p.position!) > 300);
    if (stoppedMs >= STOPPED_MS && groupLeft) {
      return { ...p, state: 'stopped' as const, detail: `arrêté depuis ${Math.floor(stoppedMs / 60_000)} min` };
    }
    if (nearest > FAR_M) return { ...p, state: 'far' as const, detail: `à ${km(nearest)} du groupe` };
    return { ...p, state: 'ok' as const, detail: '' };
  });
}

export function roleLabel(p: Pick<RideParticipant, 'role'>) {
  return p.role ? `${RIDE_ROLES[p.role].emoji} ${RIDE_ROLES[p.role].label}` : null;
}

/**
 * Balade du jour à laquelle je participe : détails rechargés toutes les 30 s, check-in
 * automatique au RDV, puis suivi du convoi quand elle est en cours.
 */
export function useConvoy({
  rides,
  userId,
  liveRiders,
  me,
  onCheckIn,
}: {
  rides: RideSummary[] | null;
  userId: string | undefined;
  liveRiders: LiveRider[];
  me: LatLng | null;
  onCheckIn?: (ride: RideDetails) => void;
}): Convoy | null {
  // Balade du jour (en cours d'abord) où je suis inscrit
  const today = (rides ?? [])
    .filter((r) => r.joined && r.status !== 'ended' && (r.status === 'live' || canStartNow(r.meetingAt)))
    .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live'))[0];
  const rideId = today?.id ?? null;

  const [ride, setRide] = useState<RideDetails | null>(null);
  const [members, setMembers] = useState<ConvoyMember[]>([]);
  const anchors = useRef(new Map<string, Anchor>());
  const alerted = useRef(new Set<string>());
  const checkedIn = useRef(new Set<string>());
  const inputs = useRef({ liveRiders, me, ride, onCheckIn });

  useEffect(() => {
    inputs.current = { liveRiders, me, ride, onCheckIn };
  });

  // Détails de la balade (statut, inscrits, rôles, pointages)
  useEffect(() => {
    if (!rideId || !userId) return;
    let cancelled = false;
    const load = () =>
      fetchRide(rideId, userId)
        .then((r) => !cancelled && setRide(r))
        .catch((e) => console.warn('Convoi : chargement de la balade impossible', e));
    load();
    const timer = setInterval(load, RIDE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [rideId, userId]);

  // Suivi toutes les 5 s
  useEffect(() => {
    if (!rideId || !userId) return;
    const tick = () => {
      const { liveRiders: riders, me: myPos, ride: r, onCheckIn: notify } = inputs.current;
      if (!r || r.id !== rideId) return;
      const now = Date.now();
      const mine = r.participants.find((p) => p.id === userId);

      // Check-in automatique en arrivant au RDV
      if (
        myPos &&
        mine?.status === 'joined' &&
        !mine.checkedInAt &&
        !checkedIn.current.has(r.id) &&
        Math.abs(now - new Date(r.meetingAt).getTime()) < AUTO_CHECKIN_WINDOW_MS &&
        distanceM(myPos, r.meeting) < AUTO_CHECKIN_M
      ) {
        checkedIn.current.add(r.id);
        checkInRide(r.id)
          .then(() => {
            setRide({ ...r, participants: r.participants.map((p) => (p.id === userId ? { ...p, checkedInAt: new Date().toISOString() } : p)) });
            notify?.(r);
          })
          .catch((e) => console.warn('Check-in automatique impossible', e));
      }

      if (r.status !== 'live') {
        setMembers([]);
        return;
      }
      const joined = r.participants.filter((p) => p.status === 'joined');
      const next = analyzeConvoy(
        joined.map((p) => {
          if (p.id === userId) return { ...p, isMe: true, position: myPos, updatedAt: myPos ? now : null };
          const live = riders.find((x) => x.userId === p.id);
          return {
            ...p,
            isMe: false,
            position: live ? { latitude: live.latitude, longitude: live.longitude } : null,
            updatedAt: live ? new Date(live.updatedAt).getTime() : null,
          };
        }),
        anchors.current,
        now,
      );
      setMembers(next);

      // Alerte vocale (une fois par décrochage) pour l'organisateur, l'ouvreur et le serre-file
      const watcher = r.organizer.id === userId || !!mine?.role;
      for (const m of next) {
        const out = !m.isMe && (m.state === 'stopped' || m.state === 'far');
        if (!out) {
          alerted.current.delete(m.id);
          continue;
        }
        if (alerted.current.has(m.id)) continue;
        alerted.current.add(m.id);
        if (watcher) {
          speak(
            m.state === 'stopped'
              ? `Convoi : ${m.username} est arrêté depuis plus de 3 minutes`
              : `Convoi : ${m.username} a décroché du groupe`,
            true,
            'info',
          );
        }
      }
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [rideId, userId]);

  if (!ride || ride.id !== rideId || !userId) return null;
  const mine = ride.participants.find((p) => p.id === userId);
  return {
    ride,
    members: ride.status === 'live' ? members : [],
    watcher: ride.organizer.id === userId || !!mine?.role,
    dropped: members.filter((m) => !m.isMe && (m.state === 'stopped' || m.state === 'far')),
  };
}
