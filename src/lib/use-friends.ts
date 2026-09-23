import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchFriends, type FriendsState } from '@/lib/friends';
import { useSession } from '@/lib/session';

/** Amis et demandes de l'utilisateur, rechargés à chaque fois que l'écran est affiché. */
export function useFriends() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [loaded, setLoaded] = useState<{ userId: string; state: FriendsState } | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setLoaded({ userId, state: await fetchFriends(userId) });
      setError(false);
    } catch (e) {
      console.warn('Chargement des amis impossible', e);
      setError(true);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { state: loaded && loaded.userId === userId ? loaded.state : null, error, refresh, userId };
}
