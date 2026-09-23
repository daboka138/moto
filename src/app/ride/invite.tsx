import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { Card } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { photoUrl } from '@/lib/profile';
import { fetchRide, inviteToRide } from '@/lib/rides';
import { useFriends } from '@/lib/use-friends';

/** L'organisateur invite des amis à sa balade. */
export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, userId } = useFriends();
  const [already, setAlready] = useState<{ id: string; ids: string[] } | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchRide(id, userId)
      .then((ride) => !cancelled && setAlready({ id, ids: ride?.participants.map((p) => p.id) ?? [] }))
      .catch(() => !cancelled && setAlready({ id, ids: [] }));
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  const excluded = already?.id === id ? already.ids : null;
  const friends = state && excluded ? state.friends.filter((f) => !excluded.includes(f.id)) : null;

  const toggle = (fid: string) => setChecked((c) => (c.includes(fid) ? c.filter((x) => x !== fid) : [...c, fid]));

  const send = async () => {
    setSaving(true);
    try {
      await inviteToRide(id, checked);
      router.back();
    } catch (e) {
      Alert.alert('Invitation impossible', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title="Mes amis">
        {friends === null ? (
          <ActivityIndicator color={Colors.accent} />
        ) : friends.length === 0 ? (
          <Text style={styles.muted}>Tous tes amis sont déjà invités, ou tu n’as pas encore d’amis.</Text>
        ) : (
          friends.map((f) => (
            <PersonRow
              key={f.id}
              photoUrl={photoUrl(f.avatar_path)}
              title={`@${f.username}`}
              subtitle={`${f.first_name} ${f.last_name}`}
              onPress={() => toggle(f.id)}
              right={
                <Ionicons
                  name={checked.includes(f.id) ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={checked.includes(f.id) ? Colors.accent : Colors.textMuted}
                />
              }
            />
          ))
        )}
      </Card>
      <Button
        title={checked.length ? `Inviter ${checked.length} ami${checked.length > 1 ? 's' : ''}` : 'Inviter'}
        onPress={send}
        loading={saving}
        disabled={!checked.length}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  muted: { color: Colors.textMuted },
});
