import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { TripStatsGrid } from '@/components/trip-summary';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { buildGpx, gpxFileName } from '@/lib/gpx';
import { canUse } from '@/lib/features';
import { saveGpxFile } from '@/lib/gpx-file';
import { shortDistance } from '@/lib/navigation';
import { fetchRecentRideOutings } from '@/lib/outings';
import { clearTrips, deleteTrip, readTrack, useTrips, type TripSummary } from '@/lib/trips';

/** Mes trajets : résumés des navigations terminées (gardés sur le téléphone). */
export default function TripsScreen() {
  const styles = useStyles();
  const trips = useTrips();
  const totalM = trips.reduce((sum, t) => sum + t.distanceM, 0);

  const confirmClear = () =>
    Alert.alert('Effacer l’historique', 'Tous tes trajets enregistrés seront supprimés de ce téléphone.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Tout effacer', style: 'destructive', onPress: clearTrips },
    ]);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={trips}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={
        <>
          <RecentRides />
          {trips.length > 0 && (
          <View style={styles.header}>
            <Text style={styles.total}>
              {trips.length} trajet{trips.length > 1 ? 's' : ''} · {shortDistance(totalM)}
            </Text>
            <Pressable onPress={confirmClear} hitSlop={8}>
              <Text style={styles.clear}>Tout effacer</Text>
            </Pressable>
          </View>
          )}
        </>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          Aucun trajet pour l’instant. Lance une navigation depuis la carte : à l’arrivée, le résumé (distance, durée,
          vitesses) est enregistré ici.
        </Text>
      }
      renderItem={({ item }) => <TripRow trip={item} />}
    />
  );
}

/** Balades des 7 derniers jours : récap gardé par le serveur même après la suppression de la balade */
function RecentRides() {
  const styles = useStyles();
  const [rides, setRides] = useState<Awaited<ReturnType<typeof fetchRecentRideOutings>>>([]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchRecentRideOutings()
        .then((r) => !cancelled && setRides(r))
        .catch((e) => console.warn('Balades récentes indisponibles', e));
      return () => {
        cancelled = true;
      };
    }, []),
  );
  if (!rides.length) return null;
  return (
    <View style={styles.recent}>
      <Text style={styles.recentTitle}>Balades des 7 derniers jours</Text>
      {rides.map((r) => (
        <Pressable
          key={r.rideId}
          style={styles.recentRow}
          onPress={() => router.push({ pathname: '/outing', params: { ride: r.rideId } })}>
          <Text style={styles.recentEmoji}>🏁</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.recentLabel} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={styles.recentMeta}>
              {new Date(r.startedAt).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
              {shortDistance(r.distanceM)}
              {r.participants ? ` · ${r.participants} motards` : ''}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function TripRow({ trip }: { trip: TripSummary }) {
  const Colors = useColors();
  const styles = useStyles();
  const start = new Date(trip.startedAt);
  const exportGpx = async () => {
    const track = readTrack(trip.id);
    if (!track) {
      Alert.alert('Export GPX', 'La trace GPS de ce trajet n’a pas été gardée.');
      return;
    }
    const name = `${start.toLocaleDateString('fr-FR')} ${trip.destination}`;
    try {
      await saveGpxFile(gpxFileName(name), buildGpx({ name, points: track }));
    } catch (e) {
      Alert.alert('Export GPX impossible', e instanceof Error ? e.message : String(e));
    }
  };
  const openOuting = () => router.push({ pathname: '/outing', params: { trip: trip.id } });
  const menu = () =>
    showActionSheet({
      title: trip.destination,
      options: [
        ...(trip.hasTrack !== false ? [{ label: '🏁 Ta sortie (récap à partager)', onPress: openOuting }] : []),
        ...(trip.hasTrack && canUse('gpx') ? [{ label: 'Exporter en GPX', onPress: exportGpx }] : []),
        { label: 'Supprimer ce trajet', destructive: true, onPress: () => deleteTrip(trip.id) },
      ],
    });
  return (
    <Pressable style={styles.card} onPress={openOuting} onLongPress={menu} delayLongPress={350}>
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name={trip.arrived ? 'flag-checkered' : 'map-marker-path'}
          size={22}
          color={trip.arrived ? Colors.success : Colors.accent}
        />
        <View style={styles.cardTitle}>
          <Text style={styles.dest} numberOfLines={1}>
            {trip.destination}
          </Text>
          <Text style={styles.date}>
            {start.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
            {start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            {trip.arrived ? '' : ' · arrêté en route'}
          </Text>
        </View>
        <Pressable onPress={menu} hitSlop={10} accessibilityLabel="Options du trajet">
          <MaterialCommunityIcons name="dots-horizontal" size={24} color={Colors.textMuted} />
        </Pressable>
      </View>
      <TripStatsGrid trip={trip} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  recent: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 8, marginBottom: 12 },
  recentTitle: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recentEmoji: { fontSize: Type.title },
  recentLabel: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  recentMeta: { fontSize: Type.small, color: Colors.textMuted },
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  clear: { fontSize: Type.body, fontWeight: '700', color: Colors.danger },
  empty: { color: Colors.textMuted, textAlign: 'center', padding: 24, fontSize: Type.body },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { flex: 1 },
  dest: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  date: { fontSize: Type.small, color: Colors.textMuted },
}));
