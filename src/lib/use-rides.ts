import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchUpcomingRides, type RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';

/** Balades à venir visibles par l'utilisateur, rechargées à chaque affichage de l'écran. */
export function useUpcomingRides() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [loaded, setLoaded] = useState<{ userId: string; rides: RideSummary[] } | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      setLoaded({ userId, rides: await fetchUpcomingRides(userId) });
      setError(false);
    } catch (e) {
      console.warn('Chargement des balades impossible', e);
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

  return { rides: loaded && loaded.userId === userId ? loaded.rides : null, error, refreshing, refresh };
}
