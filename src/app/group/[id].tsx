import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';

import { showActionSheet, type SheetOption } from '@/components/action-sheet';
import { PersonRow } from '@/components/person-row';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import {
  fetchMembers,
  GROUP_MAX_MEMBERS,
  isMuted,
  leaveGroup,
  removeGroupMember,
  setConversationMute,
  setGroupAdmin,
  updateGroup,
  type Member,
} from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
import { uploadPhoto, type PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';

/** Infos d'un groupe : nom, photo, membres (admins : ajouter, retirer, nommer admin), sourdine, quitter. */
export default function GroupScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { conversations, refresh } = useMessages();
  const conv = conversations.find((c) => c.id === id);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [photo, setPhoto] = useState<PhotoValue>({ path: null, localUri: null });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchMembers(id)
      .then(setMembers)
      .catch(() => setMembers([]));
    refresh();
  }, [id, refresh]);

  useFocusEffect(load);

  const admin = members?.find((m) => m.id === userId)?.role === 'admin';

  const run = async (action: () => Promise<unknown>, label: string) => {
    try {
      await action();
      load();
    } catch (e) {
      Alert.alert(label, errorMessage(e));
    }
  };

  const memberMenu = (m: Member) => {
    const options: SheetOption[] = [
      { label: 'Voir le profil', onPress: () => router.push({ pathname: '/user/[id]', params: { id: m.id } }) },
    ];
    if (admin && m.id !== userId) {
      options.push(
        m.role === 'admin'
          ? { label: 'Retirer le rôle d’admin', onPress: () => run(() => setGroupAdmin(id, m.id, false), 'Action impossible') }
          : { label: 'Nommer admin', onPress: () => run(() => setGroupAdmin(id, m.id, true), 'Action impossible') },
        {
          label: 'Retirer du groupe',
          destructive: true,
          onPress: () =>
            Alert.alert(`Retirer @${m.username} ?`, undefined, [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Retirer', style: 'destructive', onPress: () => run(() => removeGroupMember(id, m.id), 'Action impossible') },
            ]),
        },
      );
    }
    showActionSheet({ title: `@${m.username}`, options });
  };

  const startEdit = () => {
    setTitle(conv?.title ?? '');
    setPhoto({ path: null, localUri: null });
    setEditing(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const path = photo.localUri ? await uploadPhoto(userId, 'group', photo) : undefined;
      // Photo inchangée : on garde l'ancienne (chemin relu dans la liste des conversations)
      const current = conv?.avatarUrl?.match(/\/photos\/(.+)$/)?.[1] ?? null;
      await updateGroup(id, title.trim(), path ?? current);
      setEditing(false);
      load();
    } catch (e) {
      Alert.alert('Modification impossible', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const mute = () => {
    if (!conv) return;
    const set = (until: Date | 'infinity' | null) => run(() => setConversationMute(id, until), 'Sourdine impossible');
    const inH = (h: number) => new Date(Date.now() + h * 3600_000);
    showActionSheet({
      options: isMuted(conv)
        ? [{ label: '🔔 Réactiver les notifications', onPress: () => set(null) }]
        : [
            { label: '🔕 1 heure', onPress: () => set(inH(1)) },
            { label: '🔕 8 heures', onPress: () => set(inH(8)) },
            { label: '🔕 Toujours', onPress: () => set('infinity') },
          ],
    });
  };

  const leave = () =>
    Alert.alert('Quitter le groupe ?', 'Tu ne recevras plus ses messages.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Quitter',
        style: 'destructive',
        onPress: () =>
          leaveGroup(id)
            .then(async () => {
              await refresh();
              router.dismissAll();
              router.navigate('/messages');
            })
            .catch((e) => Alert.alert('Impossible de quitter', errorMessage(e))),
      },
    ]);

  if (!members) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const sorted = [...members].sort((a, b) => (a.role === b.role ? a.username.localeCompare(b.username) : a.role === 'admin' ? -1 : 1));
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Infos du groupe' }} />
      {editing ? (
        <View style={styles.card}>
          <PhotoPicker shape="round" label="Nouvelle photo du groupe" value={photo} onChange={setPhoto} />
          <Field label="Nom du groupe" required value={title} onChangeText={setTitle} maxLength={60} />
          <Button title="Enregistrer" onPress={saveEdit} loading={busy} disabled={!title.trim()} />
          <Button title="Annuler" variant="ghost" onPress={() => setEditing(false)} />
        </View>
      ) : (
        <View style={styles.head}>
          {conv?.avatarUrl ? (
            <Image source={{ uri: conv.avatarUrl }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Ionicons name="people" size={40} color={Colors.accent} />
            </View>
          )}
          <Text style={styles.title}>{conv?.title ?? 'Groupe'}</Text>
          <Text style={styles.muted}>
            {members.length} membre{members.length > 1 ? 's' : ''} · {GROUP_MAX_MEMBERS} au plus
            {conv && isMuted(conv) ? ' · 🔕 en sourdine' : ''}
          </Text>
          {admin && <Button title="Modifier le nom ou la photo" variant="secondary" onPress={startEdit} />}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.section}>Membres</Text>
        {admin && members.length < GROUP_MAX_MEMBERS && (
          <Button title="+ Ajouter des amis" variant="secondary" onPress={() => router.push({ pathname: '/group/new', params: { add: id } })} />
        )}
        {sorted.map((m) => (
          <PersonRow
            key={m.id}
            photoUrl={m.avatarUrl}
            title={`@${m.username}${m.id === userId ? ' (toi)' : ''}`}
            subtitle={m.role === 'admin' ? 'Admin' : null}
            onPress={() => memberMenu(m)}
          />
        ))}
      </View>

      <Button title={conv && isMuted(conv) ? '🔔 Réactiver les notifications' : '🔕 Mettre en sourdine'} variant="secondary" onPress={mute} />
      <Button title="Quitter le groupe" variant="ghost" onPress={leave} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  head: { alignItems: 'center', gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.border },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 8 },
  section: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
}));
