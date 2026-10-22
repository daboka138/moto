import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { fetchPendingEvents, reviewEvent, type PendingEvent } from '@/lib/admin';
import { eventKindInfo, formatEventDates, type EventKind } from '@/lib/events';
import { photoUrl } from '@/lib/profile';

/**
 * Console › Agenda : événements publics proposés par des membres sans événement validé.
 * Valider = visible par tous ; refuser = visible du créateur seulement (prévenu, avec le mot).
 */
export function AgendaAdmin() {
  const Colors = useColors();
  const styles = useStyles();
  const [list, setList] = useState<PendingEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPendingEvents()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(load, [load]);

  const decide = async (e: PendingEvent, approve: boolean) => {
    setBusy(e.id);
    try {
      await reviewEvent(e.id, approve, notes[e.id]);
      setList((l) => l?.filter((x) => x.id !== e.id) ?? null);
    } catch (err) {
      Alert.alert('Oups', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Text style={styles.muted}>{error}</Text>;
  if (!list) return <ActivityIndicator color={Colors.accent} />;

  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.muted}>
        Événements publics à valider. Un membre dont un événement est validé publie ensuite directement. En attendant, ses amis,
        les invités et les membres du club le voient déjà.
      </Text>
      {list.length === 0 && <Text style={styles.empty}>Rien à valider.</Text>}
      {list.map((e) => {
        const kind = eventKindInfo(e.kind as EventKind);
        return (
          <View key={e.id} style={styles.card}>
            {e.photoPath && <Image source={{ uri: photoUrl(e.photoPath) }} style={styles.photo} contentFit="cover" />}
            <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}>
              <Text style={styles.title}>
                {kind?.emoji} {e.title}
              </Text>
            </Pressable>
            <Text style={styles.meta}>
              {kind?.label} · {formatEventDates({ startsAt: e.startsAt, endsAt: e.endsAt })} · {e.placeLabel}
            </Text>
            <Text style={styles.meta}>
              Par @{e.username}
              {e.organizerLabel ? ` pour ${e.organizerLabel}` : ''} · {e.creatorEvents} événement{e.creatorEvents > 1 ? 's' : ''} créé
              {e.creatorEvents > 1 ? 's' : ''}
            </Text>
            {!!e.description && (
              <Text style={styles.body} numberOfLines={6}>
                {e.description}
              </Text>
            )}
            {!!e.linkUrl && (
              <Pressable onPress={() => Linking.openURL(e.linkUrl!)}>
                <Text style={styles.link} numberOfLines={1}>
                  {e.linkUrl}
                </Text>
              </Pressable>
            )}
            <Field
              label="Mot au créateur (si refus)"
              value={notes[e.id] ?? ''}
              onChangeText={(t) => setNotes((n) => ({ ...n, [e.id]: t }))}
              maxLength={300}
              placeholder="ex. Pas un événement moto"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button title="Valider" icon="checkmark" loading={busy === e.id} onPress={() => decide(e, true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Refuser"
                  icon="close"
                  variant="secondary"
                  disabled={busy === e.id}
                  onPress={() =>
                    Alert.alert('Refuser cet événement ?', 'Il ne sera visible que par son créateur, qui sera prévenu.', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Refuser', style: 'destructive', onPress: () => decide(e, false) },
                    ])
                  }
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  muted: { fontSize: Type.small, color: Colors.textMuted },
  empty: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  card: { gap: 8, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  photo: { width: '100%', height: 140, borderRadius: Radius.md, backgroundColor: Colors.border },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  meta: { fontSize: Type.small, color: Colors.textMuted },
  body: { fontSize: Type.body, color: Colors.text, lineHeight: 20 },
  link: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  row: { flexDirection: 'row', gap: 12 },
}));
