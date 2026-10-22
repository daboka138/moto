import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { addGroupMembers, createGroup, fetchMembers, GROUP_MAX_MEMBERS } from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
import { photoUrl, uploadPhoto, type PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { useFriends } from '@/lib/use-friends';

/**
 * Nouveau groupe : nom, photo, amis (50 membres au plus, moi compris).
 * ?add=<conversation> : ajouter des amis à un groupe existant (admins).
 */
export default function NewGroupScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { refresh } = useMessages();
  const { state, error } = useFriends();
  const [title, setTitle] = useState('');
  const [photo, setPhoto] = useState<PhotoValue>({ path: null, localUri: null });
  const [picked, setPicked] = useState<string[]>([]);
  const [already, setAlready] = useState<Set<string> | null>(add ? null : new Set());
  const [saving, setSaving] = useState(false);

  // Ajout : les membres actuels ne sont pas proposés
  useEffect(() => {
    if (!add) return;
    fetchMembers(add)
      .then((list) => setAlready(new Set(list.map((m) => m.id))))
      .catch(() => setAlready(new Set()));
  }, [add]);

  const room = GROUP_MAX_MEMBERS - (add ? (already?.size ?? 0) : 1);
  const friends = (state?.friends ?? [])
    .filter((f) => !already?.has(f.id))
    .sort((a, b) => a.username.localeCompare(b.username));

  const toggle = (id: string) =>
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= room) {
        Alert.alert('Groupe complet', `Un groupe compte ${GROUP_MAX_MEMBERS} membres au plus.`);
        return cur;
      }
      return [...cur, id];
    });

  const save = async () => {
    if (!picked.length) return;
    setSaving(true);
    try {
      if (add) {
        await addGroupMembers(add, picked);
        await refresh();
        router.back();
        return;
      }
      const photoPath = photo.localUri ? await uploadPhoto(userId, 'group', photo) : null;
      const id = await createGroup(title.trim(), photoPath, picked);
      await refresh();
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert(add ? 'Ajout impossible' : 'Création impossible', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if ((!state && !error) || !already) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const ready = picked.length > 0 && (add || title.trim().length > 0);
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: add ? 'Ajouter des membres' : 'Nouveau groupe' }} />
      <FlatList
        contentContainerStyle={styles.list}
        data={friends}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            {!add && (
              <>
                <PhotoPicker shape="round" label="Photo du groupe (facultatif)" value={photo} onChange={setPhoto} />
                <Field label="Nom du groupe" required value={title} onChangeText={setTitle} maxLength={60} placeholder="ex. Les potes du 13" />
              </>
            )}
            <Text style={styles.count}>
              {picked.length} ami{picked.length > 1 ? 's' : ''} choisi{picked.length > 1 ? 's' : ''} · {room} au plus
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const on = picked.includes(item.id);
          return (
            <PersonRow
              photoUrl={photoUrl(item.avatar_path)}
              userId={item.id}
              username={item.username}
              subtitle={item.city}
              onPress={() => toggle(item.id)}
              right={<Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? Colors.accent : Colors.textMuted} />}
            />
          );
        }}
        ListEmptyComponent={
          <Text style={styles.muted}>
            {error
              ? 'Impossible de charger tes amis.'
              : add
                ? 'Tous tes amis sont déjà dans le groupe.'
                : 'Un groupe se fait avec tes amis : ajoute d’abord des amis.'}
          </Text>
        }
      />
      <View style={styles.footer}>
        <Button
          title={add ? 'Ajouter au groupe' : 'Créer le groupe'}
          onPress={save}
          loading={saving}
          disabled={!ready}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  list: { padding: 16, gap: 4 },
  header: { gap: 12, marginBottom: 8 },
  count: { color: Colors.textMuted, fontWeight: '700' },
  muted: { color: Colors.textMuted, textAlign: 'center', padding: 24 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
}));
