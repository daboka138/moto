import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { fetchProfileStats, fetchWallPhotos, type ProfileStats, type WallPhoto } from '@/lib/wall';

/** Photos du mur et compteurs d'un profil, rechargés à chaque affichage de l'écran. */
export function useProfileWall(userId: string | undefined) {
  const [loaded, setLoaded] = useState<{ userId: string; photos: WallPhoto[]; stats: ProfileStats | null } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [photos, stats] = await Promise.all([
        fetchWallPhotos(userId),
        fetchProfileStats(userId).catch(() => null),
      ]);
      setLoaded({ userId, photos, stats });
    } catch (e) {
      console.warn('Chargement du mur impossible', e);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const current = loaded && loaded.userId === userId ? loaded : null;
  return { photos: current?.photos ?? null, stats: current?.stats ?? null, refresh };
}
