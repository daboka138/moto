import { Ionicons } from '@expo/vector-icons';
import { trackUsage } from '@/lib/usage';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard, PlaceCard } from '@/components/community-cards';
import { openEvent, openPlace } from '@/components/community-lists';
import { RideCard } from '@/components/ride-card';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { findRiders, EMPTY_FILTERS } from '@/lib/discovery';
import { useDrivingLock } from '@/lib/driving-lock';
import { acceptFriendRequest, relationWith, removeFriendship, sendFriendRequest } from '@/lib/friends';
import type { MotoEvent } from '@/lib/events';
import type { LatLng } from '@/lib/geo';
import {
  addToHistory,
  clearHistory,
  fold,
  MIN_QUERY,
  removeFromHistory,
  SEARCH_TABS,
  searchEvents,
  searchPlaces,
  searchRiders,
  searchRides,
  useSearchHistory,
  type FriendRelation,
  type RiderHit,
  type SearchTab,
} from '@/lib/global-search';
import type { CommunityPlace } from '@/lib/places';
import { photoUrl } from '@/lib/profile';
import type { RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { useFriends } from '@/lib/use-friends';

const DEBOUNCE_MS = 250;
const NEARBY_MAX = 12;

type Results =
  | { tab: 'riders'; items: RiderHit[] }
  | { tab: 'rides'; items: RideSummary[] }
  | { tab: 'places'; items: CommunityPlace[] }
  | { tab: 'events'; items: MotoEvent[] };

/**
 * Recherche : motards (pseudo uniquement), balades, lieux, événements. Pendant la frappe, sans
 * majuscules ni accents, dès 2 lettres. Barre vide : recherches récentes et motards près de moi.
 */
export default function SearchScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const params = useLocalSearchParams<{ tab?: SearchTab }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const { locked } = useDrivingLock();
  const { state: friends, refresh: refreshFriends } = useFriends();
  const history = useSearchHistory();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>(params.tab && SEARCH_TABS.some((t) => t.value === params.tab) ? params.tab : 'riders');
  const [results, setResults] = useState<{ key: string; results: Results; error: boolean } | null>(null);
  // Relations changées depuis cette liste (ajout, acceptation, annulation)
  const [relations, setRelations] = useState<Record<string, FriendRelation>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nearby, setNearby] = useState<RiderHit[] | null>(null);
  const [nearbyState, setNearbyState] = useState<'loading' | 'no-location' | 'ready'>('loading');

  const q = fold(query);
  const key = `${tab}:${q}`;

  // Recherche pendant la frappe (après une courte pause)
  useEffect(() => {
    if (q.length < MIN_QUERY || !userId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      trackUsage('search');
      try {
        let r: Results;
        if (tab === 'riders') r = { tab, items: await searchRiders(query) };
        else if (tab === 'rides') r = { tab, items: await searchRides(query, userId) };
        else if (tab === 'places') r = { tab, items: await searchPlaces(query) };
        else r = { tab, items: await searchEvents(query, userId) };
        if (!cancelled) setResults({ key, results: r, error: false });
      } catch (e) {
        console.warn('Recherche impossible', e);
        if (!cancelled) setResults({ key, results: { tab: 'riders', items: [] }, error: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId]);

  // Motards près de moi (opt-in « Trouver des motards » ; distance arrondie, jamais de position)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let near: LatLng | null = null;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === 'granted') {
          const last = await Location.getLastKnownPositionAsync().catch(() => null);
          const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
          near = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        }
      } catch {
        near = null;
      }
      if (!near) {
        if (!cancelled) setNearbyState('no-location');
        return;
      }
      const real = await findRiders(near, EMPTY_FILTERS, photoUrl).catch(() => []);
      if (cancelled) return;
      const list = real
        .filter((r) => r.id !== userId)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, NEARBY_MAX)
        .map<RiderHit>((r) => ({
          id: r.id,
          username: r.username,
          avatarUrl: r.avatarUrl,
          city: r.city,
          moto: r.moto ? `${r.moto.brand} ${r.moto.model}`.trim() : null,
          relation: 'none',
          distanceKm: r.distanceKm,
        }));
      setNearby(list);
      setNearbyState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const relationOf = (r: RiderHit): FriendRelation => {
    if (relations[r.id]) return relations[r.id];
    const known = userId ? relationWith(friends, userId, r.id) : 'none';
    return known === 'none' || known === 'self' ? r.relation : known;
  };

  const act = async (r: RiderHit) => {
    if (!userId) return;
    const rel = relationOf(r);
    if (rel === 'friend') return;
    const run = async (action: () => Promise<void>, next: FriendRelation) => {
      setBusyId(r.id);
      try {
        await action();
        setRelations((all) => ({ ...all, [r.id]: next }));
        refreshFriends();
      } catch (e) {
        Alert.alert('Oups', e instanceof Error ? e.message : String(e));
      } finally {
        setBusyId(null);
      }
    };
    if (rel === 'none') run(() => sendFriendRequest(userId, r.id), 'outgoing');
    else if (rel === 'incoming') run(() => acceptFriendRequest(userId, r.id), 'friend');
    else
      Alert.alert('Demande en attente', `Annuler ta demande d’ami à @${r.username} ?`, [
        { text: 'Non', style: 'cancel' },
        { text: 'Annuler la demande', style: 'destructive', onPress: () => run(() => removeFriendship(userId, r.id), 'none') },
      ]);
  };

  const remember = () => addToHistory(query);

  const openRider = (r: RiderHit) => {
    remember();
    router.push({ pathname: '/user/[id]', params: { id: r.id } });
  };

  const openRide = (r: RideSummary) => {
    remember();
    router.push({ pathname: '/ride/[id]', params: { id: r.id } });
  };

  const current = results?.key === key ? results : null;
  const searching = q.length >= MIN_QUERY;

  const renderRider = (r: RiderHit) => (
    <RiderRow key={r.id} rider={r} relation={relationOf(r)} busy={busyId === r.id} onPress={() => openRider(r)} onAction={() => act(r)} />
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.searchRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Retour">
          <Ionicons name="arrow-back" size={26} color={Colors.text} />
        </Pressable>
        <View style={styles.inputBox}>
          <Ionicons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            editable={!locked}
            placeholder={locked ? 'Saisie bloquée en roulant' : 'Pseudo, balade, lieu, événement…'}
            placeholderTextColor={Colors.textFaint}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={remember}
            maxLength={60}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer">
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={styles.tabs}>
        {SEARCH_TABS.map((t) => (
          <Pressable key={t.value} style={[styles.tab, tab === t.value && styles.tabOn]} onPress={() => setTab(t.value)}>
            <Text style={[styles.tabText, tab === t.value && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!searching ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {q.length === 1 && <Text style={styles.muted}>Encore une lettre…</Text>}
          {history.length > 0 && (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockTitle}>Recherches récentes</Text>
                <Pressable onPress={clearHistory} hitSlop={8}>
                  <Text style={styles.link}>Tout effacer</Text>
                </Pressable>
              </View>
              {history.map((h) => (
                <Pressable key={h} style={styles.historyRow} onPress={() => setQuery(h)}>
                  <Ionicons name="time-outline" size={20} color={Colors.textMuted} />
                  <Text style={styles.historyText} numberOfLines={1}>
                    {h}
                  </Text>
                  <Pressable onPress={() => removeFromHistory(h)} hitSlop={10} accessibilityLabel={`Retirer ${h}`}>
                    <Ionicons name="close" size={18} color={Colors.textMuted} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Motards près de toi</Text>
            {nearbyState === 'loading' ? (
              <ActivityIndicator color={Colors.accent} />
            ) : nearbyState === 'no-location' ? (
              <Text style={styles.muted}>Autorise la localisation pour voir les motards proches (seule une distance approximative est affichée).</Text>
            ) : nearby && nearby.length ? (
              nearby.map(renderRider)
            ) : (
              <Text style={styles.muted}>Personne de visible près de toi pour l’instant.</Text>
            )}
            <Text style={styles.hint}>
              Seuls les motards qui ont activé « Trouver des motards » apparaissent ici, avec une distance approximative.
            </Text>
          </View>
        </ScrollView>
      ) : !current ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : current.error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Recherche impossible pour le moment. Vérifie ta connexion.</Text>
        </View>
      ) : (
        <FlatList
          data={current.results.items as unknown[]}
          keyExtractor={(item) => (item as { id: string }).id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.empty}>Aucun résultat pour « {query.trim()} ».</Text>}
          renderItem={({ item }) => {
            const r = current.results;
            if (r.tab === 'riders') return renderRider(item as RiderHit);
            if (r.tab === 'rides') return <RideCard ride={item as RideSummary} distanceFromMeM={null} onPress={() => openRide(item as RideSummary)} />;
            if (r.tab === 'places')
              return (
                <PlaceCard
                  place={item as CommunityPlace}
                  onPress={() => {
                    remember();
                    openPlace(item as CommunityPlace);
                  }}
                />
              );
            return (
              <EventCard
                event={item as MotoEvent}
                onPress={() => {
                  remember();
                  openEvent(item as MotoEvent);
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const RELATION_LABELS: Record<FriendRelation, string> = {
  none: 'Ajouter en ami',
  outgoing: 'En attente',
  incoming: 'Accepter',
  friend: 'Amis',
};

function RiderRow({
  rider,
  relation,
  busy,
  onPress,
  onAction,
}: {
  rider: RiderHit;
  relation: FriendRelation;
  busy: boolean;
  onPress: () => void;
  onAction: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const primary = relation === 'none' || relation === 'incoming';
  const details = [rider.city, rider.moto, rider.distanceKm !== undefined ? `~${rider.distanceKm} km` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable style={styles.rider} onPress={onPress}>
      <Image source={{ uri: rider.avatarUrl }} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.username} numberOfLines={1}>
          @{rider.username}
        </Text>
        {!!details && (
          <Text style={styles.details} numberOfLines={1}>
            {details}
          </Text>
        )}
      </View>
      <Pressable
        style={[styles.relation, primary ? styles.relationPrimary : styles.relationSecondary]}
        onPress={onAction}
        disabled={busy || relation === 'friend'}
        hitSlop={6}
        accessibilityLabel={RELATION_LABELS[relation]}>
        {busy ? (
          <ActivityIndicator size="small" color={primary ? Colors.white : Colors.accent} />
        ) : (
          <>
            {relation === 'friend' && <Ionicons name="checkmark" size={14} color={Colors.text} />}
            <Text style={[styles.relationText, primary && { color: Colors.white }]}>{RELATION_LABELS[relation]}</Text>
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: Type.body, color: Colors.text, paddingVertical: 12 },
  tabsBar: { flexGrow: 0 },
  tabs: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  tabOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabText: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  tabTextOn: { color: Colors.white },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: Type.body, color: Colors.textMuted },
  hint: { fontSize: Type.small, color: Colors.textMuted },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingTop: 32 },
  block: { gap: 12 },
  blockHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  link: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  historyText: { flex: 1, fontSize: Type.body, color: Colors.text },
  rider: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border },
  username: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  details: { fontSize: Type.small, color: Colors.textMuted },
  relation: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minWidth: 92, justifyContent: 'center' },
  relationPrimary: { backgroundColor: Colors.accent },
  relationSecondary: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  relationText: { fontSize: Type.small, fontWeight: '800', color: Colors.text },
}));
