import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { LinkGroup, LinkRow } from '@/components/link-row';
import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { pickImage } from '@/lib/pick-image';
import { useSession } from '@/lib/session';
import { useFriends } from '@/lib/use-friends';
import { useProfileWall } from '@/lib/use-profile-wall';
import { deleteWallPhoto, setCoverPhoto, type WallPhoto } from '@/lib/wall';

export default function ProfileScreen() {
  const { scheme } = useTheme();
  const { session, profile, refreshProfile } = useSession();
  const userId = session?.user.id;
  const { state: friends } = useFriends();
  const { photos, stats, refresh } = useProfileWall(userId);

  // Couverture sombre : barre d'état claire tant que l'onglet est affiché
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark');
    }, [scheme]),
  );

  if (!profile || !userId) return null;

  const addPhoto = async () => {
    const picked = await pickImage('Ajouter une photo', [1, 1]);
    if (picked) router.push({ pathname: '/photo/new', params: { uri: picked.uri, mimeType: picked.mimeType ?? '' } });
  };

  const deletePhoto = (photo: WallPhoto) =>
    Alert.alert('Supprimer la photo', 'Elle sera retirée de ton mur.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWallPhoto(photo);
            await refresh();
          } catch (e) {
            Alert.alert('Suppression impossible', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const editCover = async () => {
    const picked = await pickImage('Photo de couverture', [16, 9]);
    if (!picked) return;
    try {
      await setCoverPhoto(userId, picked, profile.cover_path);
      await refreshProfile();
    } catch (e) {
      Alert.alert('Couverture', e instanceof Error ? e.message : String(e));
    }
  };

  const pending = friends?.incoming.length ?? 0;

  return (
    <ProfileView
      profile={profile}
      stats={stats}
      photos={photos}
      underStatusBar
      onAddPhoto={addPhoto}
      onDeletePhoto={deletePhoto}
      onEditCover={editCover}
      onOpenSettings={() => router.push('/settings')}
      actions={
        <>
          <Button title="Modifier mon profil" variant="secondary" onPress={() => router.push('/profile-edit')} />
          <LinkGroup>
            <LinkRow
              icon="people"
              label="Amis"
              value={friends ? `${friends.friends.length}` : '…'}
              badge={pending > 0 ? `${pending} demande${pending > 1 ? 's' : ''}` : undefined}
              onPress={() => router.push('/friends')}
            />
          </LinkGroup>
        </>
      }
    />
  );
}
