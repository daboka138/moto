import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeafletMap, type MapMarker, type MapPin, type MapPosition, type MapRoute } from '@/components/leaflet-map';
import { DroppedPinCard, type RidePlaceRole } from '@/components/nav/dropped-pin-card';
import { showActionSheet } from '@/components/action-sheet';
import { NavBanner, NavSheet, ReportButton, RoutePreviewSheet, Speedometer } from '@/components/nav/nav-ui';
import { QuickPlaces } from '@/components/nav/quick-places';
import { ReportCard, ReportSheet } from '@/components/nav/report-ui';
import { SearchBar } from '@/components/nav/search-bar';
import { ShareTripSheet } from '@/components/nav/share-trip-sheet';
import { StopPicker } from '@/components/nav/stop-picker';
import { TripSummaryModal } from '@/components/trip-summary';
import { motoLabel, PersonCard } from '@/components/person-card';
import { RideCard } from '@/components/ride-card';
import { SafetyOverlay } from '@/components/safety/safety-overlay';
import { SosButton } from '@/components/safety/sos-button';
import { makeStyles, ReportSigns, useColors } from '@/constants/theme';
import { DRIVING_LOCK_SPEED_KMH, useDrivingLock } from '@/lib/driving-lock';
import { useMapLayers } from '@/lib/map-layers';
import { useFallDetection } from '@/lib/fall-detection';
import { findFavorite, removeFavorite, setFavorite } from '@/lib/favorites';
import { distanceM, type LatLng } from '@/lib/geo';
import { finishHomecoming, sendHomecomingPosition, useHomecoming } from '@/lib/homecoming';
import type { Place } from '@/lib/geocoding';
import type { LivePositionInput } from '@/lib/live-location';
import { usePrivacy } from '@/lib/privacy-context';
import { categoryInfo } from '@/lib/moto';
import { mainCategory, mainMotorcycle, photoUrl } from '@/lib/profile';
import type { PoiKind } from '@/lib/pois';
import { createReport, deleteReport, reportInfo, voteReport, type ReportType, type Vote } from '@/lib/reports';
import { fetchRide, type RideSummary } from '@/lib/rides';
import { reverseGeocode } from '@/lib/search';
import { useSession } from '@/lib/session';
import { useSpeedLimit } from '@/lib/speed-limit';
import { useCompass } from '@/lib/use-compass';
import { dangerAhead, useDangerAnnouncements } from '@/lib/use-danger-alerts';
import { useLiveRiders } from '@/lib/use-live-riders';
import { useNavigation } from '@/lib/use-navigation';
import { useUpcomingRides } from '@/lib/use-rides';
import { useRoadReports } from '@/lib/use-road-reports';
import { speak, updateVoiceSettings, useVoiceSettings } from '@/lib/voice';
// DEMO : faux motards simulés (voir src/demo)
import { useDemoMode } from '@/demo/demo-context';
import { DemoCounter } from '@/demo/demo-counter';
import { RiderCard } from '@/demo/rider-card';
import { useDemoReports } from '@/demo/reports';
import { demoRide, demoRides } from '@/demo/rides';
import { isSpeeding } from '@/demo/simulation';
import { canSeeDemoRider, DEMO_RIDE_TITLE, demoPrivacyLabel, demoSocial } from '@/demo/social';
import { useDemoRiders } from '@/demo/use-demo-riders';

type Status = 'loading' | 'denied' | 'ready';

const REAL_PREFIX = 'user:';
const RIDE_PREFIX = 'ride:';
const REPORT_PREFIX = 'report:';
/** Balades affichées sur la carte : publiques, entre amis ou auxquelles je participe, dans les 30 jours */
const RIDES_ON_MAP_DAYS = 30;
/** Au-delà de 5,4 km/h, le cap GPS est fiable ; en dessous, la flèche suit la boussole */
const MOVING_MS = 1.5;
/** Un signalement du même type à moins de 150 m est confirmé au lieu d'être dupliqué */
const DUPLICATE_REPORT_M = 150;
/** Tolérance avant l'alerte de vitesse (le compteur GPS est précis à quelques km/h) */
const SPEED_MARGIN_KMH = 3;
/** Toujours au-dessus de la limitation : nouveau bip toutes les 20 s */
const SPEED_BEEP_REPEAT_MS = 20_000;
const KEEP_AWAKE_TAG = 'navigation';
/** « Je rentre » : position envoyée toutes les minutes, arrivée détectée à 150 m */
const HOMECOMING_POSITION_MS = 60_000;
const HOMECOMING_ARRIVED_M = 150;

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
  // La carte suit ma position (et mon cap en navigation) ; coupé dès que je la déplace ou la tourne
  const [follow, setFollow] = useState(true);
  // Orientation de la carte (0 = nord en haut) : boussole affichée hors navigation si ≠ 0
  const [bearing, setBearing] = useState(0);
  const [northUpKey, setNorthUpKey] = useState(0);
  const voice = useVoiceSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingGhost, setTogglingGhost] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // Point posé par appui long, et lieu visé par le prochain signalement (sinon ma position)
  const [dropped, setDropped] = useState<{ place: Place; resolving: boolean } | null>(null);
  const [reportAt, setReportAt] = useState<LatLng | null>(null);
  // Balade touchée sur la carte : son tracé est affiché
  const [rideRoute, setRideRoute] = useState<{ id: string; points: [number, number][] } | null>(null);
  const compass = useCompass();
  const ghost = settings?.mode === 'ghost';
  const insets = useSafeAreaInsets();
  const layers = useMapLayers();

  // Flèche : cap GPS en mouvement, boussole à l'arrêt (dernier cap GPS si pas de boussole)
  const moving = (location?.coords.speed ?? 0) > MOVING_MS;
  const pointing = moving ? heading : (compass ?? heading);
  const position: MapPosition | null = location && {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    heading: pointing,
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
  const nav = useNavigation(position, kmh, myCategory, userId);
  const navigating = nav.phase === 'navigating';
  const [stopPicker, setStopPicker] = useState<{ kind: PoiKind | null } | null>(null);
  const [shareSheet, setShareSheet] = useState(false);

  // Écran toujours allumé pendant la navigation
  useEffect(() => {
    if (!navigating) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((e) => console.warn('Écran allumé impossible', e));
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [navigating]);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 3000);
  };

  // ---------- Sécurité : SOS, détection de chute, « Je rentre » ----------
  const [sosKind, setSosKind] = useState<'manual' | null>(null);
  // Détection de chute pendant une navigation ou une balade en cours à laquelle je participe
  const inLiveRide = (rides ?? []).some((r) => r.status === 'live' && r.joined);
  const fall = useFallDetection(navigating || inLiveRide, kmh);
  const alertKind = sosKind ?? (fall.detected ? 'fall' : null);
  const homecoming = useHomecoming();
  const homecomingSent = useRef(0);
  useEffect(() => {
    if (!homecoming || !position) return;
    if (distanceM(position, homecoming) < HOMECOMING_ARRIVED_M) {
      finishHomecoming('arrived')
        .then(() => {
          speak('Bien arrivé. Tes contacts ne seront pas alertés.', true, 'info');
          showToast('« Je rentre » terminé : bien arrivé !');
        })
        .catch((e) => console.warn('Fin de « Je rentre » impossible', e));
      return;
    }
    const now = Date.now();
    if (now - homecomingSent.current < HOMECOMING_POSITION_MS) return;
    homecomingSent.current = now;
    sendHomecomingPosition(position).catch((e) => console.warn('Position « Je rentre » non envoyée', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homecoming, position?.latitude, position?.longitude]);

  // Limitation de vitesse de la route (OSM) ; dépassement : compteur rouge + bip
  const speedLimit = useSpeedLimit(position, kmh, voice.speedLimit || voice.speedAlert);
  const overLimit = voice.speedAlert && speedLimit !== null && kmh > speedLimit + SPEED_MARGIN_KMH;
  const [beepKey, setBeepKey] = useState(0);
  useEffect(() => {
    if (!overLimit) return;
    const beep = () => setBeepKey((k) => k + 1);
    const first = setTimeout(beep, 0);
    const timer = setInterval(beep, SPEED_BEEP_REPEAT_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [overLimit]);

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
  const route = navigating ? nav.route : null;
  const alongM = nav.progress?.alongM ?? null;
  const danger = dangerAhead(reports, position, heading, kmh, route, alongM);
  // Annonce vocale : seulement les types de danger choisis dans Paramètres > Voix et alertes
  const spokenReports = reports.filter((r) => !voice.mutedDangerTypes.includes(r.type));
  useDangerAnnouncements(dangerAhead(spokenReports, position, heading, kmh, route, alongM));

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
        (r) =>
          (r.visibility === 'public' || r.visibility === 'friends' || r.joined) &&
          r.status !== 'ended' &&
          isWithinDays(r.meetingAt, RIDES_ON_MAP_DAYS),
      );
  const selectedRide = layers.showRides ? (mapRides.find((r) => RIDE_PREFIX + r.id === selectedId) ?? null) : null;
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
    ...nav.stops.map((s, i) => ({
      id: `stop:${i}`,
      kind: 'step' as const,
      label: String(i + 1),
      latitude: s.latitude,
      longitude: s.longitude,
    })),
    ...(dropped
      ? [{ id: 'dropped', kind: 'dropped' as const, label: '', latitude: dropped.place.latitude, longitude: dropped.place.longitude }]
      : []),
  ];
  const toLine = (points: LatLng[]) => points.map((p) => [p.latitude, p.longitude] as [number, number]);
  // Aperçu : les autres itinéraires proposés en gris, sous celui choisi
  const alternatives: MapRoute[] =
    nav.phase === 'preview'
      ? nav.choices
          .filter((c) => c.route && !c.sameAs && c.route !== nav.route)
          .map((c) => ({ id: `alt:${c.variant}`, points: toLine(c.route!.points), color: Colors.textFaint, muted: true }))
      : [];
  const routes: MapRoute[] = nav.route
    ? [...alternatives, { id: 'nav', points: toLine(nav.route.points), color: Colors.route }]
    : selectedRide && rideRoute?.id === selectedRide.id
      ? [{ id: 'ride', points: rideRoute.points, color: Colors.accent }]
      : alternatives;
  // Aperçu : la carte cadre tout l'itinéraire (2 coins suffisent)
  const fitPoints = nav.phase === 'preview' && nav.route ? boundsOf(nav.route.points) : undefined;

  const selectedReal = liveRiders.find((r) => REAL_PREFIX + r.userId === selectedId) ?? null;
  const selectedDemo = demoRiders.find((r) => r.rider.id === selectedId) ?? null;
  const selectedReport = reports.find((r) => REPORT_PREFIX + r.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    Location.requestForegroundPermissionsAsync().then(({ status: permission }) => {
      if (!cancelled) setStatus(permission === 'granted' ? 'ready' : 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fréquence adaptative : toutes les 0,5 s en navigation (flèche fluide), sinon 1 s / 5 m (batterie)
  useEffect(() => {
    if (status !== 'ready') return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    (async () => {
      subscription = await Location.watchPositionAsync(
        navigating
          ? { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 }
          : { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
        (loc) => {
          setLocation(loc);
          // Le cap GPS n'est fiable qu'en mouvement (> 5 km/h)
          if (loc.coords.heading != null && loc.coords.heading >= 0 && (loc.coords.speed ?? 0) > MOVING_MS) {
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
  }, [status, navigating]);

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
    // Premier appui : fiche + tracé sur la carte ; la fiche ouvre la balade
    setDropped(null);
    setSelectedId(id);
    loadRideRoute(ride).catch((e) => console.warn('Tracé de la balade indisponible', e));
  };

  const loadRideRoute = async (ride: RideSummary) => {
    if (rideRoute?.id === ride.id) return;
    const details = ride.isDemo
      ? demoRide(ride.id, demo, { id: userId ?? 'me', username: profile?.username ?? 'moi', avatarUrl: '' })
      : userId
        ? await fetchRide(ride.id, userId)
        : null;
    if (!details) return;
    const points =
      details.route ??
      [details.start, ...details.waypoints, details.end].map((p) => [p.latitude, p.longitude] as [number, number]);
    setRideRoute({ id: ride.id, points });
  };

  const openRide = (ride: RideSummary) => {
    if (ride.isDemo) router.push({ pathname: '/demo-ride/[id]', params: { id: ride.id } });
    else router.push({ pathname: '/ride/[id]', params: { id: ride.id } });
  };

  // ---------- Appui long : point posé, comme Google Maps ----------
  const onLongPress = async (point: LatLng) => {
    setSelectedId(null);
    setFollow(false);
    const coords = `Point ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
    setDropped({ place: { ...point, label: coords }, resolving: true });
    const place = await reverseGeocode(point);
    // Seulement si ce point est toujours celui affiché
    setDropped((d) =>
      d && d.place.latitude === point.latitude && d.place.longitude === point.longitude ? { place, resolving: false } : d,
    );
  };

  const goToDropped = () => {
    if (!dropped) return;
    const { place } = dropped;
    setDropped(null);
    nav.choose({ label: place.label, latitude: place.latitude, longitude: place.longitude, source: 'lieu' });
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

  const reportAtDropped = () => {
    if (!dropped) return;
    setReportAt(dropped.place);
    setDropped(null);
    setReportSheet(true);
  };

  const closeReportSheet = () => {
    setReportSheet(false);
    setReportAt(null);
  };

  const report = async (type: ReportType) => {
    const at = reportAt ?? position;
    closeReportSheet();
    if (!at || !userId) return;
    const label = reportInfo(type).label;
    const existing = reports.find((r) => r.type === type && distanceM(r, at) < DUPLICATE_REPORT_M);
    try {
      if (existing) {
        await vote(existing.id, 'still_there', true);
        showToast(`${label} déjà signalé ici : merci d'avoir confirmé`);
      } else {
        await createReport(userId, type, { latitude: at.latitude, longitude: at.longitude });
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

  const stopNavigation = () => {
    nav.stop();
    speak('Navigation arrêtée', true, 'guidance');
    setFollow(true);
  };

  // Étoile de l'aperçu : Maison, Travail ou favori perso
  const favoriteMenu = () => {
    const dest = nav.destination;
    if (!dest) return;
    const fav = findFavorite(dest);
    showActionSheet({
      title: dest.label,
      options: fav
        ? [{ label: 'Retirer des favoris', destructive: true, onPress: () => removeFavorite(fav.id) }]
        : [
            { label: '🏠 Définir comme Maison', onPress: () => setFavorite(dest, 'home') },
            { label: '💼 Définir comme Travail', onPress: () => setFavorite(dest, 'work') },
            { label: '⭐ Ajouter aux favoris', onPress: () => setFavorite(dest, 'custom') },
          ],
    });
  };

  const chooseDestination = (r: Parameters<typeof nav.choose>[0]) => {
    setFollow(false);
    setSelectedId(null);
    setDropped(null);
    nav.choose(r);
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
        navigating={navigating}
        follow={follow && nav.phase !== 'preview'}
        onUserPan={() => setFollow(false)}
        onBearingChange={setBearing}
        northUpKey={northUpKey}
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
        // Pas d'appui long en navigation : on ne manipule pas la carte en roulant
        onMapLongPress={navigating ? undefined : onLongPress}
        onMarkersRendered={setRenderedCount}
        beepKey={beepKey}
        // Son bloqué par la page : alerte vocale à la place du bip
        onBeepFailed={() => speak('Vitesse', true, 'info')}
        pins={pins}
        onPinPress={onPinPress}
        routes={routes}
        fitPoints={fitPoints}
      />
      {/* Couche des commandes : couvre tout l'écran au-dessus de la carte, recherche en haut, + en bas */}
      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          {navigating ? (
            <NavBanner progress={nav.progress} danger={danger} rerouting={nav.loading} />
          ) : (
            <SearchBar
              near={position}
              onSelect={chooseDestination}
              below={nav.phase === 'idle' ? <QuickPlaces near={position} onSelect={chooseDestination} /> : null}
            />
          )}

          <View style={styles.top} pointerEvents="box-none">
            <View style={styles.left} pointerEvents="box-none">
              <Speedometer kmh={kmh} limit={voice.speedLimit ? speedLimit : null} over={overLimit} />
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
              <SosButton
                onTrigger={() => setSosKind('manual')}
                onHint={() => showToast('SOS : garde le bouton appuyé 2 secondes pour alerter tes contacts d’urgence')}
              />
              {/* Boussole : la carte a été tournée au doigt ; un appui remet le nord en haut */}
              {!navigating && Math.abs(((bearing + 540) % 360) - 180) >= 2 && (
                <Pressable
                  style={styles.compass}
                  onPress={() => setNorthUpKey((k) => k + 1)}
                  hitSlop={6}
                  accessibilityLabel="Remettre le nord en haut">
                  <View style={{ transform: [{ rotate: `${bearing}deg` }], alignItems: 'center' }}>
                    <MaterialCommunityIcons name="navigation" size={26} color={Colors.danger} />
                    <Text style={styles.compassN}>N</Text>
                  </View>
                </Pressable>
              )}
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
              {/* Muet rapide : coupe toutes les annonces vocales (mémorisé) */}
              {navigating && (
                <Pressable
                  style={[styles.layerButton, styles.navButton, voice.muted && styles.muteOn]}
                  onPress={() => updateVoiceSettings({ muted: !voice.muted })}
                  hitSlop={6}
                  accessibilityLabel={voice.muted ? 'Réactiver la voix' : 'Couper la voix'}>
                  <Ionicons name={voice.muted ? 'volume-mute' : 'volume-high'} size={32} color={voice.muted ? Colors.white : Colors.accent} />
                </Pressable>
              )}
              {!navigating && !homecoming && (
                <Pressable
                  style={styles.layerButton}
                  onPress={() => router.push('/homecoming')}
                  hitSlop={6}
                  accessibilityLabel="Je rentre : prévenir mes contacts si je n'arrive pas">
                  <Ionicons name="home-outline" size={24} color={Colors.accent} />
                </Pressable>
              )}
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
          {homecoming && (
            <Pressable style={styles.homecomingChip} onPress={() => router.push('/homecoming')}>
              <Ionicons name="home" size={18} color={Colors.white} />
              <Text style={styles.ghostBannerText}>
                Je rentre · avant{' '}
                {new Date(homecoming.deadline).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
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

        {/* Ancré en bas : si le contenu est haut, il déborde vers le haut, jamais sous l'écran */}
        <View style={styles.bottom} pointerEvents="box-none">
          <View style={styles.bottomRow} pointerEvents="box-none">
            {!follow && nav.phase !== 'preview' ? (
              <Pressable style={[styles.button, styles.recenter, navigating && styles.recenterNav]} onPress={() => setFollow(true)}>
                <Ionicons name="navigate" size={navigating ? 26 : 20} color={Colors.white} />
                <Text style={[styles.buttonText, navigating && styles.recenterNavText]}>Recentrer</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <ReportButton onPress={() => setReportSheet(true)} />
          </View>

          {dropped && !navigating && (
            <View style={styles.card}>
              <DroppedPinCard
                place={dropped.place}
                resolving={dropped.resolving}
                distanceM={position ? distanceM(position, dropped.place) : null}
                onGo={goToDropped}
                onRide={rideFromDropped}
                onReport={reportAtDropped}
                onClose={() => setDropped(null)}
              />
            </View>
          )}
          {selectedRide && (
            <View style={styles.card}>
              <RideCard
                ride={selectedRide}
                distanceFromMeM={position ? distanceM(position, selectedRide.meeting) : null}
                onPress={() => openRide(selectedRide)}
              />
              <Pressable style={styles.rideClose} onPress={() => setSelectedId(null)} hitSlop={10} accessibilityLabel="Fermer">
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}
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
              <RoutePreviewSheet
                destination={nav.destination}
                choices={nav.choices}
                variant={nav.variant}
                stops={nav.stops}
                options={nav.options}
                moto={myMoto ? `${myMoto.model}${myCategory ? ` (${categoryInfo(myCategory).short})` : ''}` : null}
                favorite={!!findFavorite(nav.destination)}
                onSelectVariant={nav.selectVariant}
                onChangeOptions={nav.updateOptions}
                onAddStop={() => setStopPicker({ kind: null })}
                onRemoveStop={nav.removeStop}
                onFavorite={favoriteMenu}
                onStart={() => {
                  setSelectedId(null);
                  setDropped(null);
                  setFollow(true);
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
              <NavSheet
                progress={nav.progress}
                stops={nav.stops}
                sharedWith={nav.shares.map((x) => x.username)}
                onStop={stopNavigation}
                onFuel={() => setStopPicker({ kind: 'fuel' })}
                onAddStop={() => setStopPicker({ kind: null })}
                onShare={() => setShareSheet(true)}
                onRemoveStop={nav.removeStop}
              />
            </View>
          )}
        </View>
      </View>

      {stopPicker && (
        <StopPicker
          initialKind={stopPicker.kind}
          route={nav.route}
          fromM={nav.progress?.alongM ?? 0}
          near={position}
          onPick={nav.addStop}
          onClose={() => setStopPicker(null)}
        />
      )}
      {shareSheet && (
        <ShareTripSheet
          visible
          sharedWith={nav.shares.map((x) => x.friendId)}
          onShare={(friend) => nav.share(friend)}
          onClose={() => setShareSheet(false)}
        />
      )}
      {alertKind && userId && (
        <SafetyOverlay
          kind={alertKind}
          userId={userId}
          position={position}
          onClose={() => {
            setSosKind(null);
            fall.reset();
          }}
        />
      )}
      <TripSummaryModal
        trip={nav.summary}
        onClose={nav.clearSummary}
        onOpenHistory={() => {
          nav.clearSummary();
          router.push('/trips');
        }}
      />
      <ReportSheet visible={reportSheet} onPick={report} onClose={closeReportSheet} />
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
  // En navigation : boutons plus gros, utilisables avec des gants
  navButton: { width: 64, height: 64, borderRadius: 32 },
  layerStrike: {
    position: 'absolute',
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    transform: [{ rotate: '-45deg' }],
  },
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
  compass: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  compassN: { fontSize: 10, fontWeight: '900', color: Colors.text, marginTop: -4 },
  muteOn: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  recenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recenterNav: { minHeight: 64, paddingHorizontal: 24, borderRadius: 32 },
  recenterNavText: { fontSize: 18, fontWeight: '800' },
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
  homecomingChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 4,
  },
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
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 12 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  card: { alignSelf: 'stretch' },
  // Posé sur le coin de la fiche, au-dessus (le badge de niveau occupe le coin haut droit)
  rideClose: {
    position: 'absolute',
    top: -14,
    right: -4,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  button: { backgroundColor: Colors.accent, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
}));
