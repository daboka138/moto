import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import { Chip, SmallButton } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  EMPTY_FILTERS,
  fetchDiscoverable,
  findRiders,
  matchesFilters,
  setDiscoverable,
  type RiderFilters,
  type RiderResult,
} from '@/lib/discovery';
import { relationWith, sendFriendRequest } from '@/lib/friends';
import type { LatLng } from '@/lib/geo';
import { AVAILABILITIES, categoryInfo, MOTO_CATEGORIES, PACES, paceInfo } from '@/lib/moto';
import { photoUrl, RIDING_STYLES } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';
// DEMO
import { useDemoMode } from '@/demo/demo-context';
import { demoRiderResults } from '@/demo/discovery';

const DISTANCES: (number | null)[] = [10, 25, 50, 100, null];
const LICENSE_YEARS: (number | null)[] = [null, 1, 3, 5, 10];

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Trouver des motards pour rouler ensemble (façon site de rencontre, anonymat respecté). */
export default function RidersScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { state: friends, refresh: refreshFriends, userId } = useFriends();
  const demo = useDemoMode();
  const [me, setMe] = useState<LatLng | null>(null);
  const [filters, setFilters] = useState<RiderFilters>(EMPTY_FILTERS);
  const [results, setResults] = useState<{ key: string; riders: RiderResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discoverable, setDiscoverableState] = useState<boolean | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then(async (p) => p ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })))
      .then((p) => p && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
      .catch(() => setError('Position indisponible : active la localisation pour chercher autour de toi.'));
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchDiscoverable(userId)
      .then(setDiscoverableState)
      .catch(() => setDiscoverableState(false));
  }, [userId]);

  // Ma zone suit mes déplacements (arrondie à ~5 km par le serveur)
  useEffect(() => {
    if (userId && me && discoverable) setDiscoverable(userId, true, me).catch(() => {});
  }, [userId, me, discoverable]);

  const key = JSON.stringify(filters);
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    findRiders(me, filters, photoUrl)
      .then((riders) => !cancelled && setResults({ key, riders }))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, key]);

  const set = <K extends keyof RiderFilters>(k: K, v: RiderFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const currentYear = new Date().getFullYear();
  const demoResults = demo.enabled ? demoRiderResults().filter((r) => matchesFilters(r, filters, currentYear)) : [];
  const shown =
    results && results.key === key
      ? [...results.riders, ...demoResults].sort((a, b) => a.distanceKm - b.distanceKm)
      : null;

  const enableDiscovery = async () => {
    if (!userId) return;
    try {
      await setDiscoverable(userId, true, me);
      setDiscoverableState(true);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const open = (r: RiderResult) =>
    r.isDemo
      ? router.push({ pathname: '/demo-rider/[id]', params: { id: r.id } })
      : router.push({ pathname: '/user/[id]', params: { id: r.id } });

  const friendButton = (r: RiderResult) => {
    if (r.isDemo) {
      if (demo.friendIds.includes(r.id)) return <SmallButton title="Ami ✓" variant="secondary" />;
      return <SmallButton title="Ajouter en ami" onPress={() => demo.addFriend(r.id)} />;
    }
    if (!userId) return null;
    const relation = relationWith(friends, userId, r.id);
    if (relation === 'friend') return <SmallButton title="Ami ✓" variant="secondary" />;
    if (relation === 'outgoing') return <SmallButton title="Demande envoyée" variant="secondary" />;
    if (relation === 'incoming') return <SmallButton title="Répondre" onPress={() => router.push('/friends')} />;
    return (
      <SmallButton
        title="Ajouter en ami"
        disabled={busyId === r.id}
        onPress={async () => {
          setBusyId(r.id);
          try {
            await sendFriendRequest(userId, r.id);
            await refreshFriends();
          } catch (e) {
            Alert.alert('Oups', e instanceof Error ? e.message : String(e));
          } finally {
            setBusyId(null);
          }
        }}
      />
    );
  };

  const header = (
    <View style={styles.header}>
      {discoverable === false && (
        <View style={styles.optIn}>
          <Ionicons name="eye-off-outline" size={22} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optInTitle}>Tu n’apparais pas dans la recherche</Text>
            <Text style={styles.muted}>
              Les autres ne verront que ton pseudo, ta moto et une distance approximative (jamais ta position).
            </Text>
          </View>
          <SmallButton title="Apparaître" onPress={enableDiscovery} />
        </View>
      )}

      <Pressable style={styles.filtersToggle} onPress={() => setShowFilters(!showFilters)}>
        <Ionicons name="options" size={20} color={Colors.accent} />
        <Text style={styles.filtersTitle}>Filtres</Text>
        <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </Pressable>

      {showFilters && (
        <View style={styles.filters}>
          <FilterRow label="Distance">
            {DISTANCES.map((km) => (
              <Chip key={String(km)} label={km === null ? 'Partout' : `< ${km} km`} selected={filters.maxKm === km} onPress={() => set('maxKm', km)} />
            ))}
          </FilterRow>
          <FilterRow label="Moto">
            {MOTO_CATEGORIES.map((c) => (
              <Chip
                key={c.value}
                label={c.short}
                selected={filters.categories.includes(c.value)}
                onPress={() => set('categories', toggle(filters.categories, c.value))}
              />
            ))}
          </FilterRow>
          <FilterRow label="Style">
            {RIDING_STYLES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                selected={filters.styles.includes(s.value)}
                onPress={() => set('styles', toggle(filters.styles, s.value))}
              />
            ))}
          </FilterRow>
          <FilterRow label="Rythme">
            {PACES.map((p) => (
              <Chip
                key={p.value}
                label={p.label}
                selected={filters.paces.includes(p.value)}
                onPress={() => set('paces', toggle(filters.paces, p.value))}
              />
            ))}
          </FilterRow>
          <FilterRow label="Permis">
            {LICENSE_YEARS.map((y) => (
              <Chip
                key={String(y)}
                label={y === null ? 'Tous' : `${y} an${y > 1 ? 's' : ''} et +`}
                selected={filters.minLicenseYears === y}
                onPress={() => set('minLicenseYears', y)}
              />
            ))}
          </FilterRow>
          <FilterRow label="Dispo">
            {AVAILABILITIES.map((a) => (
              <Chip
                key={a.value}
                label={a.label}
                selected={filters.availability.includes(a.value)}
                onPress={() => set('availability', toggle(filters.availability, a.value))}
              />
            ))}
          </FilterRow>
        </View>
      )}
      {shown && <Text style={styles.count}>{shown.length} motard{shown.length > 1 ? 's' : ''} trouvé{shown.length > 1 ? 's' : ''}</Text>}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={shown ?? []}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.empty}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !shown ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Text style={styles.muted}>Personne ne correspond à ces filtres pour l’instant. Élargis la distance ?</Text>
          )}
        </View>
      }
      renderItem={({ item: r }) => (
        <Pressable style={styles.card} onPress={() => open(r)}>
          <Image source={{ uri: r.avatarUrl }} style={styles.avatar} contentFit="cover" />
          <View style={styles.cardBody}>
            <View style={styles.nameRow}>
              <Text style={styles.username} numberOfLines={1}>
                @{r.username}
              </Text>
              {r.isDemo && <Text style={styles.demo}>démo</Text>}
            </View>
            {r.moto && (
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="motorbike" size={16} color={Colors.accent} />
                <Text style={styles.meta} numberOfLines={1}>
                  {r.moto.brand} {r.moto.model}
                </Text>
                {r.moto.category && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{categoryInfo(r.moto.category).short}</Text>
                  </View>
                )}
              </View>
            )}
            <Text style={styles.muted} numberOfLines={1}>
              {[r.city, `~${r.distanceKm} km`, r.pace ? `rythme ${paceInfo(r.pace).label.toLowerCase()}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {r.ridingStyles.length > 0 && (
              <Text style={styles.ridingStyles} numberOfLines={1}>
                {r.ridingStyles.map((s) => RIDING_STYLES.find((x) => x.value === s)?.label ?? s).join(' · ')}
              </Text>
            )}
            <View style={styles.action}>{friendButton(r)}</View>
          </View>
        </Pressable>
      )}
    />
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  header: { gap: 12 },
  optIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accentSoft,
    borderRadius: 16,
    padding: 12,
  },
  optInTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  filtersToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filtersTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text },
  filters: { backgroundColor: Colors.surface, borderRadius: 18, padding: 12, gap: 12 },
  filterRow: { gap: 6 },
  filterLabel: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  count: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  empty: { alignItems: 'center', padding: 24 },
  error: { color: Colors.danger, textAlign: 'center' },
  muted: { fontSize: 13, color: Colors.textMuted },
  card: { flexDirection: 'row', gap: 12, backgroundColor: Colors.surface, borderRadius: 18, padding: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: Colors.accent, backgroundColor: Colors.border },
  cardBody: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { fontSize: 18, fontWeight: '900', color: Colors.text, flexShrink: 1 },
  demo: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 14, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  categoryBadge: { backgroundColor: Colors.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  categoryText: { color: Colors.accent, fontSize: 12, fontWeight: '800' },
  ridingStyles: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
  action: { alignItems: 'flex-start', marginTop: 4 },
}));
