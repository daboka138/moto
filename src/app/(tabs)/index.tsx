import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeafletMap, type MapMarker, type MapPin, type MapPosition } from '@/components/leaflet-map';
import { motoLabel, PersonCard } from '@/components/person-card';
import { Colors } from '@/constants/theme';
import { distanceM } from '@/lib/geo';
import type { LivePositionInput } from '@/lib/live-location';
import { usePrivacy } from '@/lib/privacy-context';
import { photoUrl } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { useLiveRiders } from '@/lib/use-live-riders';
import type { RideSummary } from '@/lib/rides';
import { useUpcomingRides } from '@/lib/use-rides';
// DEMO : faux motards simulés (voir src/demo)
import { useDemoMode } from '@/demo/demo-context';
import { DemoCounter } from '@/demo/demo-counter';
import { RiderCard } from '@/demo/rider-card';
import { isSpeeding } from '@/demo/simulation';
import { canSeeDemoRider, DEMO_RIDE_TITLE, demoPrivacyLabel, demoSocial } from '@/demo/social';
import { useDemoRiders } from '@/demo/use-demo-riders';
import { demoRides } from '@/demo/rides';

type Status = 'loading' | 'denied' | 'ready';

const REAL_PREFIX = 'user:';
const RIDE_PREFIX = 'ride:';
/** Balades affichées sur la carte : publiques (ou auxquelles je participe) dans les 7 jours */
const RIDES_ON_MAP_DAYS = 7;

export default function MapScreen() {
  const { session, profile } = useSession();
  const { rides } = useUpcomingRides();
  const { settings, toggleGhost } = usePrivacy();
  const [status, setStatus] = useState<Status>('loading');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingGhost, setTogglingGhost] = useState(false);
  const ghost = settings?.mode === 'ghost';

  const position: MapPosition | null = location && {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
  };
  const me: LivePositionInput | null = location && {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    speedKmh: location.coords.speed != null && location.coords.speed >= 0 ? location.coords.speed * 3.6 : null,
    heading: location.coords.heading ?? null,
    accuracy: location.coords.accuracy,
  };

  // Motards réels : Supabase ne renvoie que ceux que j'ai le droit de voir
  const liveRiders = useLiveRiders(session?.user.id, me, settings?.mode ?? null);
  const realMarkers: MapMarker[] = liveRiders.map((r) => ({
    id: REAL_PREFIX + r.userId,
    latitude: r.latitude,
    longitude: r.longitude,
    photoUrl: photoUrl(r.avatarPath),
    tone: (r.speedKmh ?? 0) < 1 ? 'muted' : 'default',
  }));

  // DEMO : même règles de visibilité que côté serveur, rejouées en local
  const demo = useDemoMode();
  const { riders: allDemoRiders, routing } = useDemoRiders(demo.enabled, position);
  const demoRiders = allDemoRiders.filter((r) => canSeeDemoRider(r.rider, demo));
  const [renderedCount, setRenderedCount] = useState<number | null>(null);
  const demoMarkers: MapMarker[] = demoRiders.map((r) => ({
    id: r.rider.id,
    latitude: r.position.latitude,
    longitude: r.position.longitude,
    photoUrl: r.rider.avatar_path,
    tone: isSpeeding(r.speedKmh) ? 'alert' : r.speedKmh < 1 ? 'muted' : 'default',
  }));

  const markers = [...realMarkers, ...demoMarkers];

  // Points de RDV des balades (vraies + DEMO)
  const demoRideList = demo.enabled
    ? demoRides(demo, { id: session?.user.id ?? 'me', username: profile?.username ?? 'moi', avatarUrl: '' })
    : [];
  const mapRides = [...(rides ?? []), ...demoRideList].filter(
    (r) => (r.visibility === 'public' || r.joined) && isWithinDays(r.meetingAt, RIDES_ON_MAP_DAYS),
  );
  const ridePins: MapPin[] = mapRides.map((r) => ({
    id: RIDE_PREFIX + r.id,
    kind: 'meeting',
    label: rideLabel(r),
    latitude: r.meeting.latitude,
    longitude: r.meeting.longitude,
  }));
  const openRide = (pinId: string) => {
    const ride = mapRides.find((r) => RIDE_PREFIX + r.id === pinId);
    if (!ride) return;
    if (ride.isDemo) router.push({ pathname: '/demo-ride/[id]', params: { id: ride.id } });
    else router.push({ pathname: '/ride/[id]', params: { id: ride.id } });
  };
  const selectedReal = liveRiders.find((r) => REAL_PREFIX + r.userId === selectedId) ?? null;
  const selectedDemo = demoRiders.find((r) => r.rider.id === selectedId) ?? null;

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

  const onGhostPress = async () => {
    setTogglingGhost(true);
    try {
      await toggleGhost();
    } catch (e) {
      Alert.alert('Mode fantôme', e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingGhost(false);
    }
  };

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
        selectedMarkerId={selectedId}
        onMarkerPress={setSelectedId}
        onMapPress={() => setSelectedId(null)}
        onMarkersRendered={setRenderedCount}
        pins={ridePins}
        onPinPress={openRide}
      />
      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.top} pointerEvents="box-none">
            <View style={styles.left} pointerEvents="box-none">
              <View style={styles.speed}>
                <Text style={styles.speedValue}>{kmh}</Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>
              <Pressable
                style={[styles.ghostButton, ghost && styles.ghostButtonOn]}
                onPress={onGhostPress}
                disabled={!settings || togglingGhost}
                accessibilityLabel={ghost ? 'Quitter le mode fantôme' : 'Passer en mode fantôme'}>
                {togglingGhost ? (
                  <ActivityIndicator color={ghost ? '#fff' : Colors.ghost} />
                ) : (
                  <MaterialCommunityIcons name="ghost" size={28} color={ghost ? '#fff' : Colors.ghost} />
                )}
              </Pressable>
            </View>
            {demo.enabled && (
              <DemoCounter /* DEMO */
                visible={demoRiders.length}
                total={allDemoRiders.length}
                rendered={renderedCount === null ? null : renderedCount - realMarkers.length}
                routing={routing}
                rideTitle={DEMO_RIDE_TITLE}
                rideActive={demo.rideActive}
                onToggleRide={() => demo.setRideActive(!demo.rideActive)}
              />
            )}
          </View>

          {ghost && (
            <View style={styles.ghostBanner}>
              <MaterialCommunityIcons name="ghost" size={18} color="#fff" />
              <Text style={styles.ghostBannerText}>Mode fantôme · tu es masqué</Text>
            </View>
          )}
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {!follow && (
            <Pressable style={styles.button} onPress={() => setFollow(true)}>
              <Text style={styles.buttonText}>Recentrer</Text>
            </Pressable>
          )}
          {selectedReal && (
            <View style={styles.card}>
              <PersonCard
                photoUrl={photoUrl(selectedReal.avatarPath)}
                username={selectedReal.username}
                motoLabel={motoLabel(selectedReal.moto)}
                speedKmh={selectedReal.speedKmh}
                distanceM={position ? distanceM(position, selectedReal) : null}
                onViewProfile={() => router.push({ pathname: '/user/[id]', params: { id: selectedReal.userId } })}
                onClose={() => setSelectedId(null)}
              />
            </View>
          )}
          {selectedDemo && (
            <View style={styles.card}>
              <RiderCard
                state={selectedDemo}
                userPosition={position}
                badge={demoBadge(selectedDemo.rider, demo.friendIds, demo.rideActive)}
                onClose={() => setSelectedId(null)}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function isWithinDays(iso: string, days: number) {
  return new Date(iso).getTime() < Date.now() + days * 24 * 3600 * 1000;
}

/** Texte du repère de balade : « En cours », « 9h30 » aujourd'hui, sinon « sam. 9h30 » */
function rideLabel(r: RideSummary) {
  if (r.status === 'live') return '🏍 En cours';
  const d = new Date(r.meetingAt);
  const time = `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
  const today = d.toDateString() === new Date().toDateString();
  return `🏍 ${today ? '' : d.toLocaleDateString('fr-FR', { weekday: 'short' }) + ' '}${time}`;
}

// DEMO : explique pourquoi ce faux motard est visible
function demoBadge(rider: Parameters<typeof demoSocial>[0], friendIds: string[], rideActive: boolean) {
  const social = demoSocial(rider);
  const parts = [friendIds.includes(rider.id) ? 'Ami' : 'Pas ami', demoPrivacyLabel(social.privacy)];
  if (rideActive && social.inRideWithMe) parts.push('dans ton trajet de groupe');
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { fontSize: 16, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  top: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { gap: 10, alignItems: 'flex-start' },
  speed: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  speedValue: { color: '#fff', fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedUnit: { color: '#ccc', fontSize: 12 },
  ghostButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.ghost,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  ghostButtonOn: { backgroundColor: Colors.ghost },
  header: { alignSelf: 'stretch', gap: 12 },
  ghostBanner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.ghost,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 4,
  },
  ghostBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bottom: { alignSelf: 'stretch', alignItems: 'center', gap: 12 },
  card: { alignSelf: 'stretch' },
  button: { backgroundColor: Colors.accent, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
