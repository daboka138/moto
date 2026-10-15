import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import { fetchUpcomingEvents, type MotoEvent } from '@/lib/events';
import { fetchPlacesAround, type CommunityPlace } from '@/lib/places';
import { useSession } from '@/lib/session';

/** Rechargement des lieux quand la carte s'éloigne de plus de 20 km du dernier chargement */
const RELOAD_M = 20_000;

/** Lieux motards autour d'un point, rechargés à chaque affichage de l'écran */
export function useCommunityPlaces(center: LatLng | null) {
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

  return { places, error, refresh };
}

/** Événements à venir */
export function useEvents() {
  const { session } = useSession();
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

  return { events, error, refreshing, refresh };
}
