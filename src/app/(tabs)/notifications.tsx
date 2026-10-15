import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Animated, PanResponder, Platform, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  answerNotification,
  deleteNotification,
  fetchNotifications,
  groupNotifications,
  hasActions,
  markNotificationsRead,
  NOTIFICATION_ICONS,
  relativeTime,
  useNotificationsBadge,
  type AppNotification,
} from '@/lib/notifications';
import { useSession } from '@/lib/session';

/** Distance de glissement vers la gauche qui supprime la notification */
const SWIPE_DELETE_PX = 110;

/** Onglet Notifs : regroupées par Aujourd'hui / Cette semaine / Plus ancien. */
export default function NotificationsScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id;
  const badge = useNotificationsBadge();
  const [list, setList] = useState<{ items: AppNotification[]; at: number } | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const items = await fetchNotifications();
      setList({ items, at: Date.now() });
      setError(false);
    } catch (e) {
      console.warn('Notifications indisponibles', e);
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markAll = async () => {
    try {
      await markNotificationsRead();
      await Promise.all([load(), badge.refresh()]);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const open = (n: AppNotification) => {
    if (!n.readAt) {
      setList((l) => l && { ...l, items: l.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) });
      markNotificationsRead([n.id])
        .then(() => badge.refresh())
        .catch((e) => console.warn('Notification non marquée comme lue', e));
    }
    router.push(n.url as Href);
  };

  const remove = (n: AppNotification) => {
    setList((l) => l && { ...l, items: l.items.filter((x) => x.id !== n.id) });
    deleteNotification(n.id)
      .then(() => badge.refresh())
      .catch((e) => {
        console.warn('Suppression impossible', e);
        load();
      });
  };

  const answer = async (n: AppNotification, accept: boolean) => {
    if (!userId) return;
    setBusyId(n.id);
    try {
      await answerNotification(n, userId, accept);
      await Promise.all([load(), badge.refresh()]);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const unread = list?.items.some((n) => !n.readAt) ?? false;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Notifications</Text>
        {unread && (
          <Pressable onPress={markAll} hitSlop={8} accessibilityLabel="Tout marquer comme lu">
            <Text style={styles.markAll}>Tout marquer comme lu</Text>
          </Pressable>
        )}
      </View>
      {!list ? (
        <View style={styles.center}>
          {error ? <Text style={styles.muted}>Impossible de charger les notifications.</Text> : <ActivityIndicator color={Colors.accent} />}
        </View>
      ) : (
        <SectionList
          sections={groupNotifications(list.items, list.at)}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.accent]} />}
          renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
          renderItem={({ item }) => (
            <SwipeToDelete onDelete={() => remove(item)}>
              <NotificationRow
                n={item}
                now={list.at}
                busy={busyId === item.id}
                onPress={() => open(item)}
                onAnswer={(accept) => answer(item, accept)}
                onDelete={() => remove(item)}
              />
            </SwipeToDelete>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={44} color={Colors.textMuted} />
              <Text style={styles.muted}>
                Rien de neuf pour le moment. Tu verras ici les demandes d’ami, les invitations aux balades et aux événements, les J’aime et les commentaires.
              </Text>
              <Chip label="👥 Ajouter des amis" selected onPress={() => router.push('/friends')} />
            </View>
          }
          ListFooterComponent={
            list.items.length ? (
              <Text style={styles.footer}>
                {Platform.OS === 'web' ? 'Croix : supprimer une notification.' : 'Glisse une notification vers la gauche pour la supprimer.'}
                {' '}Elles sont effacées après 60 jours.
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({
  n,
  now,
  busy,
  onPress,
  onAnswer,
  onDelete,
}: {
  n: AppNotification;
  now: number;
  busy: boolean;
  onPress: () => void;
  onAnswer: (accept: boolean) => void;
  onDelete: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const icon = NOTIFICATION_ICONS[n.type];
  return (
    <Pressable style={({ pressed }) => [styles.row, !n.readAt && styles.unread, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View>
        {n.actor ? (
          <Image source={{ uri: n.actor.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.iconAvatar]}>
            <Text style={styles.iconBig}>{icon}</Text>
          </View>
        )}
        {n.actor && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeIcon}>{icon}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.text, !n.readAt && styles.textUnread]} numberOfLines={3}>
          {n.body}
        </Text>
        <Text style={styles.time}>{relativeTime(n.createdAt, now)}</Text>
        {hasActions(n) && (
          <View style={styles.actions}>
            {busy ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <>
                <Pressable style={({ pressed }) => [styles.accept, pressed && { opacity: 0.7 }]} onPress={() => onAnswer(true)}>
                  <Text style={styles.acceptText}>Accepter</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.refuse, pressed && { opacity: 0.7 }]} onPress={() => onAnswer(false)}>
                  <Text style={styles.refuseText}>Refuser</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
      {!n.readAt && <View style={styles.dot} />}
      {Platform.OS === 'web' && (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel="Supprimer la notification">
          <Ionicons name="close" size={20} color={Colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

/** Glisser vers la gauche pour supprimer (PanResponder : fonctionne aussi sans gesture-handler) */
function SwipeToDelete({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const [swiped, setSwiped] = useState(false);
  // Une seule fois, quand l'animation de sortie est finie
  useEffect(() => {
    if (swiped) onDelete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swiped]);
  const [x] = useState(() => new Animated.Value(0));
  const [responder] = useState(() => {
    const native = Platform.OS !== 'web';
    return PanResponder.create({
      // Seulement un vrai glissement horizontal (le défilement vertical reste à la liste)
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_DELETE_PX) {
          Animated.timing(x, { toValue: -600, duration: 180, useNativeDriver: native }).start(() => setSwiped(true));
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: native }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: native }).start(),
    });
  });
  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeBehind}>
        <Ionicons name="trash" size={22} color={Colors.white} />
        <Text style={styles.swipeText}>Supprimer</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 },
  screenTitle: { fontSize: 28, fontWeight: '900', color: Colors.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  markAll: { color: Colors.accent, fontWeight: '800', fontSize: 14, paddingHorizontal: 8 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 64, paddingHorizontal: 24 },
  footer: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 16 },
  swipeWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  swipeBehind: {
    ...{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingRight: 20,
  },
  swipeText: { color: Colors.white, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, backgroundColor: Colors.surface },
  unread: { backgroundColor: Colors.accentSoft },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border },
  iconAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  iconBig: { fontSize: 24 },
  typeBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIcon: { fontSize: 12 },
  body: { flex: 1, gap: 4 },
  text: { fontSize: 15, color: Colors.text, lineHeight: 20 },
  textUnread: { fontWeight: '700' },
  time: { fontSize: 12, color: Colors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  accept: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.accent },
  acceptText: { color: Colors.white, fontWeight: '800' },
  refuse: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background },
  refuseText: { color: Colors.text, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent, marginTop: 6 },
}));
