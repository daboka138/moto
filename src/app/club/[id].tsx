import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Chip, Field, SmallButton } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import {
  addClubPost,
  decideMember,
  deleteClub,
  deleteClubPost,
  fetchClub,
  fetchClubActivities,
  fetchClubPosts,
  isClubAdmin,
  joinClub,
  leaveClub,
  removeMember,
  ROLE_LABELS,
  setMemberRole,
  shareClub,
  type Club,
  type ClubActivity,
  type ClubMember,
  type ClubPost,
} from '@/lib/clubs';
import { askReport } from '@/lib/moderation';
import { photoUrl, type PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';

type Tab = 'wall' | 'outings' | 'members';

/** Page d'un club : infos, Rejoindre, mur (membres), balades et événements, membres et demandes. */
export default function ClubScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const [club, setClub] = useState<Club | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('wall');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    try {
      setClub(await fetchClub(id, userId));
    } catch (e) {
      console.warn('Club indisponible', e);
      setClub(null);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (club === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (!club || !userId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Ce club n’existe plus ou n’est pas visible.</Text>
      </View>
    );
  }

  const admin = isClubAdmin(club);
  const member = club.myStatus === 'member';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const join = () =>
    run(async () => {
      const status = await joinClub(club.id);
      if (status === 'pending') Alert.alert('Demande envoyée', 'Les admins du club vont te répondre.');
    });

  const menu = () =>
    showActionSheet({
      title: club.name,
      options: [
        { label: 'Partager le club', onPress: () => shareClub(club) },
        ...(admin ? [{ label: 'Modifier le club', onPress: () => router.push({ pathname: '/club/new', params: { id: club.id } }) }] : []),
        ...(member && club.myRole !== 'founder'
          ? [{ label: 'Quitter le club', destructive: true, onPress: () => run(() => leaveClub(club.id)) }]
          : []),
        ...(club.myRole === 'founder'
          ? [
              {
                label: 'Supprimer le club',
                destructive: true,
                onPress: () =>
                  Alert.alert('Supprimer le club ?', 'Membres, mur et demandes sont effacés. Les balades et événements restent.', [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Supprimer',
                      style: 'destructive',
                      onPress: () =>
                        deleteClub(club.id)
                          .then(() => router.back())
                          .catch((e) => Alert.alert('Oups', e instanceof Error ? e.message : String(e))),
                    },
                  ]),
              },
            ]
          : [{ label: 'Signaler ce club', destructive: true, onPress: () => askReport('club', club.id) }]),
      ],
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: club.name,
          headerRight: () => (
            <Pressable onPress={menu} hitSlop={12} accessibilityLabel="Options du club">
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {club.logoPath ? (
            <Image source={{ uri: photoUrl(club.logoPath) }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoEmpty]}>
              <Ionicons name="flag" size={36} color={Colors.accent} />
            </View>
          )}
          <Text style={styles.name}>{club.name}</Text>
          <Text style={styles.muted}>
            {[club.city, `${club.members.length} membre${club.members.length > 1 ? 's' : ''}`, club.joinPolicy === 'open' ? 'public' : 'sur demande']
              .filter(Boolean)
              .join(' · ')}
            {club.hidden ? ' · masqué (modération)' : ''}
          </Text>
          {!!club.description && <Text style={styles.text}>{club.description}</Text>}
        </View>

        {member ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Partager le club" variant="secondary" onPress={() => shareClub(club)} />
            </View>
            {admin && (
              <View style={{ flex: 1 }}>
                <Button
                  title="Créer une sortie"
                  onPress={() =>
                    showActionSheet({
                      title: `Au nom de « ${club.name} »`,
                      message: 'Tous les membres seront invités.',
                      options: [
                        { label: '🏍️ Une balade', onPress: () => router.push({ pathname: '/ride/new', params: { club: club.id } }) },
                        { label: '📅 Un événement', onPress: () => router.push({ pathname: '/event/new', params: { club: club.id } }) },
                      ],
                    })
                  }
                />
              </View>
            )}
          </View>
        ) : club.myStatus === 'pending' ? (
          <Button title="Demande envoyée · Annuler" variant="secondary" loading={busy} onPress={() => run(() => leaveClub(club.id))} />
        ) : (
          <Button title={club.joinPolicy === 'open' ? 'Rejoindre le club' : 'Demander à rejoindre'} loading={busy} onPress={join} />
        )}

        <View style={styles.tabs}>
          <Chip label="Mur" selected={tab === 'wall'} onPress={() => setTab('wall')} />
          <Chip label="Balades et événements" selected={tab === 'outings'} onPress={() => setTab('outings')} />
          <Chip
            label={`Membres${admin && club.pending.length ? ` · ${club.pending.length} demande${club.pending.length > 1 ? 's' : ''}` : ''}`}
            selected={tab === 'members'}
            onPress={() => setTab('members')}
          />
        </View>

        {tab === 'wall' ? (
          member ? (
            <Wall club={club} userId={userId} />
          ) : (
            <Text style={styles.muted}>Le mur du club est réservé à ses membres.</Text>
          )
        ) : tab === 'outings' ? (
          <Outings clubId={club.id} />
        ) : (
          <Members club={club} userId={userId} run={run} />
        )}
      </ScrollView>
    </>
  );
}

function Wall({ club, userId }: { club: Club; userId: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const [posts, setPosts] = useState<ClubPost[] | null>(null);
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<PhotoValue>({ path: null, localUri: null });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setPosts(await fetchClubPosts(club.id));
    } catch (e) {
      console.warn('Mur indisponible', e);
      setPosts([]);
    }
  }, [club.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const send = async () => {
    if (!body.trim() && !photo.localUri) return;
    setSending(true);
    try {
      await addClubPost(userId, club.id, body, photo.localUri ? photo : null);
      setBody('');
      setPhoto({ path: null, localUri: null });
      await load();
    } catch (e) {
      Alert.alert('Envoi impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const postMenu = (p: ClubPost) =>
    showActionSheet({
      options:
        p.authorId === userId || isClubAdmin(club)
          ? [
              {
                label: 'Supprimer',
                destructive: true,
                onPress: () =>
                  deleteClubPost(p.id)
                    .then(load)
                    .catch((e) => Alert.alert('Oups', e instanceof Error ? e.message : String(e))),
              },
            ]
          : [{ label: 'Signaler', destructive: true, onPress: () => askReport('club_post', p.id) }],
    });

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.card}>
        <Field label="Message au club" value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Une sortie, une info, une photo…" />
        <View style={styles.row}>
          <PhotoPicker value={photo} onChange={setPhoto} shape="wide" label="Photo" />
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Button title="Publier" onPress={send} loading={sending} disabled={!body.trim() && !photo.localUri} />
          </View>
        </View>
      </View>
      {!posts ? (
        <ActivityIndicator color={Colors.accent} />
      ) : posts.length === 0 ? (
        <Text style={styles.muted}>Rien sur le mur pour l’instant. Lance la discussion !</Text>
      ) : (
        posts.map((p) => (
          <Pressable key={p.id} style={styles.card} onLongPress={() => postMenu(p)}>
            <View style={styles.row}>
              <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>@{p.username}</Text>
                <Text style={styles.small}>
                  {new Date(p.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <Pressable onPress={() => postMenu(p)} hitSlop={10}>
                <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
            {!!p.body && <Text style={styles.text}>{p.body}</Text>}
            {p.photoUrl && <Image source={{ uri: p.photoUrl }} style={styles.photo} contentFit="cover" />}
          </Pressable>
        ))
      )}
    </View>
  );
}

function Outings({ clubId }: { clubId: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const [items, setItems] = useState<ClubActivity[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchClubActivities(clubId)
        .then((a) => !cancelled && setItems(a))
        .catch(() => !cancelled && setItems([]));
      return () => {
        cancelled = true;
      };
    }, [clubId]),
  );

  if (!items) return <ActivityIndicator color={Colors.accent} />;
  if (!items.length) return <Text style={styles.muted}>Aucune balade ni événement à venir pour ce club.</Text>;
  return (
    <View style={{ gap: 8 }}>
      {items.map((a) => (
        <Pressable
          key={a.kind + a.id}
          style={[styles.card, styles.row]}
          onPress={() => router.push({ pathname: a.kind === 'ride' ? '/ride/[id]' : '/event/[id]', params: { id: a.id } })}>
          <Text style={{ fontSize: Type.title }}>{a.kind === 'ride' ? '🏍️' : '📅'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{a.title}</Text>
            <Text style={styles.small}>
              {new Date(a.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

function Members({ club, userId, run }: { club: Club; userId: string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const styles = useStyles();
  const admin = isClubAdmin(club);
  const founder = club.myRole === 'founder';

  const manage = (m: ClubMember) => {
    const options = [
      { label: 'Voir le profil', onPress: () => router.push({ pathname: '/user/[id]', params: { id: m.userId } }) },
      ...(founder && m.role !== 'founder'
        ? [
            m.role === 'admin'
              ? { label: 'Retirer le rôle d’admin', onPress: () => run(() => setMemberRole(club.id, m.userId, 'member')) }
              : { label: 'Nommer admin', onPress: () => run(() => setMemberRole(club.id, m.userId, 'admin')) },
          ]
        : []),
      ...(admin && m.role !== 'founder' && (m.role === 'member' || founder)
        ? [{ label: 'Retirer du club', destructive: true, onPress: () => run(() => removeMember(club.id, m.userId)) }]
        : []),
    ];
    showActionSheet({ title: `@${m.username}`, options });
  };

  return (
    <View style={{ gap: 8 }}>
      {admin && club.pending.length > 0 && (
        <View style={[styles.card, { gap: 8 }]}>
          <Text style={styles.label}>Demandes</Text>
          {club.pending.map((m) => (
            <View key={m.userId} style={styles.row}>
              <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
              <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                @{m.username}
              </Text>
              <SmallButton title="Accepter" onPress={() => run(() => decideMember(club.id, m.userId, true))} />
              <SmallButton title="Refuser" variant="secondary" onPress={() => run(() => decideMember(club.id, m.userId, false))} />
            </View>
          ))}
        </View>
      )}
      {club.members.map((m) => (
        <Pressable
          key={m.userId}
          style={[styles.card, styles.row]}
          onPress={() => (m.userId === userId ? undefined : manage(m))}>
          <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
          <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
            @{m.username}
            {m.userId === userId ? ' (moi)' : ''}
          </Text>
          {m.role !== 'member' && <Text style={styles.role}>{ROLE_LABELS[m.role]}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  header: { alignItems: 'center', gap: 8 },
  logo: { width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.border },
  logoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  name: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  text: { fontSize: Type.body, color: Colors.text, lineHeight: 21 },
  muted: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center' },
  small: { fontSize: Type.small, color: Colors.textMuted },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  role: { fontSize: Type.small, fontWeight: '800', color: Colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: Colors.border },
}));
