import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { makeStyles, useColors } from '@/constants/theme';
import { messagePreview, messageTime, type Conversation } from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
import { useSession } from '@/lib/session';
import { useInbox } from '@/lib/use-inbox';
import { DEMO_ME } from '@/demo/messages'; // DEMO

/** Onglet Messages : mes conversations privées et de balade. */
export default function MessagesScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const { refresh } = useMessages();
  const { conversations } = useInbox();
  const [refreshing, setRefreshing] = useState(false);

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
    const mine = item.lastSenderId === session?.user.id || item.lastSenderId === DEMO_ME;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.groupAvatar]}>
            <Ionicons name="flag" size={24} color={Colors.accent} />
          </View>
        )}
        <View style={styles.text}>
          <View style={styles.topLine}>
            <Text style={[styles.title, unread && styles.bold]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.time, unread && styles.timeUnread]}>{messageTime(item.lastAt)}</Text>
          </View>
          <View style={styles.topLine}>
            <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
              {item.blocked ? 'Conversation bloquée' : `${mine && item.lastBody !== null ? 'Toi : ' : ''}${messagePreview(item)}`}
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.muted}>
              Aucune conversation. Écris à un ami, ou rejoins une balade pour discuter avec le groupe.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  screenTitle: { fontSize: 28, fontWeight: '900', color: Colors.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  list: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  pressed: { backgroundColor: Colors.surface },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.border },
  groupAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  text: { flex: 1, gap: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.text },
  bold: { fontWeight: '900' },
  time: { fontSize: 12, color: Colors.textMuted },
  timeUnread: { color: Colors.accent, fontWeight: '800' },
  preview: { flex: 1, fontSize: 14, color: Colors.textMuted },
  previewUnread: { color: Colors.text, fontWeight: '800' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
}));
