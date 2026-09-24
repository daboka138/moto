import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { acceptFriendRequest, relationWith, removeFriendship, sendFriendRequest } from '@/lib/friends';
import { openDirectConversation } from '@/lib/messages';
import { askBlock, askReport, fetchBlockedIds, unblockUser } from '@/lib/moderation';
import { fetchProfile, type Profile } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';
import { useProfileWall } from '@/lib/use-profile-wall';

export default function UserProfileScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, refresh, userId } = useFriends();
  const [loaded, setLoaded] = useState<{ id: string; profile: Profile | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const { photos, stats, refresh: refreshWall } = useProfileWall(id);
  const [blocked, setBlocked] = useState<{ id: string; value: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile(id)
      .then((profile) => !cancelled && setLoaded({ id, profile }))
      .catch(() => !cancelled && setLoaded({ id, profile: null }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchBlockedIds(userId)
      .then((ids) => !cancelled && setBlocked({ id, value: ids.includes(id) }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

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

  const isBlocked = blocked?.id === id && blocked.value;

  const message = () =>
    run(async () => {
      const conversationId = await openDirectConversation(profile.id);
      router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
    });

  const unblock = () =>
    run(async () => {
      await unblockUser(userId, profile.id);
      setBlocked({ id, value: false });
    });

  const menu = () =>
    showActionSheet({
      options: [
        { label: 'Signaler ce motard', onPress: () => askReport('user', profile.id) },
        isBlocked
          ? { label: `Débloquer @${profile.username}`, onPress: unblock }
          : {
              label: `Bloquer @${profile.username}`,
              destructive: true,
              onPress: () =>
                askBlock(userId, profile, () => {
                  setBlocked({ id, value: true });
                  refresh();
                }),
            },
      ],
    });

  const friendActions =
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

  const actions =
    relation === 'self' ? null : isBlocked ? (
      <>
        <Text style={styles.blocked}>Tu as bloqué ce motard.</Text>
        <Button title="Débloquer" variant="secondary" loading={busy} onPress={unblock} />
      </>
    ) : (
      <>
        {friendActions}
        <Button title="Message" variant="secondary" loading={busy} onPress={message} />
      </>
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: `@${profile.username}`,
          headerRight:
            relation === 'self'
              ? undefined
              : () => (
                  <Pressable onPress={menu} hitSlop={12}>
                    <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
                  </Pressable>
                ),
        }}
      />
      <ProfileView profile={profile} stats={stats} photos={photos} actions={actions} />
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  blocked: { color: Colors.textMuted, textAlign: 'center' },
}));
