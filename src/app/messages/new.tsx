import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { openDirectConversation } from '@/lib/messages';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

type Friend = { id: string; username: string; avatarUrl: string };

/** Choix d'un ami pour démarrer une conversation. */
export default function NewMessageScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { state, error } = useFriends();
  const [opening, setOpening] = useState<string | null>(null);

  const friends: Friend[] = (state?.friends ?? [])
    .map((f) => ({ id: f.id, username: f.username, avatarUrl: photoUrl(f.avatar_path) }))
    .sort((a, b) => a.username.localeCompare(b.username));

  const open = async (f: Friend) => {
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
        error ? (
          <Text style={styles.muted}>Impossible de charger tes amis.</Text>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.muted}>Tu n’as pas encore d’amis à qui écrire. Invite tes potes ou trouve des motards près de chez toi.</Text>
            <Button title="Ajouter des amis" onPress={() => router.replace('/friends')} />
            <Button title="Trouver des motards" variant="secondary" onPress={() => router.replace('/riders')} />
          </View>
        )
      }
    />
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  list: { padding: 16, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  hint: { color: Colors.textMuted, marginBottom: 8 },
  empty: { gap: 10, paddingTop: 16 },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
}));
