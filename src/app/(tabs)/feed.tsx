import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoViewer } from '@/components/photo-viewer';
import { RideCard } from '@/components/ride-card';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { photoItems, rideItems, sortFeed, timeAgo, type FeedItem, type FeedPerson } from '@/lib/feed';
import { fetchFriends } from '@/lib/friends';
import { photoUrl } from '@/lib/profile';
import { fetchUpcomingRides, joinRide, type RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { fetchPhotosOf, type WallPhoto } from '@/lib/wall';
// DEMO
import { useDemoMode } from '@/demo/demo-context';
import { demoPhotosOf } from '@/demo/photos';
import { DEMO_RIDERS } from '@/demo/riders';
import { demoRides } from '@/demo/rides';

type RealFeed = { userId: string; friends: FeedPerson[]; photos: WallPhoto[]; rides: RideSummary[] };

/** Onglet Mur : fil d'actualité de mes amis. */
export default function FeedScreen() {
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const [real, setReal] = useState<RealFeed | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [viewing, setViewing] = useState<WallPhoto | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
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
    } catch (e) {
      console.warn('Chargement du fil impossible', e);
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // DEMO : amis, photos et balades des faux motards
  const demo = useDemoMode();
  const demoFriends: FeedPerson[] = demo.enabled
    ? DEMO_RIDERS.filter((r) => demo.friendIds.includes(r.id)).map((r) => ({
        id: r.id,
        username: r.username,
        avatarUrl: r.avatar_path,
        isDemo: true,
      }))
    : [];
  const me = { id: userId ?? 'me', username: profile?.username ?? 'moi', avatarUrl: profile ? photoUrl(profile.avatar_path) : '' };
  const demoItems = demo.enabled
    ? [
        ...photoItems(demoFriends.flatMap((f) => demoPhotosOf(f.username)), demoFriends),
        ...rideItems(demoRides(demo, me), demoFriends),
      ]
    : [];

  const current = real && real.userId === userId ? real : null;
  const friends = [...(current?.friends ?? []), ...demoFriends];
  const items = current
    ? sortFeed([...photoItems(current.photos, current.friends), ...rideItems(current.rides, current.friends), ...demoItems])
    : null;

  const openPerson = (p: FeedPerson) =>
    p.isDemo
      ? router.push({ pathname: '/demo-rider/[id]', params: { id: p.id } })
      : router.push({ pathname: '/user/[id]', params: { id: p.id } });

  const openRide = (r: RideSummary) =>
    r.isDemo
      ? router.push({ pathname: '/demo-ride/[id]', params: { id: r.id } })
      : router.push({ pathname: '/ride/[id]', params: { id: r.id } });

  const join = (r: RideSummary) =>
    Alert.alert(
      'Participer à la balade',
      'Pendant la balade, les autres participants verront ta position sur la carte, même si tu es en mode fantôme.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Je participe',
          onPress: async () => {
            if (r.isDemo) return demo.joinRide(r.id);
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
          },
        },
      ],
    );

  const renderItem = ({ item }: { item: FeedItem }) => {
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
            <RideCard ride={r} distanceFromMeM={null} onPress={() => openRide(r)} />
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
      <Text style={styles.title}>Mur</Text>

      {!items ? (
        <View style={styles.center}>
          {error ? <Text style={styles.muted}>Impossible de charger le fil.</Text> : <ActivityIndicator color={Colors.accent} />}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} colors={[Colors.accent]} />}
          ListHeaderComponent={
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friends}>
              <Pressable style={styles.friend} onPress={() => router.push('/friends')}>
                <View style={[styles.friendAvatar, styles.addFriend]}>
                  <Ionicons name="person-add" size={24} color={Colors.accent} />
                </View>
                <Text style={styles.friendName}>Ajouter</Text>
              </Pressable>
              {friends.map((f) => (
                <Pressable key={f.id} style={styles.friend} onPress={() => openPerson(f)}>
                  <Image source={{ uri: f.avatarUrl }} style={styles.friendAvatar} />
                  <Text style={styles.friendName} numberOfLines={1}>
                    {f.username}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="newspaper-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.muted}>
                Rien pour l’instant. Ajoute des amis pour voir leurs photos et leurs balades ici.
              </Text>
            </View>
          }
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  list: { paddingBottom: 32, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  friends: { paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  friend: { alignItems: 'center', width: 68, gap: 4 },
  friendAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: Colors.accent,
    backgroundColor: Colors.border,
  },
  addFriend: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft, borderStyle: 'dashed' },
  friendName: { fontSize: 12, color: Colors.text, maxWidth: 68 },
  card: { backgroundColor: Colors.surface, paddingVertical: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  avatars: { flexDirection: 'row' },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: Colors.surface, backgroundColor: Colors.border },
  headerText: { flex: 1 },
  headerLine: { fontSize: 15, color: Colors.text },
  username: { fontWeight: '800' },
  time: { fontSize: 12, color: Colors.textMuted },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: Colors.border },
  caption: { fontSize: 15, color: Colors.text, paddingHorizontal: 12, lineHeight: 21 },
  rideBox: { paddingHorizontal: 12, gap: 10 },
  rideFrame: { borderWidth: 1, borderColor: Colors.border, borderRadius: 18, overflow: 'hidden' },
  joined: { color: Colors.accent, fontWeight: '700', textAlign: 'center' },
});
