import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { makeStyles, useColors } from '@/constants/theme';
import { openDirectConversation } from '@/lib/messages';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';
// DEMO
import { useDemoMode } from '@/demo/demo-context';
import { useDemoMessages } from '@/demo/messages';
import { DEMO_RIDERS } from '@/demo/riders';

type Friend = { id: string; username: string; avatarUrl: string; isDemo?: boolean };

/** Choix d'un ami pour démarrer une conversation. */
export default function NewMessageScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { state, error } = useFriends();
  const demo = useDemoMode();
  const demoMessages = useDemoMessages();
  const [opening, setOpening] = useState<string | null>(null);

  const friends: Friend[] = [
    ...(state?.friends ?? []).map((f) => ({ id: f.id, username: f.username, avatarUrl: photoUrl(f.avatar_path) })),
    ...(demo.enabled
      ? DEMO_RIDERS.filter((r) => demo.friendIds.includes(r.id)).map((r) => ({
          id: r.id,
          username: r.username,
          avatarUrl: r.avatar_path,
          isDemo: true,
        }))
      : []),
  ].sort((a, b) => a.username.localeCompare(b.username));

  const open = async (f: Friend) => {
    if (f.isDemo) {
      router.replace({ pathname: '/chat/[id]', params: { id: demoMessages.openDirect(f.id) } });
      return;
    }
    setOpening(f.id);
    try {
      const id = await openDirectConversation(f.id);
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Conversation impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(null);
    }
  };

  if (!state && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={friends}
      keyExtractor={(f) => f.id}
      ListHeaderComponent={<Text style={styles.hint}>Tu peux écrire à tes amis.</Text>}
      renderItem={({ item }) => (
        <PersonRow
          photoUrl={item.avatarUrl}
          title={`@${item.username}`}
          onPress={() => open(item)}
          right={opening === item.id ? <ActivityIndicator color={Colors.accent} /> : undefined}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.muted}>
          {error ? 'Impossible de charger tes amis.' : 'Tu n’as pas encore d’amis. Ajoute des motards depuis le Mur.'}
        </Text>
      }
    />
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  hint: { color: Colors.textMuted, marginBottom: 8 },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
}));
