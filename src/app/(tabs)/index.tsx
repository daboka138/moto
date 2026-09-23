import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeafletMap, type MapMarker, type MapPosition } from '@/components/leaflet-map';
// DEMO : faux motards simulés (voir src/demo)
import { useDemoMode } from '@/demo/demo-context';
import { DemoCounter } from '@/demo/demo-counter';
import { RiderCard } from '@/demo/rider-card';
import { isSpeeding } from '@/demo/simulation';
import { useDemoRiders } from '@/demo/use-demo-riders';

type Status = 'loading' | 'denied' | 'ready';

export default function MapScreen() {
  const [status, setStatus] = useState<Status>('loading');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [follow, setFollow] = useState(true);

  const position: MapPosition | null = location && {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
  };

  // DEMO
  const { enabled: demoEnabled } = useDemoMode();
  const { riders: demoRiders, routing } = useDemoRiders(demoEnabled, position);
  const [renderedCount, setRenderedCount] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = demoRiders.find((r) => r.rider.id === selectedId) ?? null;
  const markers: MapMarker[] = demoRiders.map((r) => ({
    id: r.rider.id,
    latitude: r.position.latitude,
    longitude: r.position.longitude,
    photoUrl: r.rider.avatar_path,
    tone: isSpeeding(r.speedKmh) ? 'alert' : r.speedKmh < 1 ? 'muted' : 'default',
  }));

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }
      setStatus('ready');
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
        setLocation,
      );
      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === 'denied') {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>La localisation est nécessaire pour afficher ta position sur la carte.</Text>
        <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Ouvrir les réglages</Text>
        </Pressable>
      </View>
    );
  }

  // speed est en m/s, null ou négatif quand inconnu
  const speed = location?.coords.speed;
  const kmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : 0;

  return (
    <View style={styles.container}>
      <LeafletMap
        position={position}
        follow={follow}
        onUserPan={() => setFollow(false)}
        markers={markers}
        selectedMarkerId={selected?.rider.id}
        onMarkerPress={setSelectedId}
        onMapPress={() => setSelectedId(null)}
        onMarkersRendered={setRenderedCount}
      />
      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <View style={styles.speed}>
            <Text style={styles.speedValue}>{kmh}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
          {demoEnabled && (
            <DemoCounter count={demoRiders.length} rendered={renderedCount} routing={routing} /* DEMO */ />
          )}
        </View>
        <View style={styles.bottom} pointerEvents="box-none">
          {!follow && (
            <Pressable style={styles.button} onPress={() => setFollow(true)}>
              <Text style={styles.buttonText}>Recentrer</Text>
            </Pressable>
          )}
          {selected && (
            <View style={styles.card}>
              <RiderCard state={selected} userPosition={position} onClose={() => setSelectedId(null)} />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { fontSize: 16, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  top: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  speed: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  speedValue: { color: '#fff', fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedUnit: { color: '#ccc', fontSize: 12 },
  bottom: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  card: { alignSelf: 'stretch' },
  button: { backgroundColor: '#F97316', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
