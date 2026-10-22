import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { BadgesCard, useRiderStats } from '@/components/badges-card';
import { GoodPointsCard } from '@/components/good-points';
import { LinkGroup, LinkRow, LinkSeparator } from '@/components/link-row';
import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useCanUse } from '@/lib/features';
import { pickImage } from '@/lib/pick-image';
import { useSession } from '@/lib/session';
import { useTrips } from '@/lib/trips';
import { useFriends } from '@/lib/use-friends';
import { useProfileWall } from '@/lib/use-profile-wall';
import { deleteWallPhoto, setCoverPhoto, type WallPhoto } from '@/lib/wall';

export default function ProfileScreen() {
  const { scheme } = useTheme();
  const { session, profile, refreshProfile } = useSession();
  const userId = session?.user.id;
  const { state: friends } = useFriends();
  const { photos, stats, refresh } = useProfileWall(userId);
  const trips = useTrips();
  const riderStats = useRiderStats(userId);
  const garageOn = useCanUse('garage');
  // ?photo=<id> : depuis une notification (like ou commentaire sur ma photo)
  const { photo: openPhotoId } = useLocalSearchParams<{ photo?: string }>();

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
      onOpenHelp={() => router.push('/help')}
      openPhotoId={openPhotoId}
      badges={
        <>
          <BadgesCard userId={userId} stats={riderStats} onPress={() => router.push('/badges')} />
          <GoodPointsCard userId={userId} self onPress={() => router.push('/points')} />
        </>
      }
      actions={
        <>
          <Button title="Inviter des potes" icon="paper-plane-outline" onPress={() => router.push('/invite')} />
          <Button title="Modifier mon profil" variant="secondary" onPress={() => router.push('/profile-edit')} />
          <LinkGroup>
            <LinkRow icon="search" label="Rechercher des motards" onPress={() => router.push('/search')} />
            <LinkSeparator />
            <LinkRow
              icon="people"
              label="Amis"
              value={friends ? `${friends.friends.length}` : '…'}
              badge={pending > 0 ? `${pending} demande${pending > 1 ? 's' : ''}` : undefined}
              onPress={() => router.push('/friends')}
            />
            <LinkSeparator />
            <LinkRow icon="speedometer" label="Mes trajets" value={`${trips.length}`} onPress={() => router.push('/trips')} />
            <LinkSeparator />
            {garageOn && <LinkRow icon="construct" label="Garage et entretien" onPress={() => router.push('/garage')} />}
            {garageOn && <LinkSeparator />}
            <LinkRow icon="person-circle-outline" label="À propos · Qui est derrière l’appli" onPress={() => router.push('/about')} />
          </LinkGroup>
        </>
      }
    />
  );
}
