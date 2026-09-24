import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeafletMap, type MapMarker, type MapPin, type MapPosition, type MapRoute } from '@/components/leaflet-map';
import { NavBanner, NavBottomBar, ReportButton, RoutePreviewCard } from '@/components/nav/nav-ui';
import { ReportCard, ReportSheet } from '@/components/nav/report-ui';
import { SearchBar } from '@/components/nav/search-bar';
import { motoLabel, PersonCard } from '@/components/person-card';
import { makeStyles, ReportSigns, useColors } from '@/constants/theme';
import { DRIVING_LOCK_SPEED_KMH, useDrivingLock } from '@/lib/driving-lock';
import { useMapLayers } from '@/lib/map-layers';
import { distanceM, type LatLng } from '@/lib/geo';
import type { LivePositionInput } from '@/lib/live-location';
import { usePrivacy } from '@/lib/privacy-context';
import { categoryInfo } from '@/lib/moto';
import { mainCategory, mainMotorcycle, photoUrl } from '@/lib/profile';
import { createReport, deleteReport, reportInfo, voteReport, type ReportType, type Vote } from '@/lib/reports';
import type { RideSummary } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { dangerAhead, useDangerAnnouncements } from '@/lib/use-danger-alerts';
import { useLiveRiders } from '@/lib/use-live-riders';
import { useNavigation } from '@/lib/use-navigation';
import { useUpcomingRides } from '@/lib/use-rides';
import { useRoadReports } from '@/lib/use-road-reports';
import { speak } from '@/lib/voice';
// DEMO : faux motards simulés (voir src/demo)
import { useDemoMode } from '@/demo/demo-context';
import { DemoCounter } from '@/demo/demo-counter';
import { RiderCard } from '@/demo/rider-card';
import { useDemoReports } from '@/demo/reports';
import { demoRides } from '@/demo/rides';
import { isSpeeding } from '@/demo/simulation';
import { canSeeDemoRider, DEMO_RIDE_TITLE, demoPrivacyLabel, demoSocial } from '@/demo/social';
import { useDemoRiders } from '@/demo/use-demo-riders';

type Status = 'loading' | 'denied' | 'ready';

const REAL_PREFIX = 'user:';
const RIDE_PREFIX = 'ride:';
const REPORT_PREFIX = 'report:';
/** Balades affichées sur la carte : publiques (ou auxquelles je participe) dans les 7 jours */
const RIDES_ON_MAP_DAYS = 7;
/** Un signalement du même type à moins de 150 m est confirmé au lieu d'être dupliqué */
const DUPLICATE_REPORT_M = 150;

export default function MapScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const { rides } = useUpcomingRides();
  const { settings, toggleGhost } = usePrivacy();
  const [status, setStatus] = useState<Status>('loading');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingGhost, setTogglingGhost] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const ghost = settings?.mode === 'ghost';
  const insets = useSafeAreaInsets();
  const layers = useMapLayers();

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
  // speed est en m/s, null ou négatif quand inconnu
  const kmh = location?.coords.speed != null && location.coords.speed >= 0 ? Math.round(location.coords.speed * 3.6) : 0;

  // ---------- Navigation ----------
  const myCategory = mainCategory(profile);
  const myMoto = mainMotorcycle(profile);
  const nav = useNavigation(position, kmh, myCategory);
  const navigating = nav.phase === 'navigating';

  // Sécurité : pas de saisie de texte en navigation au-dessus de 10 km/h
  const { setLocked } = useDrivingLock();
  const locked = navigating && kmh > DRIVING_LOCK_SPEED_KMH;
  useEffect(() => {
    setLocked(locked);
  }, [locked, setLocked]);
  useEffect(() => () => setLocked(false), [setLocked]);

  // ---------- Signalements (vrais + DEMO) ----------
  const { reports: realReports, refresh: refreshReports } = useRoadReports(position);
  const demo = useDemoMode();
  const demoReports = useDemoReports(demo.enabled, position, profile?.username ?? 'moi');
  const reports = [...realReports, ...demoReports.reports];
  const danger = dangerAhead(reports, position, heading, kmh, navigating ? nav.route : null, nav.progress?.alongM ?? null);
  useDangerAnnouncements(danger);

  // ---------- Motards réels : Supabase ne renvoie que ceux que j'ai le droit de voir ----------
  const liveRiders = useLiveRiders(userId, me, settings?.mode ?? null);
  const realMarkers: MapMarker[] = liveRiders.map((r) => ({
    id: REAL_PREFIX + r.userId,
    latitude: r.latitude,
    longitude: r.longitude,
    photoUrl: photoUrl(r.avatarPath),
    tone: (r.speedKmh ?? 0) < 1 ? 'muted' : 'default',
  }));

  // DEMO : même règles de visibilité que côté serveur, rejouées en local
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

  // ---------- Repères : RDV de balades, signalements, destination ----------
  const demoRideList = demo.enabled
    ? demoRides(demo, { id: userId ?? 'me', username: profile?.username ?? 'moi', avatarUrl: '' })
    : [];
  const mapRides = navigating
    ? []
    : [...(rides ?? []), ...demoRideList].filter(
        (r) => (r.visibility === 'public' || r.joined) && isWithinDays(r.meetingAt, RIDES_ON_MAP_DAYS),
      );
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
    ...(nav.destination
      ? [{ id: 'destination', kind: 'end' as const, label: '🏁', latitude: nav.destination.latitude, longitude: nav.destination.longitude }]
      : []),
  ];
  const routes: MapRoute[] = nav.route
    ? [{ id: 'nav', points: nav.route.points.map((p) => [p.latitude, p.longitude] as [number, number]), color: Colors.route }]
    : [];
  // Aperçu : la carte cadre tout l'itinéraire (2 coins suffisent)
  const fitPoints = nav.phase === 'preview' && nav.route ? boundsOf(nav.route.points) : undefined;

  const selectedReal = liveRiders.find((r) => REAL_PREFIX + r.userId === selectedId) ?? null;
  const selectedDemo = demoRiders.find((r) => r.rider.id === selectedId) ?? null;
  const selectedReport = reports.find((r) => REPORT_PREFIX + r.id === selectedId) ?? null;

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
        (loc) => {
          setLocation(loc);
          // Le cap GPS n'est fiable qu'en mouvement (> 5 km/h)
          if (loc.coords.heading != null && loc.coords.heading >= 0 && (loc.coords.speed ?? 0) > 1.5) {
            setHeading(loc.coords.heading);
          }
        },
      );
      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 3000);
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

  const onPinPress = (id: string) => {
    if (id.startsWith(REPORT_PREFIX)) {
      setSelectedId(id);
      return;
    }
    const ride = mapRides.find((r) => RIDE_PREFIX + r.id === id);
    if (!ride) return;
    if (ride.isDemo) router.push({ pathname: '/demo-ride/[id]', params: { id: ride.id } });
    else router.push({ pathname: '/ride/[id]', params: { id: ride.id } });
  };

  const report = async (type: ReportType) => {
    setReportSheet(false);
    if (!position || !userId) return;
    const label = reportInfo(type).label;
    const existing = reports.find((r) => r.type === type && distanceM(r, position) < DUPLICATE_REPORT_M);
    try {
      if (existing) {
        await vote(existing.id, 'still_there', true);
        showToast(`${label} déjà signalé ici : merci d'avoir confirmé`);
      } else {
        await createReport(userId, type, position);
        await refreshReports();
        showToast(`Merci ! ${label} signalé`);
      }
      speak('Merci, signalement envoyé');
    } catch (e) {
      Alert.alert('Signalement impossible', e instanceof Error ? e.message : String(e));
    }
  };

  const vote = async (id: string, value: Vote, silent = false) => {
    const target = reports.find((r) => r.id === id);
    if (!target || !userId) return;
    if (target.isDemo) demoReports.vote(id, value);
    else {
      await voteReport(userId, id, value);
      await refreshReports();
    }
    setVotedIds((v) => [...v, id]);
    if (!silent) showToast(value === 'gone' ? 'Merci, signalement retiré si confirmé par d’autres' : 'Merci pour la confirmation');
  };

  const removeMine = async (id: string) => {
    const target = reports.find((r) => r.id === id);
    if (!target) return;
    try {
      if (target.isDemo) demoReports.remove(id);
      else {
        await deleteReport(id);
        await refreshReports();
      }
      setSelectedId(null);
    } catch (e) {
      Alert.alert('Suppression impossible', e instanceof Error ? e.message : String(e));
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

  return (
    <View style={styles.container}>
      <LeafletMap
        position={position}
        navigation={navigating ? { heading } : null}
        follow={follow && nav.phase === 'idle'}
        onUserPan={() => setFollow(false)}
        markers={markers}
        selectedMarkerId={selectedId}
        onMarkerPress={setSelectedId}
        onMapPress={() => setSelectedId(null)}
        onMarkersRendered={setRenderedCount}
        pins={pins}
        onPinPress={onPinPress}
        routes={routes}
        fitPoints={fitPoints}
      />
      {/* Couche des commandes : couvre tout l'écran au-dessus de la carte, recherche en haut, + en bas */}
      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          {navigating ? (
            <NavBanner progress={nav.progress} danger={danger} />
          ) : (
            <SearchBar
              near={position}
              onSelect={(r) => {
                setFollow(false);
                setSelectedId(null);
                nav.choose(r);
              }}
            />
          )}

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
                  <ActivityIndicator color={ghost ? Colors.white : Colors.ghost} />
                ) : (
                  <MaterialCommunityIcons name="ghost" size={28} color={ghost ? Colors.white : Colors.ghost} />
                )}
              </Pressable>
            </View>
            <View style={styles.right} pointerEvents="box-none">
              {demo.enabled && !navigating && (
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
              {/* Afficher / masquer les calques (choix mémorisé) */}
              <LayerButton
                active={layers.showReports}
                icon="warning"
                label={layers.showReports ? 'Masquer les signalements' : 'Afficher les signalements'}
                onPress={() => layers.setShowReports(!layers.showReports)}
              />
              {!navigating && (
                <LayerButton
                  active={layers.showRides}
                  icon="flag"
                  label={layers.showRides ? 'Masquer les balades' : 'Afficher les balades'}
                  onPress={() => layers.setShowRides(!layers.showRides)}
                />
              )}
            </View>
          </View>

          {ghost && (
            <View style={styles.ghostBanner}>
              <MaterialCommunityIcons name="ghost" size={18} color={Colors.white} />
              <Text style={styles.ghostBannerText}>Mode fantôme · tu es masqué</Text>
            </View>
          )}
          {!navigating && danger && (
            <View style={styles.dangerChip}>
              <Text style={styles.dangerText}>
                {reportInfo(danger.report.type).emoji} {reportInfo(danger.report.type).label} droit devant
              </Text>
            </View>
          )}
          {toast && (
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </View>
          )}
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          <View style={styles.bottomRow} pointerEvents="box-none">
            {!follow && nav.phase === 'idle' ? (
              <Pressable style={styles.button} onPress={() => setFollow(true)}>
                <Text style={styles.buttonText}>Recentrer</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <ReportButton onPress={() => setReportSheet(true)} />
          </View>

          {selectedReport && (
            <View style={styles.card}>
              <ReportCard
                report={selectedReport}
                distanceM={position ? distanceM(position, selectedReport) : null}
                mine={selectedReport.authorId === userId || selectedReport.authorId === 'me'}
                alreadyVoted={votedIds.includes(selectedReport.id)}
                onVote={(v) => vote(selectedReport.id, v).catch((e) => Alert.alert('Vote impossible', String(e)))}
                onDelete={() => removeMine(selectedReport.id)}
                onClose={() => setSelectedId(null)}
              />
            </View>
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

          {nav.phase === 'preview' && nav.destination && (
            <View style={styles.card}>
              <RoutePreviewCard
                destination={nav.destination}
                route={nav.route}
                loading={nav.loading}
                error={nav.error}
                options={nav.options}
                moto={myMoto ? `${myMoto.model}${myCategory ? ` (${categoryInfo(myCategory).short})` : ''}` : null}
                onChangeOptions={nav.updateOptions}
                onStart={() => {
                  setSelectedId(null);
                  nav.start();
                }}
                onCancel={() => {
                  nav.stop();
                  setFollow(true);
                }}
              />
            </View>
          )}
          {navigating && (
            <View style={styles.card}>
              <NavBottomBar
                progress={nav.progress}
                onStop={() => {
                  nav.stop();
                  speak('Navigation arrêtée', true);
                  setFollow(true);
                }}
              />
            </View>
          )}
        </View>
      </View>

      <ReportSheet visible={reportSheet} onPick={report} onClose={() => setReportSheet(false)} />
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
      style={[styles.layerButton, active && styles.layerButtonOn]}
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}>
      <Ionicons name={active ? icon : (`${icon}-outline` as const)} size={24} color={active ? Colors.white : Colors.textMuted} />
      {!active && <View style={styles.layerStrike} />}
    </Pressable>
  );
}

function isWithinDays(iso: string, days: number) {
  return new Date(iso).getTime() < Date.now() + days * 24 * 3600 * 1000;
}

function boundsOf(points: LatLng[]): LatLng[] {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  return [
    { latitude: minLat, longitude: minLng },
    { latitude: maxLat, longitude: maxLng },
  ];
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

const useStyles = makeStyles((Colors) => ({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { fontSize: 16, textAlign: 'center', color: Colors.text },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    zIndex: 10,
    elevation: 10,
  },
  header: { alignSelf: 'stretch', gap: 12 },
  top: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { gap: 10, alignItems: 'flex-start' },
  right: { gap: 10, alignItems: 'flex-end' },
  layerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  layerButtonOn: { backgroundColor: Colors.accent },
  layerStrike: {
    position: 'absolute',
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    transform: [{ rotate: '-45deg' }],
  },
  speed: {
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  speedValue: { color: Colors.white, fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedUnit: { color: Colors.textFaint, fontSize: 12 },
  ghostButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.ghost,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
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
    elevation: 4,
  },
  ghostBannerText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  dangerChip: {
    alignSelf: 'center',
    backgroundColor: Colors.danger,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
  },
  dangerText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
  toast: {
    alignSelf: 'center',
    backgroundColor: Colors.overlayStrong,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: Colors.white, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  bottom: { alignSelf: 'stretch', gap: 12 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  card: { alignSelf: 'stretch' },
  button: { backgroundColor: Colors.accent, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
}));
