import { useEffect, useRef, useState } from 'react';

import {
  clearMyPosition,
  fetchVisibleRiders,
  isInActiveGroupRide,
  publishPosition,
  type LivePositionInput,
  type LiveRider,
} from '@/lib/live-location';
import type { PrivacyMode } from '@/lib/privacy';

const PUBLISH_MIN_INTERVAL_MS = 10_000;
const PUBLISH_MIN_DISTANCE_M = 30;
const PUBLISH_MAX_INTERVAL_MS = 60_000;
const POLL_MS = 5_000;
const RIDE_CHECK_MS = 60_000;

/**
 * Envoie ma position (sauf en fantôme hors trajet de groupe) et récupère les
 * positions que Supabase m'autorise à voir.
 */
export function useLiveRiders(userId: string | undefined, me: LivePositionInput | null, mode: PrivacyMode | null) {
  const [riders, setRiders] = useState<LiveRider[]>([]);
  const lastPublish = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const ride = useRef<{ checkedAt: number; active: boolean } | null>(null);
  const cleared = useRef(false);

  // Envoi de ma position
  useEffect(() => {
    if (!userId || !me || !mode) return;
    let cancelled = false;

    (async () => {
      if (mode === 'ghost') {
        // En fantôme, on n'envoie que pendant un trajet de groupe en cours
        const now = Date.now();
        if (!ride.current || now - ride.current.checkedAt > RIDE_CHECK_MS) {
          ride.current = { checkedAt: now, active: await isInActiveGroupRide().catch(() => false) };
        }
        if (cancelled) return;
        if (!ride.current.active) {
          if (!cleared.current) {
            cleared.current = true;
            lastPublish.current = null;
            await clearMyPosition(userId).catch((e) => console.warn('Effacement de la position impossible', e));
          }
          return;
        }
      }
      cleared.current = false;

      const now = Date.now();
      const last = lastPublish.current;
      const moved = last ? approxDistanceM(last.lat, last.lng, me.latitude, me.longitude) : Infinity;
      const elapsed = last ? now - last.at : Infinity;
      const due = elapsed > PUBLISH_MAX_INTERVAL_MS || (elapsed > PUBLISH_MIN_INTERVAL_MS && moved > PUBLISH_MIN_DISTANCE_M);
      if (!due) return;
      lastPublish.current = { at: now, lat: me.latitude, lng: me.longitude };
      await publishPosition(userId, me).catch((e) => console.warn('Envoi de la position impossible', e));
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, me, mode]);

  // Réception des positions visibles
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const poll = () =>
      fetchVisibleRiders(userId)
        .then((r) => !cancelled && setRiders(r))
        .catch((e) => console.warn('Chargement des positions impossible', e));
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  return riders;
}

function approxDistanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const x = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * 111_320;
}
