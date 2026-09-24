import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { showActionSheet } from '@/components/action-sheet';
import { PersonRow } from '@/components/person-row';
import { makeStyles, useColors } from '@/constants/theme';
import { timeAgo } from '@/lib/feed';
import { askBlock, askReport } from '@/lib/moderation';
import { useSession } from '@/lib/session';
import {
  deleteStory,
  fetchStoryViewers,
  groupStories,
  IMAGE_STORY_MS,
  type Story,
  type StoryGroup,
  type StoryViewer,
} from '@/lib/stories';
import { useStories } from '@/lib/stories-context';

const TICK_MS = 50;
const CLOSE_DRAG_PX = 120;

/**
 * Visionneuse plein écran : barre de progression, appui à droite / à gauche pour
 * la story suivante / précédente, appui long pour mettre en pause, glisser vers le bas pour fermer.
 */
export default function StoryViewerScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const { session } = useSession();
  const meId = session?.user.id;
  const { stories, viewed, markViewed, refresh } = useStories();

  // Ordre des motards figé à l'ouverture (sinon il bouge au fur et à mesure des vues)
  const [groups, setGroups] = useState<StoryGroup[]>(() => groupStories(stories, meId, viewed));
  const [position, setPosition] = useState(() => {
    const g = Math.max(0, groups.findIndex((x) => x.ownerId === ownerId));
    const firstUnseen = groups[g]?.stories.findIndex((s) => !viewed.has(s.id)) ?? 0;
    return { group: g, story: groups[g]?.ownerId === meId ? 0 : Math.max(0, firstUnseen) };
  });
  const [progress, setProgress] = useState({ id: '', value: 0 });
  const [held, setHeld] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [viewers, setViewers] = useState<{ id: string; list: StoryViewer[] | null } | null>(null);
  const [showViewers, setShowViewers] = useState(false);

  const group = groups[position.group];
  const story: Story | undefined = group?.stories[position.story];
  const mine = !!story && story.ownerId === meId;
  const paused = held || overlayOpen || showViewers || loadedId !== story?.id;
  const value = progress.id === story?.id ? progress.value : 0;

  const close = () => router.back();

  const next = () => {
    if (!group) return close();
    if (position.story < group.stories.length - 1) setPosition({ ...position, story: position.story + 1 });
    else if (position.group < groups.length - 1) setPosition({ group: position.group + 1, story: 0 });
    else close();
  };

  const prev = () => {
    if (position.story > 0) setPosition({ ...position, story: position.story - 1 });
    else if (position.group > 0) {
      const g = position.group - 1;
      setPosition({ group: g, story: groups[g].stories.length - 1 });
    } else if (story) setProgress({ id: story.id, value: 0 });
  };

  // Vue enregistrée dès l'affichage
  useEffect(() => {
    if (story) markViewed(story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // Qui a vu ma story
  useEffect(() => {
    if (!story || !mine || story.isDemo) return;
    let cancelled = false;
    fetchStoryViewers(story.id)
      .then((list) => !cancelled && setViewers({ id: story.id, list }))
      .catch(() => !cancelled && setViewers({ id: story.id, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [story, mine]);

  // Minuteur des photos (les vidéos avancent avec le lecteur et appellent next à la fin)
  useEffect(() => {
    if (!story || paused || (story.mediaType !== 'image' && value < 1)) return;
    const timer = setTimeout(() => {
      if (value >= 1) next();
      else setProgress({ id: story.id, value: Math.min(1, value + TICK_MS / IMAGE_STORY_MS) });
    }, TICK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, paused, value]);

  // Glisser vers le bas pour fermer
  const [dragY] = useState(() => new Animated.Value(0));
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => dragY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DRAG_PX) router.back();
        else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start(),
    }),
  );

  if (!group || !story) {
    return (
      <View style={styles.screen}>
        <SafeAreaView style={styles.center}>
          <Text style={styles.white}>Story indisponible.</Text>
          <Pressable onPress={close} style={styles.closeAlone}>
            <Text style={styles.white}>Fermer</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const removeFromList = (s: Story) => {
    const updated = groups.map((g) => ({ ...g, stories: g.stories.filter((x) => x.id !== s.id) }));
    const left = updated[position.group].stories.length;
    if (left === 0) return close();
    setGroups(updated);
    if (position.story >= left) setPosition({ ...position, story: left - 1 });
  };

  const confirmDelete = () => {
    setOverlayOpen(true);
    Alert.alert('Supprimer ma story ?', 'Elle ne sera plus visible par personne.', [
      { text: 'Annuler', style: 'cancel', onPress: () => setOverlayOpen(false) },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStory(story);
            removeFromList(story);
            refresh();
          } catch (e) {
            Alert.alert('Suppression impossible', e instanceof Error ? e.message : String(e));
          } finally {
            setOverlayOpen(false);
          }
        },
      },
    ], { cancelable: true, onDismiss: () => setOverlayOpen(false) });
  };

  const openProfile = () => {
    router.back();
    if (story.isDemo) router.push({ pathname: '/demo-rider/[id]', params: { id: story.ownerId } });
    else router.push({ pathname: '/user/[id]', params: { id: story.ownerId } });
  };

  const menu = () => {
    setOverlayOpen(true);
    showActionSheet({
      onClose: () => setOverlayOpen(false),
      options: [
        { label: 'Voir le profil', onPress: openProfile },
        { label: 'Signaler cette story', onPress: () => askReport('story', story.id) },
        ...(story.isDemo || !meId
          ? []
          : [
              {
                label: `Bloquer @${story.username}`,
                destructive: true,
                onPress: () =>
                  askBlock(meId, { id: story.ownerId, username: story.username }, () => {
                    refresh();
                    close();
                  }),
              },
            ]),
      ],
    });
  };

  const onTap = (x: number) => (x < width * 0.3 ? prev() : next());
  const viewerList = viewers?.id === story.id ? viewers.list : null;

  return (
    <View style={styles.screen}>
      <Animated.View
        style={[styles.flex, { transform: [{ translateY: dragY }], opacity: dragY.interpolate({ inputRange: [0, 400], outputRange: [1, 0.4], extrapolate: 'clamp' }) }]}
        {...pan.panHandlers}>
        <Pressable
          style={styles.flex}
          onPress={(e) => onTap(e.nativeEvent.locationX)}
          onLongPress={() => setHeld(true)}
          onPressOut={() => setHeld(false)}
          delayLongPress={220}>
          {story.mediaType === 'image' ? (
            <Image
              key={story.id}
              source={{ uri: story.url }}
              style={styles.flex}
              contentFit="contain"
              onLoad={() => setLoadedId(story.id)}
              onError={() => setLoadedId(story.id)}
            />
          ) : (
            <StoryVideo
              key={story.id}
              story={story}
              paused={held || overlayOpen || showViewers}
              onReady={() => setLoadedId(story.id)}
              onProgress={(v) => setProgress({ id: story.id, value: v })}
              onEnd={next}
            />
          )}
          {loadedId !== story.id && (
            <View style={styles.loading} pointerEvents="none">
              <ActivityIndicator color={Colors.white} size="large" />
            </View>
          )}
          {!!story.caption && (
            <View style={styles.captionBox} pointerEvents="none">
              <Text style={styles.caption}>{story.caption}</Text>
            </View>
          )}
        </Pressable>

        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={styles.bars}>
            {group.stories.map((s, i) => (
              <View key={s.id} style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${(i < position.story ? 1 : i === position.story ? value : 0) * 100}%` },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.headerRow}>
            <Pressable style={styles.author} onPress={mine ? undefined : openProfile}>
              <Image source={{ uri: story.avatarUrl }} style={styles.avatar} />
              <View>
                <Text style={styles.username}>{mine ? 'Ma story' : `@${story.username}`}</Text>
                <Text style={styles.meta}>
                  {timeAgo(story.createdAt)} · {story.visibility === 'friends' ? '👥 Amis' : '🌍 Tout le monde'}
                </Text>
              </View>
            </Pressable>
            {!mine && (
              <Pressable onPress={menu} hitSlop={12}>
                <Ionicons name="ellipsis-horizontal" size={26} color={Colors.white} />
              </Pressable>
            )}
            <Pressable onPress={close} hitSlop={12}>
              <Ionicons name="close" size={30} color={Colors.white} />
            </Pressable>
          </View>
        </View>

        {mine && !story.isDemo && (
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable style={styles.bottomButton} onPress={() => setShowViewers(true)}>
              <Ionicons name="eye-outline" size={22} color={Colors.white} />
              <Text style={styles.bottomText}>{viewerList ? `${viewerList.length} vue${viewerList.length > 1 ? 's' : ''}` : 'Vues'}</Text>
            </Pressable>
            <Pressable style={styles.bottomButton} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={22} color={Colors.white} />
              <Text style={styles.bottomText}>Supprimer</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>

      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={() => setShowViewers(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowViewers(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.sheetTitle}>Vue par</Text>
            {!viewerList ? (
              <ActivityIndicator color={Colors.accent} />
            ) : viewerList.length === 0 ? (
              <Text style={styles.sheetEmpty}>Personne pour l’instant.</Text>
            ) : (
              <FlatList
                data={viewerList}
                keyExtractor={(v) => v.id}
                renderItem={({ item }) => (
                  <PersonRow photoUrl={item.avatarUrl} title={`@${item.username}`} subtitle={timeAgo(item.viewedAt)} />
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StoryVideo({
  story,
  paused,
  onReady,
  onProgress,
  onEnd,
}: {
  story: Story;
  paused: boolean;
  onReady: () => void;
  onProgress: (value: number) => void;
  onEnd: () => void;
}) {
  const styles = useStyles();
  const player = useVideoPlayer(story.url, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.loop = false;
  });

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay' || status === 'error') onReady();
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const duration = player.duration || story.durationS || 30;
    onProgress(Math.min(0.999, currentTime / duration));
  });
  useEventListener(player, 'playToEnd', onEnd);

  return <VideoView player={player} style={styles.flex} contentFit="contain" nativeControls={false} />;
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.dark },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  white: { color: Colors.white, fontSize: 16 },
  closeAlone: { padding: 12 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10, gap: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.overlayLight, overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: Colors.white },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.darkSoft },
  username: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  meta: { color: Colors.textFaint, fontSize: 12 },
  captionBox: { position: 'absolute', left: 16, right: 16, bottom: '18%', alignItems: 'center' },
  caption: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: Colors.overlayLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    backgroundColor: Colors.overlayLight,
  },
  bottomButton: { alignItems: 'center', gap: 4, padding: 6 },
  bottomText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  sheet: {
    maxHeight: '60%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  sheetEmpty: { color: Colors.textMuted, paddingVertical: 12 },
}));
