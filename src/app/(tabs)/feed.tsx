import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FriendSuggestions } from '@/components/friend-suggestions';
import { NewsCard } from '@/components/news-card';
import { PhotoViewer } from '@/components/photo-viewer';
import { RideCard } from '@/components/ride-card';
import { StoryRow } from '@/components/story-row';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { mixNews, photoItems, rideItems, sortFeed, timeAgo, type FeedItem, type FeedPerson } from '@/lib/feed';
import { fetchFriends } from '@/lib/friends';
import { fetchNews, sortNewsForEmptyWall, useShowNews, type NewsItem } from '@/lib/news';
import { mainCategory, photoUrl } from '@/lib/profile';
import { rideFitsCategory } from '@/lib/moto';
import { fetchUpcomingRides, joinRide, type RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { useStories } from '@/lib/stories-context';
import { confirmJoinRide } from '@/lib/join-ride';
import { fetchFriendSuggestions, type FriendSuggestion } from '@/lib/suggestions';
import { fetchPhotosOf, type WallPhoto } from '@/lib/wall';

type RealFeed = { userId: string; friends: FeedPerson[]; photos: WallPhoto[]; rides: RideSummary[] };

/** Fil : publications + actus moto (1 pour 3 posts) + carrousel « Motards que tu pourrais connaître » tous les ~8 posts */
type NewsRow = { kind: 'news'; key: string; at: string; news: NewsItem };
type FeedRow = FeedItem | NewsRow | { kind: 'suggestions'; key: string; slice: number };
const SUGGESTIONS_EVERY = 8;
const SUGGESTIONS_PER_CAROUSEL = 6;

/** Onglet Mur : fil d'actualité de mes amis. */
export default function FeedScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, profile } = useSession();
  const myCategory = mainCategory(profile);
  const userId = session?.user.id;
  const [real, setReal] = useState<RealFeed | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [viewing, setViewing] = useState<WallPhoto | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const { refresh: refreshStories } = useStories();
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  // Actus moto (Paramètres › Afficher les actus moto) : chargées à part, une erreur ne bloque pas le fil
  const showNews = useShowNews();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsError, setNewsError] = useState(false);

  // Actus : chargées tout de suite, sans attendre (ni dépendre) les publications des amis ; 2e essai si ça rate
  const loadNews = useCallback(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        setNews(await fetchNews(30));
        setNewsError(false);
        return;
      } catch (e) {
        console.warn('Actus indisponibles', e);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setNewsError(true);
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    if (showNews) loadNews();
    try {
      const friendsState = await fetchFriends(userId);
      const friends: FeedPerson[] = friendsState.friends.map((f) => ({
        id: f.id,
        username: f.username,
        avatarUrl: photoUrl(f.avatar_path),
      }));
      const [photos, rides] = await Promise.all([fetchPhotosOf(friends.map((f) => f.id)), fetchUpcomingRides(userId)]);
      setReal({ userId, friends, photos, rides });
      setError(false);
      // Suggestions : à part, une erreur ne bloque pas le fil
      fetchFriendSuggestions(18)
        .then(setSuggestions)
        .catch((e) => console.warn('Suggestions indisponibles', e));
    } catch (e) {
      console.warn('Chargement du fil impossible', e);
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [userId, showNews, loadNews]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const current = real && real.userId === userId ? real : null;
  const friends = current?.friends ?? [];
  // Publications des amis ; si elles n'ont pas chargé mais que les actus sont là, le Mur montre au moins les actus
  const memberItems = current
    ? sortFeed([...photoItems(current.photos, current.friends), ...rideItems(current.rides, current.friends)])
    : error && showNews && news.length
      ? []
      : null;
  // Mur vide : les actus du jour en premier ; sinon au plus 1 actu pour 3 publications
  const newsRows: NewsRow[] = (memberItems?.length ? news : sortNewsForEmptyWall(news))
    .slice(0, 30)
    .map((n) => ({ kind: 'news', key: `news-${n.id}`, at: n.publishedAt, news: n }));
  const items: (FeedItem | NewsRow)[] | null = memberItems ? mixNews<FeedItem | NewsRow, NewsRow>(memberItems, showNews ? newsRows : []) : null;
  const wallEmpty = !!memberItems && memberItems.length === 0;

  // Carrousels : après le 3e post (ou le dernier si le fil est court), puis tous les ~8 posts,
  // une tranche différente de suggestions à chaque fois
  const first = items ? Math.min(2, items.length - 1) : 0;
  const rows: FeedRow[] | null = items
    ? items.flatMap((item, i): FeedRow[] => {
        if (i < first || (i - first) % SUGGESTIONS_EVERY !== 0) return [item];
        const slice = (i - first) / SUGGESTIONS_EVERY;
        if (slice * SUGGESTIONS_PER_CAROUSEL >= suggestions.length) return [item];
        return [item, { kind: 'suggestions', key: `suggestions-${slice}`, slice }];
      })
    : null;
  const carousel = (slice: number) =>
    userId ? (
      <FriendSuggestions
        userId={userId}
        suggestions={suggestions.slice(slice * SUGGESTIONS_PER_CAROUSEL, (slice + 1) * SUGGESTIONS_PER_CAROUSEL)}
        onChange={(next) => {
          const shown = suggestions.slice(slice * SUGGESTIONS_PER_CAROUSEL, (slice + 1) * SUGGESTIONS_PER_CAROUSEL);
          const removed = new Set(shown.filter((x) => !next.some((n) => n.id === x.id)).map((x) => x.id));
          setSuggestions((all) => all.filter((x) => !removed.has(x.id)));
        }}
      />
    ) : null;

  const emptyWall = (
    <View style={styles.emptyWrap}>
      {carousel(0)}
      <View style={styles.empty}>
        <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>{friends.length ? 'Rien de neuf chez tes potes' : 'Personne ici pour l’instant'}</Text>
        <Text style={styles.muted}>
          {friends.length
            ? 'Tes potes sont calmes. Poste une photo, lance le mouvement !'
            : 'Invite tes potes ou trouve des motards du coin : leurs photos et leurs balades arriveront ici.'}
        </Text>
        <Button title="Trouver des motards" onPress={() => router.push('/riders')} />
        <Button
          title={friends.length ? 'Publier une story' : 'Ajouter des amis'}
          variant="secondary"
          onPress={() => router.push(friends.length ? '/story/new' : '/friends')}
        />
      </View>
    </View>
  );

  const openPerson = (p: FeedPerson) => router.push({ pathname: '/user/[id]', params: { id: p.id } });
  const openRide = (r: RideSummary) => router.push({ pathname: '/ride/[id]', params: { id: r.id } });

  const join = (r: RideSummary) =>
    confirmJoinRide(r.categories, myCategory, async () => {
      if (!userId) return;
      setJoiningId(r.id);
      try {
        await joinRide(r.id, userId, r.invited);
        await load();
      } catch (e) {
        Alert.alert('Oups', e instanceof Error ? e.message : String(e));
      } finally {
        setJoiningId(null);
      }
    });

  const renderItem = ({ item }: { item: FeedRow }) => {
    if (item.kind === 'suggestions') return carousel(item.slice);
    if (item.kind === 'news') return userId ? <NewsCard item={item.news} userId={userId} /> : null;
    if (item.kind === 'photo') {
      return (
        <View style={styles.card}>
          <Header people={[item.author]} text="a publié une photo" at={item.at} onPersonPress={openPerson} />
          <Pressable onPress={() => setViewing(item.photo)}>
            <Image source={{ uri: item.photo.url }} style={styles.photo} contentFit="cover" transition={150} />
          </Pressable>
          {!!item.photo.caption && <Text style={styles.caption}>{item.photo.caption}</Text>}
        </View>
      );
    }
    const r = item.ride;
    const full = r.maxParticipants !== null && r.participantsCount >= r.maxParticipants;
    const canJoin = !r.joined && r.status !== 'ended' && !full && (r.visibility !== 'private' || r.invited);
    const names = item.people.map((p) => `@${p.username}`);
    const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} et ${names.length - 2} autre(s)` : names.join(' et ');
    const verb =
      item.role === 'organise' ? 'organise une balade' : names.length > 1 ? 'participent à une balade' : 'participe à une balade';
    return (
      <View style={styles.card}>
        <Header people={item.people} text={verb} at={item.at} whoLabel={who} onPersonPress={openPerson} />
        <View style={styles.rideBox}>
          <View style={styles.rideFrame}>
            <RideCard
              ride={r}
              distanceFromMeM={null}
              fit={rideFitsCategory(r.categories, myCategory)}
              onPress={() => openRide(r)}
            />
          </View>
          {canJoin && (
            <Button
              title={r.invited ? 'Tu es invité · Je participe' : 'Je participe'}
              loading={joiningId === r.id}
              onPress={() => join(r)}
            />
          )}
          {r.joined && <Text style={styles.joined}>✓ Tu participes</Text>}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Mur</Text>
        <Pressable style={styles.findButton} onPress={() => router.push('/riders')} accessibilityLabel="Trouver des motards pour rouler">
          <Ionicons name="people" size={18} color={Colors.white} />
          <Text style={styles.findText}>Rouler ensemble</Text>
        </Pressable>
      </View>
      {/* Recherche : motards par pseudo, balades, lieux, événements */}
      <Pressable style={styles.searchBar} onPress={() => router.push('/search')} accessibilityRole="search" accessibilityLabel="Rechercher">
        <Ionicons name="search" size={20} color={Colors.textMuted} />
        <Text style={styles.searchPlaceholder}>Un motard, une balade, un spot…</Text>
      </Pressable>
      {/* Histoire de la moto (sur le web : onglet « Histoire ») */}
      {Platform.OS !== 'web' && (
        <Pressable style={styles.historyBanner} onPress={() => router.push('/history')} accessibilityRole="button">
          <Ionicons name="book-outline" size={24} color={Colors.accent} />
          <View style={styles.historyBody}>
            <Text style={styles.historyTitle}>Histoire de la moto</Text>
            <Text style={styles.historyText}>Des premiers deux-roues aux grandes marques : Honda, Ducati, Harley…</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.accent} />
        </Pressable>
      )}

      {!rows ? (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.muted}>Oups, le Mur n’a pas chargé. Vérifie ton réseau.</Text>
              <Button title="Réessayer" icon="refresh" variant="secondary" loading={refreshing} onPress={load} />
            </>
          ) : (
            <ActivityIndicator color={Colors.accent} />
          )}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                load();
                refreshStories();
              }}
              colors={[Colors.accent]}
            />
          }
          ListHeaderComponent={
            <>
              <StoryRow />
              {error && (
                <View style={styles.inlineErrorBox}>
                  <Text style={styles.inlineError}>Oups, les publications de tes potes n’ont pas chargé.</Text>
                  <Button title="Réessayer" icon="refresh" variant="secondary" loading={refreshing} onPress={load} />
                </View>
              )}
              {/* Mur sans publication mais avec des actus : l'invitation reste en haut */}
              {wallEmpty && !error && !!items?.length && emptyWall}
              {showNews && newsError && !news.length && (
                <Pressable style={styles.newsRetry} onPress={loadNews} accessibilityRole="button">
                  <Ionicons name="refresh" size={18} color={Colors.accent} />
                  <Text style={styles.newsRetryText}>Oups, les actus moto n’ont pas chargé. Réessayer</Text>
                </Pressable>
              )}
            </>
          }
          ListEmptyComponent={error ? null : emptyWall}
        />
      )}

      <PhotoViewer
        photo={viewing}
        onClose={() => setViewing(null)}
        onAuthorPress={(p) => {
          setViewing(null);
          const author = friends.find((f) => f.id === p.ownerId);
          if (author) openPerson(author);
        }}
      />
    </SafeAreaView>
  );
}

function Header({
  people,
  text,
  at,
  whoLabel,
  onPersonPress,
}: {
  people: FeedPerson[];
  text: string;
  at: string;
  whoLabel?: string;
  onPersonPress: (p: FeedPerson) => void;
}) {
  const styles = useStyles();
  const first = people[0];
  return (
    <Pressable style={styles.header} onPress={() => onPersonPress(first)}>
      <View style={styles.avatars}>
        {people.slice(0, 3).map((p, i) => (
          <Image key={p.id} source={{ uri: p.avatarUrl }} style={[styles.avatar, i > 0 && { marginLeft: -12 }]} />
        ))}
      </View>
      <View style={styles.headerText}>
        <Text style={styles.headerLine} numberOfLines={2}>
          <Text style={styles.username}>{whoLabel ?? `@${first.username}`}</Text> {text}
        </Text>
        <Text style={styles.time}>{timeAgo(at)}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchPlaceholder: { flex: 1, fontSize: Type.body, color: Colors.textMuted },
  historyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  historyEmoji: { fontSize: Type.title },
  historyBody: { flex: 1, gap: 2 },
  historyTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  historyText: { fontSize: Type.small, color: Colors.textMuted },
  screen: { flex: 1, backgroundColor: Colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  findButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  findText: { color: Colors.white, fontWeight: '800', fontSize: Type.body },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  list: { paddingBottom: 32, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  emptyWrap: { gap: 16 },
  inlineErrorBox: { gap: 8, marginBottom: 12 },
  inlineError: { color: Colors.danger, textAlign: 'center' },
  newsRetry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 12 },
  newsRetryText: { color: Colors.accent, fontWeight: '700' },
  empty: { alignItems: 'stretch', gap: 12, padding: 32 },
  emptyTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  card: { backgroundColor: Colors.surface, paddingVertical: 12, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  avatars: { flexDirection: 'row' },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: Colors.surface, backgroundColor: Colors.border },
  headerText: { flex: 1 },
  headerLine: { fontSize: Type.body, color: Colors.text },
  username: { fontWeight: '800' },
  time: { fontSize: Type.small, color: Colors.textMuted },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: Colors.border },
  caption: { fontSize: Type.body, color: Colors.text, paddingHorizontal: 12, lineHeight: 21 },
  rideBox: { paddingHorizontal: 12, gap: 12 },
  rideFrame: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, overflow: 'hidden' },
  joined: { color: Colors.accent, fontWeight: '700', textAlign: 'center' },
}));
