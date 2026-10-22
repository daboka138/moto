import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { joinPublicGroup, useCommunityCard } from '@/lib/community';
import { errorMessage } from '@/lib/errors';
import { isMuted, messagePreview, messageTime, type Conversation } from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
import { useSession } from '@/lib/session';
import { useInbox } from '@/lib/use-inbox';
import { useDisplayName } from '@/lib/display-names';

/** Onglet Messages : mes conversations privées, de groupe et de balade. */
export default function MessagesScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const { refresh } = useMessages();
  const { conversations } = useInbox();
  const [refreshing, setRefreshing] = useState(false);
  // Carte « Rejoins le groupe de la commu » (jamais d'ajout forcé)
  const community = useCommunityCard();
  const [joining, setJoining] = useState(false);
  const joinCommunity = async () => {
    if (!community.group) return;
    setJoining(true);
    try {
      const id = await joinPublicGroup(community.group.id);
      await refresh();
      community.refresh();
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Groupe de la commu', errorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const pull = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const unread = item.unread > 0 && !item.blocked;
    const mine = item.lastSenderId === session?.user.id;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.groupAvatar]}>
            <Ionicons name={item.kind === 'group' ? 'people' : 'flag'} size={24} color={Colors.accent} />
          </View>
        )}
        <View style={styles.text}>
          <View style={styles.topLine}>
            <ConvTitle conv={item} style={[styles.title, unread && styles.bold]} />
            {isMuted(item) && <Ionicons name="notifications-off" size={14} color={Colors.textMuted} />}
            <Text style={[styles.time, unread && styles.timeUnread]}>{messageTime(item.lastAt)}</Text>
          </View>
          <View style={styles.topLine}>
            <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
              {item.blocked
                ? 'Conversation bloquée'
                : `${mine && item.lastBody !== null && item.lastKind === 'user' && !item.lastDeleted ? 'Toi : ' : ''}${messagePreview(item)}`}
            </Text>
            {unread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Messages</Text>
        <Pressable style={styles.newButton} onPress={() => router.push('/messages/new')}>
          <Ionicons name="create-outline" size={18} color={Colors.white} />
          <Text style={styles.newText}>Nouveau message</Text>
        </Pressable>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} colors={[Colors.accent]} />}
        ListHeaderComponent={
          community.group ? (
            <View style={styles.community}>
              <View style={styles.communityTop}>
                <View style={[styles.communityIcon]}>
                  <Ionicons name="construct-outline" size={24} color={Colors.accent} />
                </View>
                <View style={styles.text}>
                  <Text style={styles.communityTitle}>Rejoins le groupe de la commu</Text>
                  <Text style={styles.communityText}>
                    Donne ton avis, propose des idées, signale des bugs · {community.group.membersCount} membre
                    {community.group.membersCount > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.communityButtons}>
                <Pressable style={styles.communityJoin} onPress={joinCommunity} disabled={joining}>
                  <Text style={styles.communityJoinText}>{joining ? '…' : 'Rejoindre'}</Text>
                </Pressable>
                <Pressable style={styles.communityLater} onPress={community.later} hitSlop={6}>
                  <Text style={styles.communityLaterText}>Plus tard</Text>
                </Pressable>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.muted}>
              Pas encore de discussion. Écris à un pote ou rejoins une balade pour parler avec le groupe.
            </Text>
            <Chip label="Écrire à un ami" icon="create-outline" selected onPress={() => router.push('/messages/new')} />
            <Chip label="Trouver des motards" icon="people-outline" onPress={() => router.push('/riders')} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  screenTitle: { fontSize: Type.title, fontWeight: '900', color: Colors.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newText: { color: Colors.white, fontWeight: '800', fontSize: Type.body },
  list: { paddingBottom: 8 },
  community: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    gap: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.accentSoft,
  },
  communityTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  communityIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  communityEmoji: { fontSize: Type.title },
  communityTitle: { fontSize: Type.body, fontWeight: '900', color: Colors.accentOnSoft },
  communityText: { fontSize: Type.small, color: Colors.accentOnSoft },
  communityButtons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  communityJoin: { backgroundColor: Colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  communityJoinText: { color: Colors.white, fontWeight: '900' },
  communityLater: { paddingVertical: 8 },
  communityLaterText: { color: Colors.accentOnSoft, fontWeight: '700' },
  // Liste à plat avec séparateurs fins
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pressed: { backgroundColor: Colors.surface },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.border },
  groupAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  text: { flex: 1, minWidth: 0, gap: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: Type.body, fontWeight: '600', color: Colors.text },
  bold: { fontWeight: '900' },
  time: { fontSize: Type.small, color: Colors.textMuted },
  timeUnread: { color: Colors.accent, fontWeight: '800' },
  preview: { flex: 1, fontSize: Type.body, color: Colors.textMuted },
  previewUnread: { color: Colors.text, fontWeight: '800' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.white, fontSize: Type.small, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 12, padding: 32 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
}));

/** Titre d'une conversation : nom affiché de l'autre motard (conversation privée), sinon le titre */
function ConvTitle({ conv, style }: { conv: Conversation; style: StyleProp<TextStyle> }) {
  const name = useDisplayName(conv.kind === 'direct' ? conv.otherId : null);
  return (
    <Text style={style} numberOfLines={1}>
      {(conv.kind === 'direct' && name) || conv.title}
    </Text>
  );
}
