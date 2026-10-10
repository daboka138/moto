import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { demoEvents, demoPlaces } from '@/demo/community';
import { useDemoMode } from '@/demo/demo-context';
import { distanceM, type LatLng } from '@/lib/geo';
import { fetchUpcomingEvents, type MotoEvent } from '@/lib/events';
import { fetchPlacesAround, type CommunityPlace } from '@/lib/places';
import { photoUrl } from '@/lib/profile';
import { useSession } from '@/lib/session';

/** Rechargement des lieux quand la carte s'éloigne de plus de 20 km du dernier chargement */
const RELOAD_M = 20_000;

/** Lieux motards autour d'un point (réels + démo), rechargés à chaque affichage de l'écran */
export function useCommunityPlaces(center: LatLng | null) {
  const demo = useDemoMode();
  const [places, setPlaces] = useState<CommunityPlace[] | null>(null);
  const [error, setError] = useState(false);
  const [loadedAt, setLoadedAt] = useState<LatLng | null>(null);
  const centerRef = useRef(center);
  useEffect(() => {
    centerRef.current = center;
  });

  const refresh = useCallback(async () => {
    const c = centerRef.current;
    if (!c) return;
    setLoadedAt(c);
    try {
      setPlaces(await fetchPlacesAround(c));
      setError(false);
    } catch (e) {
      console.warn('Lieux indisponibles', e);
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const far = !!center && (!loadedAt || distanceM(loadedAt, center) > RELOAD_M);
  useEffect(() => {
    if (far) refresh();
  }, [far, refresh]);

  const all = places || demo.enabled ? [...(places ?? []), ...(demo.enabled ? demoPlaces() : [])] : null;
  return { places: all, error, refresh };
}

/** Événements à venir (réels + démo) */
export function useEvents() {
  const demo = useDemoMode();
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const [events, setEvents] = useState<MotoEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      setEvents(await fetchUpcomingEvents(userId));
      setError(false);
    } catch (e) {
      console.warn('Événements indisponibles', e);
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const me = { id: userId ?? 'me', username: profile?.username ?? 'moi', avatarUrl: profile ? photoUrl(profile.avatar_path) : '' };
  const all =
    events || demo.enabled
      ? [...(events ?? []), ...(demo.enabled ? demoEvents(demo.eventStatus, me) : [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      : null;
  return { events: all, error, refreshing, refresh };
}
