import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubsList } from '@/components/clubs-list';
import { EventsList, PlacesList } from '@/components/community-lists';
import { RideCard } from '@/components/ride-card';
import { Chip } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { distanceM, type LatLng } from '@/lib/geo';
import { useCanUse } from '@/lib/features';
import { importGpx } from '@/lib/gpx-import';
import { categoryInfo, rideFitsCategory } from '@/lib/moto';
import { mainCategory } from '@/lib/profile';
import { RIDE_LEVELS, type RideLevel, type RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { useUpcomingRides } from '@/lib/use-rides';

type DateFilter = 'all' | 'today' | 'week' | 'month';
const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'Toutes les dates' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: '7 jours' },
  { value: 'month', label: '30 jours' },
];
const DISTANCE_FILTERS: (number | null)[] = [null, 10, 25, 50, 100];

/** Onglet Sorties : balades, événements, lieux motards, clubs */
type Segment = 'rides' | 'events' | 'places' | 'clubs';
const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'rides', label: 'Balades' },
  { value: 'events', label: 'Événements' },
  { value: 'places', label: 'Lieux' },
  { value: 'clubs', label: 'Clubs' },
];

function matchesDate(ride: RideSummary, filter: DateFilter) {
  if (filter === 'all') return true;
  const t = new Date(ride.meetingAt).getTime();
  if (filter === 'today') {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return t <= end.getTime();
  }
  const days = filter === 'week' ? 7 : 30;
  return t <= Date.now() + days * 24 * 3600 * 1000;
}

export default function RidesScreen() {
  const gpxOn = useCanUse('gpx');
  const loopOn = useCanUse('loop');
  const Colors = useColors();
  const styles = useStyles();
  const { profile } = useSession();
  const { rides, error, refreshing, refresh } = useUpcomingRides();
  const [me, setMe] = useState<LatLng | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [levels, setLevels] = useState<RideLevel[]>([]);
  // Balades avec au moins une place passager libre
  const [withSeats, setWithSeats] = useState(false);
  // Filtre automatique sur la catégorie de ma moto principale (désactivable : « Tout voir »)
  const myCategory = mainCategory(profile);
  const [onlyMine, setOnlyMine] = useState(true);
  const [segment, setSegment] = useState<Segment>('rides');

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((p) => p && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
      .catch(() => {});
  }, []);

  const all = rides ? [...rides].sort((a, b) => a.meetingAt.localeCompare(b.meetingAt)) : null;
  const distanceOf = (r: RideSummary) => (me ? distanceM(me, r.meeting) : null);
  const filtered = all?.filter((r) => {
    if (!matchesDate(r, dateFilter)) return false;
    if (levels.length && !levels.includes(r.level)) return false;
    if (withSeats && r.passengerSeats === 0) return false;
    if (onlyMine && myCategory && !r.categories.includes(myCategory)) return false;
    const d = distanceOf(r);
    if (maxKm !== null && d !== null && d > maxKm * 1000) return false;
    return true;
  });

  const open = (r: RideSummary) => router.push({ pathname: '/ride/[id]', params: { id: r.id } });

  const toggleLevel = (l: RideLevel) => setLevels((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sorties</Text>
        <View style={styles.headerButtons}>
            {segment === 'rides' && gpxOn && (
            <Pressable style={styles.gpx} onPress={importGpx} accessibilityLabel="Importer un fichier GPX">
              <Ionicons name="document-attach-outline" size={18} color={Colors.accent} />
              <Text style={styles.gpxText}>GPX</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.create}
            onPress={() => router.push(segment === 'rides' ? '/ride/new' : segment === 'events' ? '/event/new' : segment === 'clubs' ? '/club/new' : '/place/new')}>
            <Ionicons name="add" size={20} color={Colors.white} />
            <Text style={styles.createText}>{segment === 'places' ? 'Ajouter' : 'Créer'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.value}
            style={[styles.segment, segment === s.value && styles.segmentOn]}
            onPress={() => setSegment(s.value)}
            accessibilityState={{ selected: segment === s.value }}>
            <Text style={[styles.segmentText, segment === s.value && styles.segmentTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {segment === 'events' ? (
        <EventsList me={me} />
      ) : segment === 'places' ? (
        <PlacesList me={me} />
      ) : segment === 'clubs' ? (
        <ClubsList me={me} />
      ) : (
        <>
          <View style={styles.filters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {myCategory && (
                <>
                  <Chip
                    label={`Pour ma moto (${categoryInfo(myCategory).short})`}
                    selected={onlyMine}
                    onPress={() => setOnlyMine(true)}
                  />
                  <Chip label="Tout voir" selected={!onlyMine} onPress={() => setOnlyMine(false)} />
                  <View style={styles.separator} />
                </>
              )}
              {DATE_FILTERS.map((f) => (
                <Chip key={f.value} label={f.label} selected={dateFilter === f.value} onPress={() => setDateFilter(f.value)} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {DISTANCE_FILTERS.map((km) => (
                <Chip
                  key={String(km)}
                  label={km === null ? 'Toutes distances' : `< ${km} km`}
                  selected={maxKm === km}
                  onPress={() => setMaxKm(km)}
                />
              ))}
              <View style={styles.separator} />
              <Chip label="🏍️ Places passager" selected={withSeats} onPress={() => setWithSeats(!withSeats)} />
              <View style={styles.separator} />
              {RIDE_LEVELS.map((l) => (
                <Chip key={l.value} label={l.label} selected={levels.includes(l.value)} onPress={() => toggleLevel(l.value)} />
              ))}
            </ScrollView>
          </View>

          {!filtered ? (
            <View style={styles.center}>
              {error ? <Text style={styles.muted}>Impossible de charger les balades.</Text> : <ActivityIndicator color={Colors.accent} />}
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.accent]} />}
              ListHeaderComponent={
                !loopOn ? null : <Pressable style={({ pressed }) => [styles.loopCard, pressed && { opacity: 0.7 }]} onPress={() => router.push('/loop')}>
                  <Ionicons name="infinite" size={28} color={Colors.white} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.loopTitle}>Fais-moi une boucle</Text>
                    <Text style={styles.loopText}>2-3 boucles sinueuses au départ de ta position, selon ton temps.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={Colors.white} />
                </Pressable>
              }
              renderItem={({ item }) => (
                <RideCard
                  ride={item}
                  distanceFromMeM={distanceOf(item)}
                  fit={rideFitsCategory(item.categories, myCategory)}
                  onPress={() => open(item)}
                />
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
                  {all?.length ? (
                    <>
                      <Text style={styles.muted}>Aucune balade ne correspond à ces filtres.</Text>
                      {onlyMine && myCategory && (
                        <Chip label="Voir aussi les autres balades" onPress={() => setOnlyMine(false)} />
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.emptyTitle}>Aucune balade près de toi</Text>
                      <Text style={styles.muted}>Crée la première et invite tes potes, ou laisse l’app te tracer une boucle.</Text>
                      <Chip label="➕ Créer une balade" selected onPress={() => router.push('/ride/new')} />
                    </>
                  )}
                </View>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  createText: { color: Colors.white, fontWeight: '700', fontSize: Type.body },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segments: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 4,
    gap: 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.border,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  segmentOn: { backgroundColor: Colors.surface },
  segmentText: { fontSize: Type.body, fontWeight: '700', color: Colors.textMuted },
  segmentTextOn: { color: Colors.text },
  gpx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gpxText: { color: Colors.accent, fontWeight: '700', fontSize: Type.body },
  loopCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.accent, borderRadius: Radius.md, padding: 16 },
  loopTitle: { color: Colors.white, fontSize: Type.body, fontWeight: '900' },
  loopText: { color: Colors.white, fontSize: Type.small },
  filters: { gap: 8, paddingVertical: 8 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  separator: { width: 1, height: 24, backgroundColor: Colors.border, marginHorizontal: 4 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  muted: { color: Colors.textMuted, textAlign: 'center' },
}));
