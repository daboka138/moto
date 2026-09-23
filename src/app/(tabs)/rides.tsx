import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RideCard } from '@/components/ride-card';
import { Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { distanceM, type LatLng } from '@/lib/geo';
import { photoUrl } from '@/lib/profile';
import { RIDE_LEVELS, type RideLevel, type RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { useUpcomingRides } from '@/lib/use-rides';
// DEMO
import { useDemoMode } from '@/demo/demo-context';
import { demoRides } from '@/demo/rides';

type DateFilter = 'all' | 'today' | 'week' | 'month';
const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'Toutes les dates' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: '7 jours' },
  { value: 'month', label: '30 jours' },
];
const DISTANCE_FILTERS: (number | null)[] = [null, 10, 25, 50, 100];

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
  const Colors = useColors();
  const styles = useStyles();
  const { session, profile } = useSession();
  const { rides, error, refreshing, refresh } = useUpcomingRides();
  const [me, setMe] = useState<LatLng | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [levels, setLevels] = useState<RideLevel[]>([]);

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((p) => p && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
      .catch(() => {});
  }, []);

  // DEMO : balades des faux motards mélangées aux vraies
  const demo = useDemoMode();
  const demoList = demo.enabled
    ? demoRides(demo, {
        id: session?.user.id ?? 'me',
        username: profile?.username ?? 'moi',
        avatarUrl: profile ? photoUrl(profile.avatar_path) : '',
      })
    : [];

  const all = rides ? [...rides, ...demoList].sort((a, b) => a.meetingAt.localeCompare(b.meetingAt)) : null;
  const distanceOf = (r: RideSummary) => (me ? distanceM(me, r.meeting) : null);
  const filtered = all?.filter((r) => {
    if (!matchesDate(r, dateFilter)) return false;
    if (levels.length && !levels.includes(r.level)) return false;
    const d = distanceOf(r);
    if (maxKm !== null && d !== null && d > maxKm * 1000) return false;
    return true;
  });

  const open = (r: RideSummary) =>
    r.isDemo
      ? router.push({ pathname: '/demo-ride/[id]', params: { id: r.id } })
      : router.push({ pathname: '/ride/[id]', params: { id: r.id } });

  const toggleLevel = (l: RideLevel) => setLevels((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Balades</Text>
        <Pressable style={styles.create} onPress={() => router.push('/ride/new')}>
          <Ionicons name="add" size={20} color={Colors.white} />
          <Text style={styles.createText}>Créer</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
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
          renderItem={({ item }) => <RideCard ride={item} distanceFromMeM={distanceOf(item)} onPress={() => open(item)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.muted}>Aucune balade ne correspond à ces filtres.</Text>
            </View>
          }
        />
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
  title: { fontSize: 28, fontWeight: '900', color: Colors.text },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  filters: { gap: 8, paddingVertical: 8 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  separator: { width: 1, height: 24, backgroundColor: Colors.border, marginHorizontal: 4 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
}));
