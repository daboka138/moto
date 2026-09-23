import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { acceptFriendRequest, relationWith, removeFriendship, sendFriendRequest } from '@/lib/friends';
import { fetchProfile, type Profile } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';
import { useProfileWall } from '@/lib/use-profile-wall';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, refresh, userId } = useFriends();
  const [loaded, setLoaded] = useState<{ id: string; profile: Profile | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const { photos, stats, refresh: refreshWall } = useProfileWall(id);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(id)
      .then((profile) => !cancelled && setLoaded({ id, profile }))
      .catch(() => !cancelled && setLoaded({ id, profile: null }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const profile = loaded?.id === id ? loaded.profile : undefined;

  if (profile === undefined || !userId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (profile === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Profil introuvable.</Text>
      </View>
    );
  }

  const relation = relationWith(state, userId, profile.id);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await Promise.all([refresh(), refreshWall()]);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = () =>
    Alert.alert('Retirer des amis', `Retirer @${profile.username} de tes amis ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => run(() => removeFriendship(userId, profile.id)) },
    ]);

  const actions =
    relation === 'self' ? null : relation === 'friend' ? (
      <Button title="Amis ✓" variant="secondary" loading={busy} onPress={confirmRemove} />
    ) : relation === 'incoming' ? (
      <View style={styles.row}>
        <View style={styles.col}>
          <Button title="Refuser" variant="secondary" loading={busy} onPress={() => run(() => removeFriendship(userId, profile.id))} />
        </View>
        <View style={styles.col}>
          <Button title="Accepter" loading={busy} onPress={() => run(() => acceptFriendRequest(userId, profile.id))} />
        </View>
      </View>
    ) : relation === 'outgoing' ? (
      <Button title="Demande envoyée · Annuler" variant="secondary" loading={busy} onPress={() => run(() => removeFriendship(userId, profile.id))} />
    ) : (
      <Button title="Ajouter en ami" loading={busy} onPress={() => run(() => sendFriendRequest(userId, profile.id))} />
    );

  return (
    <>
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      <ProfileView profile={profile} stats={stats} photos={photos} actions={actions} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
});
