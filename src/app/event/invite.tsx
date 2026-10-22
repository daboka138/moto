import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { Card } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { fetchEvent, fetchMyEventInvites, inviteToEvent } from '@/lib/events';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

/** Inviter des amis à un événement (ils reçoivent une notification avec Accepter / Refuser). */
export default function EventInviteScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, userId } = useFriends();
  const [already, setAlready] = useState<{ id: string; ids: string[] } | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([fetchEvent(id, userId), fetchMyEventInvites(id)])
      .then(([event, invited]) => !cancelled && setAlready({ id, ids: [...(event?.attendees.map((a) => a.id) ?? []), ...invited] }))
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
      await inviteToEvent(id, checked);
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
          <Text style={styles.muted}>Tous tes amis sont déjà invités ou inscrits, ou tu n’as pas encore d’amis.</Text>
        ) : (
          friends.map((f) => (
            <PersonRow
              key={f.id}
              photoUrl={photoUrl(f.avatar_path)}
              userId={f.id}
              username={f.username}
              subtitle={f.city}
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

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  muted: { color: Colors.textMuted },
}));
