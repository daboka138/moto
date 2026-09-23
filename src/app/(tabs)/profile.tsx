import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { DemoToggle } from '@/demo/demo-toggle'; // DEMO
import { signOut } from '@/lib/auth';
import { pickImage } from '@/lib/pick-image';
import { privacyLabel } from '@/lib/privacy';
import { usePrivacy } from '@/lib/privacy-context';
import { useSession } from '@/lib/session';
import { useFriends } from '@/lib/use-friends';
import { useProfileWall } from '@/lib/use-profile-wall';
import { deleteWallPhoto, setCoverPhoto, type WallPhoto } from '@/lib/wall';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useSession();
  const userId = session?.user.id;
  const { state: friends } = useFriends();
  const { settings } = usePrivacy();
  const { photos, stats, refresh } = useProfileWall(userId);

  // Couverture sombre : barre d'état claire tant que l'onglet est affiché
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
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

  const confirmSignOut = () =>
    Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut() },
    ]);

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
      actions={
        <>
          <Button title="Modifier mon profil" variant="secondary" onPress={() => router.push('/profile-edit')} />
          <View style={styles.links}>
            <LinkRow
              icon="people"
              label="Amis"
              value={friends ? `${friends.friends.length}` : '…'}
              badge={pending > 0 ? `${pending} demande${pending > 1 ? 's' : ''}` : undefined}
              href="/friends"
            />
            <View style={styles.separator} />
            <LinkRow
              icon={settings?.mode === 'ghost' ? 'eye-off' : 'location'}
              label="Ma position"
              value={settings ? privacyLabel(settings.mode) : '…'}
              href="/privacy"
            />
          </View>
        </>
      }
      footer={
        <>
          <DemoToggle /* DEMO */ />
          <Button title="Se déconnecter" variant="ghost" onPress={confirmSignOut} />
        </>
      }
    />
  );
}

function LinkRow({
  icon,
  label,
  value,
  badge,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  badge?: string;
  href: Href;
}) {
  return (
    <Pressable style={styles.link} onPress={() => router.push(href)}>
      <Ionicons name={icon} size={22} color={Colors.accent} />
      <Text style={styles.linkLabel}>{label}</Text>
      {badge && <Text style={styles.badge}>{badge}</Text>}
      <Text style={styles.linkValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  links: { backgroundColor: Colors.surface, borderRadius: 18, paddingHorizontal: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  linkLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text },
  linkValue: { fontSize: 15, color: Colors.textMuted },
  badge: {
    backgroundColor: Colors.accent,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: Colors.border },
});
