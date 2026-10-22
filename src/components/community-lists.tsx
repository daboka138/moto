import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, SectionList, Text, View } from 'react-native';

import { EventCard, PlaceCard } from '@/components/community-cards';
import { LeafletMap } from '@/components/leaflet-map';
import { PlaceIcon } from '@/components/map-icon';
import { Chip } from '@/components/ui';
import { makeStyles, Type, useColors } from '@/constants/theme';
import { distanceM, type LatLng } from '@/lib/geo';
import { eventKindInfo, EVENT_KINDS, fetchPastEvents, groupByDay, type EventKind, type MotoEvent } from '@/lib/events';
import { useSession } from '@/lib/session';
import { fetchTopRoads, PLACE_KINDS, type CommunityPlace, type PlaceKind, type RoadNearby } from '@/lib/places';
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

/** Agenda moto (onglet Sorties) : à venir par date ou sur la carte, filtres type / distance, passés */
export function EventsList({ me }: { me: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id;
  const { events, error, refreshing, refresh } = useEvents();
  const [kinds, setKinds] = useState<EventKind[]>([]);
  const [mine, setMine] = useState(false);
  const [radiusKm, setRadiusKm] = useState(readRadius);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [past, setPast] = useState(false);
  const [pastEvents, setPastEvents] = useState<MotoEvent[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Archives : chargées à la première demande
  useEffect(() => {
    if (!past || pastEvents || !userId) return;
    let cancelled = false;
    fetchPastEvents(userId)
      .then((l) => !cancelled && setPastEvents(l))
      .catch(() => !cancelled && setPastEvents([]));
    return () => {
      cancelled = true;
    };
  }, [past, pastEvents, userId]);

  // Sans position connue, pas de filtre de distance
  const radius = me ? radiusKm : null;
  const source = past ? pastEvents : events;
  const filtered = source?.filter(
    (e) =>
      (!kinds.length || kinds.includes(e.kind)) &&
      (!mine || e.myStatus) &&
      (radius === null || e.myStatus || distanceM(me!, e.place) <= radius * 1000),
  );
  const chooseRadius = (km: number | null) => {
    setRadiusKm(km);
    writeRadius(km);
  };
  const selectedEvent = filtered?.find((e) => e.id === selected) ?? null;

  const empty = (
    <View style={styles.empty}>
      <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
      <Text style={styles.muted}>
        {past
          ? 'Aucun événement passé avec ces filtres.'
          : radius !== null
            ? `Aucun événement à moins de ${radius} km. Élargis le rayon ou crée le premier rasso !`
            : 'Aucun événement à venir. Crée le premier rasso !'}
      </Text>
      {!past && <Chip label="Créer un événement" icon="add" selected onPress={() => router.push('/event/new')} />}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        <Chip label="Liste" icon="list" selected={view === 'list'} onPress={() => setView('list')} />
        <Chip label="Carte" icon="map-outline" selected={view === 'map'} onPress={() => setView('map')} />
        <View style={styles.separator} />
        <Chip label="Mes inscriptions" selected={mine} onPress={() => setMine(!mine)} />
        <Chip label="Passés" icon="archive-outline" selected={past} onPress={() => setPast(!past)} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
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
          {error && !past ? <Text style={styles.muted}>Oups, les événements n’ont pas chargé. Vérifie ton réseau.</Text> : <ActivityIndicator color={Colors.accent} />}
        </View>
      ) : view === 'map' ? (
        <View style={{ flex: 1 }}>
          <LeafletMap
            position={me ? { ...me, accuracy: null } : null}
            pins={filtered.map((e) => ({
              id: e.id,
              kind: 'event' as const,
              cluster: true,
              label: `${eventKindInfo(e.kind).emoji} ${new Date(e.startsAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}`,
              latitude: e.place.latitude,
              longitude: e.place.longitude,
            }))}
            onPinPress={setSelected}
            onMapPress={() => setSelected(null)}
            fitPoints={filtered.length ? filtered.map((e) => e.place) : undefined}
          />
          {selectedEvent ? (
            <View style={styles.mapCard}>
              <EventCard
                event={selectedEvent}
                distanceM={me ? distanceM(me, selectedEvent.place) : null}
                onPress={() => openEvent(selectedEvent)}
                onClose={() => setSelected(null)}
              />
            </View>
          ) : (
            filtered.length === 0 && <View style={styles.mapCard}>{empty}</View>
          )}
        </View>
      ) : (
        <SectionList
          sections={past ? [{ title: 'Événements passés', data: filtered }] : groupByDay(filtered)}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.accent]} />}
          renderSectionHeader={({ section }) => <Text style={styles.dayTitle}>{section.title}</Text>}
          renderItem={({ item }) => <EventCard event={item} distanceM={me ? distanceM(me, item.place) : null} onPress={() => openEvent(item)} />}
          ListEmptyComponent={empty}
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
            leading={<PlaceIcon kind={k.value} size={18} />}
            label={k.label}
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
          {error ? <Text style={styles.muted}>Oups, les spots n’ont pas chargé. Vérifie ton réseau.</Text> : <ActivityIndicator color={Colors.accent} />}
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
              <Text style={styles.muted}>Aucun spot par ici. Partage ton café motard, ton garage ou ta route préférée !</Text>
              <Chip label="Ajouter un spot" icon="add" selected onPress={() => router.push('/place/new')} />
            </View>
          }
        />
      )}
    </View>
  );
}

// « Top routes près de moi » : rayon mémorisé sur le téléphone
const ROADS_RADIUS_KEY = 'moto.roads.radiusKm';
const ROAD_RADII = [25, 50, 100, 200] as const;

function readRoadsRadius(): number {
  try {
    const n = Number(localStorage.getItem(ROADS_RADIUS_KEY));
    return ROAD_RADII.includes(n as (typeof ROAD_RADII)[number]) ? n : 50;
  } catch {
    return 50;
  }
}

/** Routes plaisir notées par la commu autour de moi, les mieux notées d'abord (onglet Sorties) */
export function RoadsList({ me }: { me: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const [radiusKm, setRadiusKm] = useState(readRoadsRadius);
  const [roads, setRoads] = useState<RoadNearby[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lat = me?.latitude;
  const lng = me?.longitude;

  const load = useCallback(async () => {
    if (lat === undefined || lng === undefined) return;
    try {
      const list = await fetchTopRoads({ latitude: lat, longitude: lng }, radiusKm);
      setRoads(list);
      setError(false);
    } catch (e) {
      console.warn('Routes indisponibles', e);
      setError(true);
    }
  }, [lat, lng, radiusKm]);

  useEffect(() => {
    let cancelled = false;
    if (lat !== undefined && lng !== undefined) {
      fetchTopRoads({ latitude: lat, longitude: lng }, radiusKm)
        .then((list) => {
          if (cancelled) return;
          setRoads(list);
          setError(false);
        })
        .catch((e) => {
          console.warn('Routes indisponibles', e);
          if (!cancelled) setError(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [lat, lng, radiusKm]);

  const chooseRadius = (km: number) => {
    setRadiusKm(km);
    setRoads(null);
    try {
      localStorage.setItem(ROADS_RADIUS_KEY, String(km));
    } catch {
      // pas grave
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        <Text style={styles.radiusLabel}>Top routes à moins de :</Text>
        {ROAD_RADII.map((km) => (
          <Chip key={km} label={`${km} km`} selected={radiusKm === km} onPress={() => chooseRadius(km)} />
        ))}
      </ScrollView>
      {!me ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Autorise la localisation pour voir les belles routes autour de toi.</Text>
        </View>
      ) : !roads ? (
        <View style={styles.center}>
          {error ? <Text style={styles.muted}>Oups, les routes n’ont pas chargé. Vérifie ton réseau.</Text> : <ActivityIndicator color={Colors.accent} />}
        </View>
      ) : (
        <FlatList
          data={roads}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              colors={[Colors.accent]}
            />
          }
          ListHeaderComponent={
            <Text style={styles.note}>Notées par la commu : virages, revêtement, paysage, trafic. Toujours dans le respect du code de la route.</Text>
          }
          renderItem={({ item }) => <PlaceCard place={item} distanceM={item.distanceM} onPress={() => openPlace(item)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="git-branch-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.muted}>Aucune route notée à moins de {radiusKm} km. Partage ta route préférée !</Text>
              <Chip label="Noter une route" icon="add" selected onPress={() => router.push('/road/new')} />
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  note: { fontSize: Type.small, color: Colors.textMuted, marginBottom: 4 },
  dayTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.text, marginTop: 8, textTransform: 'capitalize' },
  mapCard: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  filterBar: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  radiusLabel: { fontSize: Type.small, fontWeight: '700', color: Colors.textMuted },
  separator: { width: 1, height: 24, backgroundColor: Colors.border, marginHorizontal: 4 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 48, paddingHorizontal: 24 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
}));
