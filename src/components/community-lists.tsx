import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';

import { EventCard, PlaceCard } from '@/components/community-cards';
import { Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { distanceM, type LatLng } from '@/lib/geo';
import { EVENT_KINDS, type EventKind, type MotoEvent } from '@/lib/events';
import { PLACE_KINDS, type CommunityPlace, type PlaceKind } from '@/lib/places';
import { useCommunityPlaces, useEvents } from '@/lib/use-community';

export const openEvent = (e: MotoEvent) => router.push({ pathname: '/event/[id]', params: { id: e.id } });
export const openPlace = (p: CommunityPlace) => router.push({ pathname: '/place/[id]', params: { id: p.id } });

// « Événements près de moi » : rayon mémorisé sur le téléphone (null = partout)
const RADIUS_KEY = 'moto.events.radiusKm';
const RADII = [25, 50, 100, 200] as const;

function readRadius(): number | null {
  try {
    const v = localStorage.getItem(RADIUS_KEY);
    if (v === 'all') return null;
    const n = Number(v);
    return RADII.includes(n as (typeof RADII)[number]) ? n : 100;
  } catch {
    return 100;
  }
}

function writeRadius(km: number | null) {
  try {
    localStorage.setItem(RADIUS_KEY, km === null ? 'all' : String(km));
  } catch {
    // pas grave
  }
}

/** Événements et rassemblements à venir (onglet Sorties) */
export function EventsList({ me }: { me: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const { events, error, refreshing, refresh } = useEvents();
  const [kinds, setKinds] = useState<EventKind[]>([]);
  const [mine, setMine] = useState(false);
  const [radiusKm, setRadiusKm] = useState(readRadius);
  // Sans position connue, pas de filtre de distance
  const radius = me ? radiusKm : null;
  const filtered = events?.filter(
    (e) =>
      (!kinds.length || kinds.includes(e.kind)) &&
      (!mine || e.myStatus) &&
      (radius === null || e.myStatus || distanceM(me!, e.place) <= radius * 1000),
  );
  const chooseRadius = (km: number | null) => {
    setRadiusKm(km);
    writeRadius(km);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        <Chip label="Mes inscriptions" selected={mine} onPress={() => setMine(!mine)} />
        <View style={styles.separator} />
        {EVENT_KINDS.map((k) => (
          <Chip
            key={k.value}
            label={`${k.emoji} ${k.label}`}
            selected={kinds.includes(k.value)}
            onPress={() => setKinds((ks) => (ks.includes(k.value) ? ks.filter((x) => x !== k.value) : [...ks, k.value]))}
          />
        ))}
      </ScrollView>
      {me && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
          <Text style={styles.radiusLabel}>Près de moi :</Text>
          {RADII.map((km) => (
            <Chip key={km} label={`${km} km`} selected={radiusKm === km} onPress={() => chooseRadius(km)} />
          ))}
          <Chip label="Partout" selected={radiusKm === null} onPress={() => chooseRadius(null)} />
        </ScrollView>
      )}
      {!filtered ? (
        <View style={styles.center}>
          {error ? <Text style={styles.muted}>Impossible de charger les événements.</Text> : <ActivityIndicator color={Colors.accent} />}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.accent]} />}
          renderItem={({ item }) => <EventCard event={item} distanceM={me ? distanceM(me, item.place) : null} onPress={() => openEvent(item)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.muted}>
                {radius !== null ? `Aucun événement à moins de ${radius} km. Élargis le rayon ou crée le premier rasso !` : 'Aucun événement à venir. Crée le premier rasso !'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/** Lieux motards autour de moi (onglet Sorties) */
export function PlacesList({ me }: { me: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const { places, error, refresh } = useCommunityPlaces(me);
  const [kinds, setKinds] = useState<PlaceKind[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const filtered = places
    ?.filter((p) => !kinds.length || kinds.includes(p.kind))
    .sort((a, b) => (me ? distanceM(me, a) - distanceM(me, b) : (b.rating ?? 0) - (a.rating ?? 0)));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        {PLACE_KINDS.map((k) => (
          <Chip
            key={k.value}
            label={`${k.emoji} ${k.label}`}
            selected={kinds.includes(k.value)}
            onPress={() => setKinds((ks) => (ks.includes(k.value) ? ks.filter((x) => x !== k.value) : [...ks, k.value]))}
          />
        ))}
      </ScrollView>
      {!me && !places ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Autorise la localisation pour voir les lieux autour de toi.</Text>
        </View>
      ) : !filtered ? (
        <View style={styles.center}>
          {error ? <Text style={styles.muted}>Impossible de charger les lieux.</Text> : <ActivityIndicator color={Colors.accent} />}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
              colors={[Colors.accent]}
            />
          }
          renderItem={({ item }) => <PlaceCard place={item} distanceM={me ? distanceM(me, item) : null} onPress={() => openPlace(item)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cafe-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.muted}>Aucun lieu par ici. Ajoute ton café biker, ton garage ou ta route préférée !</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  filterBar: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  radiusLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  separator: { width: 1, height: 24, backgroundColor: Colors.border, marginHorizontal: 4 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: 24 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
}));
