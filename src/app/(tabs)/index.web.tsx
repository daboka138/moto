import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { LeafletMap, type MapMarker, type MapPin, type MapRoute } from '@/components/leaflet-map';
import { DroppedPinCard, type RidePlaceRole } from '@/components/nav/dropped-pin-card';
import { ReportCard } from '@/components/nav/report-ui';
import { SearchBar } from '@/components/nav/search-bar';
import { OpenInApp } from '@/components/open-in-app';
import { motoLabel, PersonCard } from '@/components/person-card';
import { RideCard } from '@/components/ride-card';
import { makeStyles, ReportSigns, useColors } from '@/constants/theme';
import { openInApp } from '@/lib/app-link';
import { distanceM, type LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';
import { useMapLayers } from '@/lib/map-layers';
import { usePrivacy } from '@/lib/privacy-context';
import { photoUrl } from '@/lib/profile';
import { deleteReport, reportInfo } from '@/lib/reports';
import { fetchRide, type RideSummary } from '@/lib/rides';
import { reverseGeocode } from '@/lib/search';
import { useSession } from '@/lib/session';
import { useLiveRiders } from '@/lib/use-live-riders';
import { useUpcomingRides } from '@/lib/use-rides';
import { useRoadReports } from '@/lib/use-road-reports';

// Onglet Carte, version web : consultation. Balades, signalements, amis en direct, recherche de
// lieux. Ma position (si le navigateur l'autorise) sert seulement à centrer la carte : elle n'est
// JAMAIS envoyée aux autres. Navigation guidée, SOS et signalement sur place : app Android.

const REAL_PREFIX = 'user:';
const RIDE_PREFIX = 'ride:';
const REPORT_PREFIX = 'report:';
const RIDES_ON_MAP_DAYS = 30;

export default function MapScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id;
  const { rides } = useUpcomingRides();
  const { settings, toggleGhost } = usePrivacy();
  const layers = useMapLayers();
  const ghost = settings?.mode === 'ghost';
  const [me, setMe] = useState<(LatLng & { accuracy: number | null }) | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [follow, setFollow] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ place: Place; resolving: boolean } | null>(null);
  const [fit, setFit] = useState<LatLng[] | undefined>(undefined);
  const [rideRoute, setRideRoute] = useState<{ id: string; points: [number, number][] } | null>(null);
  const [togglingGhost, setTogglingGhost] = useState(false);
  const [locating, setLocating] = useState(false);

  // Ma position une seule fois (centrage) : au bouton, ou dès l'ouverture si le navigateur l'a déjà autorisée
  const locate = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Position', 'Autorise la localisation dans ton navigateur pour centrer la carte sur toi.');
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });
      setFollow(true);
    } catch (e) {
      Alert.alert('Position', e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then(async (perm) => {
        if (perm.status !== 'granted' || cancelled) return;
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });
        setFollow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Positions que Supabase m'autorise à voir (RLS) ; la mienne n'est pas envoyée (me = null)
  const liveRiders = useLiveRiders(userId, null, settings?.mode ?? null);
  const markers: MapMarker[] = liveRiders.map((r) => ({
    id: REAL_PREFIX + r.userId,
    latitude: r.latitude,
    longitude: r.longitude,
    photoUrl: photoUrl(r.avatarPath),
    tone: (r.speedKmh ?? 0) < 1 ? 'muted' : 'default',
  }));

  // Signalements autour du centre de la carte
  const { reports, refresh: refreshReports } = useRoadReports(center);

  const mapRides = (rides ?? []).filter(
    (r) =>
      (r.visibility === 'public' || r.visibility === 'friends' || r.joined) &&
      r.status !== 'ended' &&
      isWithinDays(r.meetingAt, RIDES_ON_MAP_DAYS),
  );
  const selectedRide = layers.showRides ? (mapRides.find((r) => RIDE_PREFIX + r.id === selectedId) ?? null) : null;
  const selectedReport = reports.find((r) => REPORT_PREFIX + r.id === selectedId) ?? null;
  const selectedRider = liveRiders.find((r) => REAL_PREFIX + r.userId === selectedId) ?? null;

  const pins: MapPin[] = [
    ...(layers.showRides ? mapRides : []).map((r) => ({
      id: RIDE_PREFIX + r.id,
      kind: 'meeting' as const,
      label: rideLabel(r),
      latitude: r.meeting.latitude,
      longitude: r.meeting.longitude,
    })),
    ...(layers.showReports ? reports : []).map((r) => ({
      id: REPORT_PREFIX + r.id,
      kind: 'report' as const,
      label: reportInfo(r.type).emoji,
      sign: ReportSigns[r.type],
      latitude: r.latitude,
      longitude: r.longitude,
    })),
    ...(dropped
      ? [
          {
            id: 'dropped',
            kind: 'dropped' as const,
            label: '',
            latitude: dropped.place.latitude,
            longitude: dropped.place.longitude,
          },
        ]
      : []),
  ];
  const routes: MapRoute[] =
    selectedRide && rideRoute?.id === selectedRide.id
      ? [{ id: 'ride', points: rideRoute.points, color: Colors.accent }]
      : [];

  const onPinPress = (id: string) => {
    if (id.startsWith(REPORT_PREFIX)) {
      setDropped(null);
      setSelectedId(id);
      return;
    }
    const ride = mapRides.find((r) => RIDE_PREFIX + r.id === id);
    if (!ride || !userId) return;
    setDropped(null);
    setSelectedId(id);
    if (rideRoute?.id !== ride.id) {
      fetchRide(ride.id, userId)
        .then((details) => {
          if (!details) return;
          const points =
            details.route ??
            [details.start, ...details.waypoints, details.end].map(
              (p) => [p.latitude, p.longitude] as [number, number],
            );
          setRideRoute({ id: ride.id, points });
        })
        .catch((e) => console.warn('Tracé de la balade indisponible', e));
    }
  };

  // Clic droit (ordinateur) ou appui long (mobile) : point posé
  const dropAt = async (point: LatLng, label?: string) => {
    setSelectedId(null);
    setFollow(false);
    const fallback = label ?? `Point ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
    setDropped({ place: { ...point, label: fallback }, resolving: !label });
    if (label) return;
    const place = await reverseGeocode(point);
    setDropped((d) =>
      d && d.place.latitude === point.latitude && d.place.longitude === point.longitude
        ? { place, resolving: false }
        : d,
    );
  };

  const rideFromDropped = (role: RidePlaceRole) => {
    if (!dropped) return;
    const { place } = dropped;
    setDropped(null);
    router.push({
      pathname: '/ride/new',
      params: { role, label: place.label, lat: String(place.latitude), lng: String(place.longitude) },
    });
  };

  // « Aller ici » : la navigation guidée est dans l'app, qui ouvre directement l'aperçu du trajet
  const goInApp = () => {
    if (!dropped) return;
    const { place } = dropped;
    const query = new URLSearchParams({
      goLat: place.latitude.toFixed(6),
      goLng: place.longitude.toFixed(6),
      goLabel: place.label,
    });
    openInApp(`/?${query.toString()}`);
  };

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

  const removeMine = async (id: string) => {
    try {
      await deleteReport(id);
      await refreshReports();
      setSelectedId(null);
    } catch (e) {
      Alert.alert('Suppression impossible', e instanceof Error ? e.message : String(e));
    }
  };

  const from = me ?? center;

  return (
    <View style={styles.container}>
      <LeafletMap
        position={me ? { ...me, heading: null } : null}
        follow={follow}
        onUserPan={() => setFollow(false)}
        onViewChange={setCenter}
        markers={markers}
        selectedMarkerId={selectedId}
        onMarkerPress={(id) => {
          setDropped(null);
          setSelectedId(id);
        }}
        onMapPress={() => {
          setSelectedId(null);
          setDropped(null);
        }}
        onMapLongPress={(p) => dropAt(p)}
        pins={pins}
        onPinPress={onPinPress}
        routes={routes}
        fitPoints={fit}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.search}>
            <SearchBar
              near={from}
              placeholder="Chercher un lieu"
              onSelect={(r) => {
                setFit([{ latitude: r.latitude, longitude: r.longitude }]);
                dropAt(r, r.label);
              }}
            />
          </View>

          <View style={styles.top} pointerEvents="box-none">
            <View style={styles.column} pointerEvents="box-none">
              <Pressable
                style={[styles.roundButton, styles.ghostButton, ghost && styles.ghostButtonOn]}
                onPress={onGhostPress}
                disabled={!settings || togglingGhost}
                accessibilityLabel={ghost ? 'Quitter le mode fantôme' : 'Passer en mode fantôme'}>
                {togglingGhost ? (
                  <ActivityIndicator color={ghost ? Colors.white : Colors.ghost} />
                ) : (
                  <MaterialCommunityIcons name="ghost" size={26} color={ghost ? Colors.white : Colors.ghost} />
                )}
              </Pressable>
              <Pressable
                style={styles.roundButton}
                onPress={locate}
                disabled={locating}
                accessibilityLabel="Centrer sur ma position">
                {locating ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <Ionicons name="locate" size={24} color={Colors.accent} />
                )}
              </Pressable>
            </View>
            <View style={styles.column} pointerEvents="box-none">
              <LayerButton
                active={layers.showReports}
                icon="warning"
                label={layers.showReports ? 'Masquer les signalements' : 'Afficher les signalements'}
                onPress={() => layers.setShowReports(!layers.showReports)}
              />
              <LayerButton
                active={layers.showRides}
                icon="flag"
                label={layers.showRides ? 'Masquer les balades' : 'Afficher les balades'}
                onPress={() => layers.setShowRides(!layers.showRides)}
              />
            </View>
          </View>

          {ghost && (
            <View style={styles.ghostBanner}>
              <MaterialCommunityIcons name="ghost" size={18} color={Colors.white} />
              <Text style={styles.ghostBannerText}>Mode fantôme · tu es masqué</Text>
            </View>
          )}
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {dropped && (
            <DroppedPinCard
              place={dropped.place}
              resolving={dropped.resolving}
              distanceM={me ? distanceM(me, dropped.place) : null}
              onGo={goInApp}
              onRide={rideFromDropped}
              onClose={() => setDropped(null)}
            />
          )}
          {selectedRide && (
            <View>
              <RideCard
                ride={selectedRide}
                distanceFromMeM={me ? distanceM(me, selectedRide.meeting) : null}
                onPress={() => router.push({ pathname: '/ride/[id]', params: { id: selectedRide.id } })}
              />
              <Pressable style={styles.rideClose} onPress={() => setSelectedId(null)} accessibilityLabel="Fermer">
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}
          {selectedReport && (
            <ReportCard
              report={selectedReport}
              distanceM={me ? distanceM(me, selectedReport) : null}
              mine={selectedReport.authorId === userId}
              alreadyVoted={false}
              onDelete={() => removeMine(selectedReport.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
          {selectedRider && (
            <PersonCard
              photoUrl={photoUrl(selectedRider.avatarPath)}
              username={selectedRider.username}
              motoLabel={motoLabel(selectedRider.moto)}
              speedKmh={selectedRider.speedKmh}
              distanceM={me ? distanceM(me, selectedRider) : null}
              onViewProfile={() => router.push({ pathname: '/user/[id]', params: { id: selectedRider.userId } })}
              onClose={() => setSelectedId(null)}
            />
          )}
          {!dropped && !selectedRide && !selectedReport && !selectedRider && (
            <View style={styles.appCard}>
              <View style={styles.appCardText}>
                <Text style={styles.appCardTitle}>Navigation GPS, SOS et partage de ta position</Text>
                <Text style={styles.appCardHint}>Clic droit ou appui long sur la carte : poser un point.</Text>
              </View>
              <OpenInApp path="/" compact />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/** Bouton rond de calque : plein = affiché, barré = masqué */
function LayerButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: 'warning' | 'flag';
  label: string;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.roundButton, active && styles.layerButtonOn]}
      onPress={onPress}
      accessibilityLabel={label}>
      <Ionicons
        name={active ? icon : (`${icon}-outline` as const)}
        size={24}
        color={active ? Colors.white : Colors.textMuted}
      />
      {!active && <View style={styles.layerStrike} />}
    </Pressable>
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

const useStyles = makeStyles((Colors) => ({
  container: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    zIndex: 10,
  },
  header: { gap: 12 },
  search: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  column: { gap: 10 },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  layerButtonOn: { backgroundColor: Colors.accent },
  layerStrike: {
    position: 'absolute',
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    transform: [{ rotate: '-45deg' }],
  },
  ghostButton: { borderColor: Colors.ghost },
  ghostButtonOn: { backgroundColor: Colors.ghost },
  ghostBanner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.ghost,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ghostBannerText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  // Fiches en bas à gauche, largeur limitée sur grand écran (le zoom reste à droite)
  bottom: { position: 'absolute', left: 12, bottom: 12, right: 64, maxWidth: 440, gap: 12 },
  rideClose: {
    position: 'absolute',
    top: -14,
    right: -4,
    borderWidth: 1,
    borderColor: Colors.border,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  appCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  appCardText: { flex: 1, minWidth: 180, gap: 2 },
  appCardTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  appCardHint: { fontSize: 12, color: Colors.textMuted },
}));
