import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard, FuelStationCard, ParkingCard, PlaceCard } from '@/components/community-cards';
import { openEvent, openPlace } from '@/components/community-lists';
import { ConvoyPanel } from '@/components/convoy-panel';
import { LeafletMap, type MapMarker, type MapPin, type MapPosition, type MapRoute } from '@/components/leaflet-map';
import { DroppedPinCard, type RidePlaceRole } from '@/components/nav/dropped-pin-card';
import { showActionSheet } from '@/components/action-sheet';
import { FuelSuggestionCard, NavBanner, NavSheet, ReportButton, RoutePreviewSheet, Speedometer } from '@/components/nav/nav-ui';
import { QuickPlaces } from '@/components/nav/quick-places';
import { DangerButton, PassengerToggle, QuickReportSheet, UndoReportBar } from '@/components/nav/quick-report';
import { ReportCard, ReportSheet } from '@/components/nav/report-ui';
import { SearchBar } from '@/components/nav/search-bar';
import { ShareTripSheet } from '@/components/nav/share-trip-sheet';
import { StopPicker } from '@/components/nav/stop-picker';
import { TripSummaryModal } from '@/components/trip-summary';
import { PlaceFilterSheet } from '@/components/place-filter-sheet';
import { MapWeather } from '@/components/map-weather';
import { BreakBanner, FuelCheckBanner } from '@/components/nav/moto-alerts';
import { useBreakReminder, useCurveAlerts, useSunAlerts } from '@/lib/moto-alerts';
import { getSimulation, useSimulatedLocation, useSimulation } from '@/lib/simulation';
import { motoLabel, PersonCard } from '@/components/person-card';
import { RideCard } from '@/components/ride-card';
import { SafetyOverlay } from '@/components/safety/safety-overlay';
import { SosButton } from '@/components/safety/sos-button';
import { MapCompass, setMapBearing } from '@/components/nav/map-compass';
import { HudStatusIcon, NAV_RAIL_BUTTON, NavHud, type HudAlert } from '@/components/nav/nav-hud';
import { PerfBadge } from '@/components/nav/perf-badge';
import { NavMapGL } from '@/components/nav-map-gl';
import { shortDistance } from '@/lib/navigation';
import { TipBubble } from '@/components/guide/tip-bubble';
import { roadMapRoutes } from '@/components/road-lines';
import { DANGER_ZONE_ROUTE, makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { recordTrip, retryPendingPasses } from '@/lib/badges';
import { setAppBusy } from '@/lib/app-busy';
import { useConvoy } from '@/lib/convoy';
import { eventKindInfo } from '@/lib/events';
import { placeKindInfo } from '@/lib/places';
import { readTrack } from '@/lib/trips';
import { OUTING_MIN_KM, setTripReward } from '@/lib/outings';
import { canUse, useCanUse } from '@/lib/features';
import { recordTripPoints, refreshBadgesAfterGain, useGoodDrivingTracker, useGoodPointsEnabled } from '@/lib/good-points';
import { useCommunityPlaces, useEvents } from '@/lib/use-community';
import { DRIVING_LOCK_SPEED_KMH, useDrivingLock } from '@/lib/driving-lock';
import { needsFuel, useFuelAlert, useSparseStationReminder } from '@/lib/fuel';
import { cheapestStation, formatPrice, fuelLabel, nextStation, priceOf, routeFuelSummary, stationTitle, useFuelStations, useRouteStations } from '@/lib/fuel-prices';
import { addMotorcycleKm, fuelRange, markFilled, useMyGarage } from '@/lib/garage';
import { takePendingGpx, viaPointsAlong } from '@/lib/gpx';
import { MAP_DEFAULT_DAYS, MAP_MIN_SPOT_RATING, useMapLayers } from '@/lib/map-layers';
import { parkingTitle, useMotoParkings } from '@/lib/moto-parkings';
import { useTrafficSignals } from '@/lib/traffic-signals';
import { fuelPinIcon, parkingPinIcon, placePinIcon, reportPinIcon, signalPinIcon, zonePinIcon } from '@/lib/map-pin-icons';
import { segmentPoints, useDangerZoneAlerts, useMapDangerZones, useRouteDangerZones, zoneSegments } from '@/lib/danger-zones';
import { useFallDetection } from '@/lib/fall-detection';
import { findFavorite, removeFavorite, setFavorite } from '@/lib/favorites';
import { distanceM, type LatLng } from '@/lib/geo';
import { errorMessage } from '@/lib/errors';
import { finishHomecoming, sendHomecomingPosition, useHomecoming } from '@/lib/homecoming';
import type { Place } from '@/lib/geocoding';
import type { LivePositionInput } from '@/lib/live-location';
import { usePrivacy } from '@/lib/privacy-context';
import { categoryInfo } from '@/lib/moto';
import { saveLastPosition, useDefaultMapView } from '@/lib/map-start';
import { mainCategory, mainMotorcycle, photoUrl } from '@/lib/profile';
import type { PoiKind } from '@/lib/pois';
import { addPending, PENDING_MAX_MS, readPending, removePending, usePassengerMode, usePendingDangers } from '@/lib/quick-danger';
import { createReport, deleteReport, reportAge, reportInfo, setReportType, voteReport, type ReportType, type Vote } from '@/lib/reports';
import { fetchRide, RIDE_ROLES, setRegroupPoint, type RideSummary } from '@/lib/rides';
import { reverseGeocode } from '@/lib/search';
import { useSession } from '@/lib/session';
import { useLimitChangeAlerts } from '@/lib/limit-changes';
import { useRouteSpeedLimit, useSpeedLimit, type LimitRun } from '@/lib/speed-limit';
import { signalMapReady, startupMark, useStartupDone, whenStartupDone } from '@/lib/startup';
import { recordNavEngine, setNavEnginePref, useNavEnginePref } from '@/lib/nav-engine';
import { AUTO_RECENTER_MS, routeBearingAt } from '@/lib/nav-view';
import { initialHeadingFilter, STILL_KMH, stepHeadingFilter } from '@/lib/heading-filter';
import { dangerAhead, useDangerAnnouncements } from '@/lib/use-danger-alerts';
import { useFriends } from '@/lib/use-friends';
import { useLiveRiders } from '@/lib/use-live-riders';
import { useNavigation } from '@/lib/use-navigation';
import { useNavZoom } from '@/lib/use-nav-view';
import { useUpcomingRides } from '@/lib/use-rides';
import { useRoadReports } from '@/lib/use-road-reports';
import { isSpeaking, speak, updateVoiceSettings, useVoiceSettings } from '@/lib/voice';
import { roundedNow, spokenWeatherAlert, useNavWeather, useRouteWeather } from '@/lib/weather';
import { ReportIcon, ZoneIcon } from '@/components/map-icon';

/** ask : pas encore demandé (carte d'explication avant la fenêtre d'Android) */
type Status = 'loading' | 'ask' | 'denied' | 'ready';

const REAL_PREFIX = 'user:';
const REGROUP_PIN = 'regroup';
const RIDE_PREFIX = 'ride:';
const REPORT_PREFIX = 'report:';
const PLACE_PREFIX = 'place:';
const EVENT_PREFIX = 'event:';
const PARKING_PREFIX = 'parking:';
const FUEL_PREFIX = 'fuel:';
/** Événements affichés sur la carte : dans les 60 jours */
const EVENTS_ON_MAP_DAYS = 60;
/** Balades affichées sur la carte : publiques, entre amis ou auxquelles je participe, dans les 30 jours */
const RIDES_ON_MAP_DAYS = 30;
/** Un signalement du même type à moins de 150 m est confirmé au lieu d'être dupliqué */
const DUPLICATE_REPORT_M = 150;
/** Délai pour annuler un signalement choisi dans la grille */
const UNDO_MS = 5000;
/** Tolérance avant l'alerte de vitesse (le compteur GPS est précis à quelques km/h) */
const SPEED_MARGIN_KMH = 3;
/** Toujours au-dessus de la limitation : nouveau bip toutes les 20 s */
const SPEED_BEEP_REPEAT_MS = 20_000;
/** Après un changement de limitation, premier bip de dépassement au plus tôt 8 s plus tard */
const SPEED_BEEP_GRACE_MS = 8000;
/** Voix occupée : bip reporté */
const SPEED_BEEP_BUSY_RETRY_MS = 1500;
const NO_LIMIT_RUNS: LimitRun[] = [];
const KEEP_AWAKE_TAG = 'navigation';
// v2 : l'ancienne clé gardait souvent « nord en haut » choisi par erreur (1er appui sur la boussole) ;
// tout le monde repart en mode conduite, puis le choix est de nouveau mémorisé
const NAV_ORIENTATION_KEY = 'moto.nav.orientation.v2';
/** « Je rentre » : position envoyée toutes les minutes, arrivée détectée à 150 m */
const HOMECOMING_POSITION_MS = 60_000;
const HOMECOMING_ARRIVED_M = 150;
/** Tracé GPX suivi en navigation : points de passage imposés au calcul d'itinéraire */
const GPX_VIA_POINTS = 6;
/** Balade : déjà au départ (< 300 m), on ne repasse pas par lui */
const RIDE_START_SKIP_M = 300;

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
  const headingFilter = useRef(initialHeadingFilter());
  // La carte suit ma position (et mon cap en navigation) ; coupé dès que je la déplace ou la tourne
  const [follow, setFollow] = useState(true);
  // Dernier toucher de la carte (navigation : retour automatique au mode conduite 10 s après)
  const [panAt, setPanAt] = useState(0);
  // « Voir tout le trajet » : pas de retour automatique tant qu'on ne touche pas la carte
  const [overview, setOverview] = useState(false);
  // Un compteur par carte : seule la carte affichée reçoit la demande
  const [overviewKey, setOverviewKey] = useState({ gl: 0, leaflet: 0 });
  const onMapPan = () => {
    setFollow(false);
    setOverview(false);
    setPanAt(Date.now());
  };
  const recenter = () => {
    setOverview(false);
    setFollow(true);
  };
  const [northUpKey, setNorthUpKey] = useState(0);
  // Navigation : ma direction en haut (par défaut) ou nord en haut, au bouton boussole (mémorisé)
  const [navOrientation, setNavOrientation] = useState<'heading' | 'north'>(() => {
    try {
      return localStorage.getItem(NAV_ORIENTATION_KEY) === 'north' ? 'north' : 'heading';
    } catch {
      return 'heading';
    }
  });
  const toggleNavOrientation = () => {
    const next = navOrientation === 'heading' ? 'north' : 'heading';
    setNavOrientation(next);
    // « Cap en haut » : la carte suit de nouveau ma direction
    if (next === 'heading') setFollow(true);
    try {
      localStorage.setItem(NAV_ORIENTATION_KEY, next);
    } catch {
      // stockage indisponible : le choix vaut pour cette navigation
    }
  };
  const voice = useVoiceSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingGhost, setTogglingGhost] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  // Grille des 6 gros dangers (à l'arrêt ou passager), envoi annulable 5 s
  const [quickSheet, setQuickSheet] = useState(false);
  const [undo, setUndo] = useState<{ type: ReportType; at: LatLng; deadline: number } | null>(null);
  const [undoNow, setUndoNow] = useState(0);
  const [passenger, setPassenger] = usePassengerMode();
  const pendingDangers = usePendingDangers();
  const [pendingDismissed, setPendingDismissed] = useState(false);
  const [placeFilter, setPlaceFilter] = useState(false);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 3000);
  };

  // Point posé par appui long, et lieu visé par le prochain signalement (sinon ma position)
  const [dropped, setDropped] = useState<{ place: Place; resolving: boolean } | null>(null);
  const [reportAt, setReportAt] = useState<LatLng | null>(null);
  // Balade touchée sur la carte : son tracé est affiché
  const [rideRoute, setRideRoute] = useState<{ id: string; points: [number, number][] } | null>(null);
  // Démarrage : la carte et ma position d'abord ; repères (balades, spots, événements, parkings) ensuite
  const startupDone = useStartupDone();
  // Nombre d'affichages de l'écran pendant le démarrage (diagnostic des re-rendus)
  const renders = useRef(0);
  useEffect(() => {
    renders.current += 1;
  });
  useEffect(() => startupMark('écran carte monté'), []);
  useEffect(() => {
    if (startupDone) startupMark(`écran carte : ${renders.current} rendus pendant le démarrage`);
  }, [startupDone]);
  const ghost = settings?.mode === 'ghost';
  const insets = useSafeAreaInsets();
  const layers = useMapLayers();
  // Zone affichée (parkings moto OpenStreetMap de la zone)
  const [mapView, setMapView] = useState<{ center: LatLng; zoom: number } | null>(null);

  // Flèche : cap GPS filtré (lib/heading-filter.ts : lissé en mouvement, figé à l'arrêt), le même
  // que celui publié aux amis ; boussole seulement hors navigation et sans aucun cap GPS connu
  const position: MapPosition | null = location && {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    heading,
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
  /** En roulant (> 10 km/h) : un seul gros bouton ⚠️, aucune autre manipulation demandée */
  const riding = kmh > DRIVING_LOCK_SPEED_KMH;

  // ---------- Navigation ----------
  const myCategory = mainCategory(profile);
  const myMoto = mainMotorcycle(profile);
  const nav = useNavigation(position, kmh, myCategory, userId);
  const navigating = nav.phase === 'navigating';
  // Mode test admin : position simulée le long de l'itinéraire, jamais publiée ni comptée
  const sim = useSimulation();
  const simulating = sim.active && navigating;
  const simulatedNav = useRef(false);
  useEffect(() => {
    if (navigating) simulatedNav.current = getSimulation().active;
  }, [navigating]);
  const navZoom = useNavZoom(navigating, kmh);
  // Carte de navigation : 3D inclinée (MapLibre, par défaut) posée sur Leaflet, ou 2D (Leaflet seule).
  // Sans WebGL / MapLibre / style : repli automatique sur Leaflet pour cette navigation.
  const enginePref = useNavEnginePref();
  const [gl, setGl] = useState<{ failed: string | null; shown: boolean }>({ failed: null, shown: false });
  const glWanted = navigating && enginePref === '3d' && !gl.failed;
  const glShown = glWanted && gl.shown;
  const resetGl = () => setGl({ failed: null, shown: false });
  // Fin de navigation (arrivée comprise) : la prochaine repart de zéro (nouvel essai de la 3D)
  const [glNav, setGlNav] = useState(navigating);
  if (glNav !== navigating) {
    setGlNav(navigating);
    if (!navigating) resetGl();
  }
  useEffect(() => {
    if (navigating && enginePref === '2d') recordNavEngine('2d', 'vue 2D choisie dans le menu ⋯');
  }, [navigating, enginePref]);
  // Navigation sans cap connu (départ à l'arrêt) : sens de l'itinéraire, la carte est déjà dans le bon sens
  // À l'arrêt : boussole (lib/compass-stream.ts, envoyée directement à la carte) — faisceau hors
  // navigation, flèche en navigation ; la carte, elle, ne tourne jamais avec la boussole
  const compassMode = status === 'ready' && kmh < STILL_KMH ? (navigating ? 'arrow' : 'beam') : null;
  const startBearing =
    position && navigating && position.heading == null && nav.route
      ? routeBearingAt(nav.route.points, nav.route.cumulative, nav.progress?.alongM ?? 0)
      : null;
  const mapPosition: MapPosition | null =
    position && position.heading == null && startBearing !== null ? { ...position, heading: startBearing } : position;
  // Carte déplacée à la main en navigation : mode conduite de nouveau après 10 s sans toucher
  useEffect(() => {
    if (!navigating || follow || overview) return;
    const t = setTimeout(() => setFollow(true), AUTO_RECENTER_MS);
    return () => clearTimeout(t);
  }, [navigating, follow, overview, panAt]);
  useSimulatedLocation(simulating, nav.route, (loc) => {
    setLocation(loc);
    if (loc.coords.heading != null) setHeading(loc.coords.heading);
  });
  const [stopPicker, setStopPicker] = useState<{ kind: PoiKind | null } | null>(null);
  const [shareSheet, setShareSheet] = useState(false);

  // ---------- Garage : autonomie de la moto principale, compteur mis à jour à la fin du trajet ----------
  const garage = useMyGarage(userId);
  const myGarage = myMoto ? (garage?.[myMoto.id]?.garage ?? null) : null;
  const fuelLeftKm = fuelRange(myGarage, nav.tripM / 1000)?.leftKm ?? null;
  const previewFuel =
    fuelLeftKm !== null && nav.route ? { leftKm: fuelLeftKm, needed: needsFuel(fuelLeftKm, nav.route.distanceM / 1000) } : null;
  // Stations ajoutées par la communauté (spots « station »), proposées avec celles d'OpenStreetMap
  const { places: communityPlaces } = useCommunityPlaces(position);
  const fuelSpots = (communityPlaces ?? []).filter((p) => p.kind === 'fuel').map((p) => ({ label: `⛽ ${p.name}`, latitude: p.latitude, longitude: p.longitude }));
  // Carburant de ma moto (Garage) : SP95-E10 par défaut pour les prix mis en avant
  const myFuel = myGarage?.fuelType ?? 'e10';
  // Stations aux prix officiels à moins de 2 km de l'itinéraire (aperçu et navigation)
  const routeStations = useRouteStations(nav.route, (nav.phase === 'preview' || navigating) && startupDone);
  const cheapOnRoute = routeStations ? cheapestStation(routeStations, myFuel) : null;
  const upcoming = navigating ? nextStation(routeStations, nav.progress?.alongM ?? 0) : null;
  const upcomingPrice = upcoming ? priceOf(upcoming, myFuel) : null;
  const nextStationText = upcoming
    ? `Prochaine station dans ${Math.max(1, Math.round((upcoming.alongM - (nav.progress?.alongM ?? 0)) / 1000))} km${upcomingPrice !== null ? ` · ${fuelLabel(myFuel)} ${formatPrice(upcomingPrice)}` : ''}`
    : null;
  const sparseReminder = useSparseStationReminder({
    navigating,
    stations: routeStations,
    alongM: nav.progress?.alongM ?? null,
    routeM: nav.route?.distanceM ?? 0,
    leftKm: fuelLeftKm,
  });
  const fuelAlert = useFuelAlert({
    fuel: myFuel,
    navigating,
    leftKm: fuelLeftKm,
    remainingKm: nav.progress ? nav.progress.remainingM / 1000 : null,
    route: navigating ? nav.route : null,
    alongM: nav.progress?.alongM ?? 0,
    spots: fuelSpots,
  });
  const countedTrip = useRef<string | null>(null);
  const myMotoId = myMoto?.id ?? null;
  useEffect(() => {
    const trip = nav.summary;
    if (!trip || countedTrip.current === trip.id || simulatedNav.current) return;
    countedTrip.current = trip.id;
    if (myMotoId) addMotorcycleKm(myMotoId, trip.distanceM / 1000).catch((e) => console.warn('Compteur non mis à jour', e));
    // Badges : km et cols franchis
    recordTrip(trip.distanceM / 1000, readTrack(trip.id), trip.id)
      .then((newPasses) => {
        if (newPasses > 0) setTimeout(() => showToast(`⛰️ ${newPasses} nouveau${newPasses > 1 ? 'x' : ''} col${newPasses > 1 ? 's' : ''} franchi${newPasses > 1 ? 's' : ''} !`), 1500);
      })
      .catch((e) => console.warn('Statistiques non mises à jour', e));
  }, [nav.summary, myMotoId]);

  // Cols des trajets précédents pas encore cherchés (Overpass saturé) : nouvel essai à l'ouverture
  useEffect(() => {
    whenStartupDone().then(() => retryPendingPasses(readTrack).catch(() => {}));
  }, []);

  // Météo le long de l'itinéraire proposé, à l'heure de passage
  const previewWeather = useRouteWeather(
    nav.phase === 'preview' && nav.route ? nav.route.points : null,
    nav.route?.durationS ?? null,
    roundedNow(),
  );

  // Navigation : prochain phénomène météo devant moi (pluie, vent fort, gel…)
  const navWeather = useNavWeather(navigating && voice.weatherAlerts ? nav.route : null, nav.progress?.alongM ?? null);

  // ---------- Alertes moto (voix + bandeau, désactivables dans Voix et alertes) ----------
  const curveAlert = useCurveAlerts(navigating && voice.curveAlerts, nav.route, nav.progress?.alongM ?? null);
  const sunAlert = useSunAlerts(navigating && voice.sunAlerts, position, nav.progress?.remainingS ?? null);
  const breakSpots = (communityPlaces ?? [])
    .filter((p) => p.kind === 'biker_cafe' || p.kind === 'viewpoint')
    .map((p) => ({ label: `${p.kind === 'biker_cafe' ? '☕' : '🏞️'} ${p.name}`, latitude: p.latitude, longitude: p.longitude }));
  const breakReminder = useBreakReminder({
    active: navigating,
    kmh,
    intervalMin: voice.breakReminderMin,
    route: nav.route,
    alongM: nav.progress?.alongM ?? null,
    spots: breakSpots,
  });

  // Départ d'une navigation : « Plein fait ? » (à l'arrêt seulement ; disparaît dès qu'on roule)
  const [fuelCheck, setFuelCheck] = useState(false);
  const hasFuelRange = !!fuelRange(myGarage);
  useEffect(() => {
    const t = setTimeout(() => setFuelCheck(navigating && hasFuelRange), 0);
    return () => clearTimeout(t);
  }, [navigating, hasFuelRange]);
  useEffect(() => {
    if (fuelCheck && kmh > DRIVING_LOCK_SPEED_KMH) {
      const t = setTimeout(() => setFuelCheck(false), 0);
      return () => clearTimeout(t);
    }
  }, [fuelCheck, kmh]);
  const pickFuelLevel = (level: number) => {
    setFuelCheck(false);
    if (!myGarage) return;
    markFilled(myGarage, nav.tripM / 1000, level)
      .then(() => showToast(level === 1 ? 'Plein noté' : 'Niveau noté : autonomie mise à jour'))
      .catch((e) => Alert.alert('Carburant', e instanceof Error ? e.message : String(e)));
  };

  // Écran toujours allumé pendant la navigation
  useEffect(() => {
    if (!navigating) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((e) => console.warn('Écran allumé impossible', e));
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [navigating]);

  // ---------- Sécurité : SOS, détection de chute, « Je rentre » ----------
  const [sosKind, setSosKind] = useState<'manual' | null>(null);
  // Détection de chute pendant une navigation ou une balade en cours à laquelle je participe
  const inLiveRide = (rides ?? []).some((r) => r.status === 'live' && r.joined);
  const fall = useFallDetection(navigating || inLiveRide, kmh);
  const alertKind = sosKind ?? (fall.detected ? 'fall' : null);
  const homecoming = useHomecoming();
  const homecomingSent = useRef(0);
  useEffect(() => {
    if (!homecoming || !position || simulating) return;
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

  // Points de bon comportement (opt-in) : la limitation sert aussi à compter les km propres
  const goodPointsEnabled = useGoodPointsEnabled();
  const goodPointsAllowed = useCanUse('good_points');
  const pointsOn = goodPointsEnabled && goodPointsAllowed;

  // Limitation de vitesse de la route (OSM) ; dépassement : compteur rouge + bip
  // En navigation : limitations du tracé chargées d'avance par morceaux ; sinon (ou hors itinéraire) en direct
  const limitWanted = voice.speedLimit || voice.speedAlert || (navigating && (pointsOn || voice.limitChanges));
  const { limit: routeLimit, runs: limitRuns } = useRouteSpeedLimit(
    navigating ? nav.route : null,
    nav.progress?.alongM ?? null,
    limitWanted && navigating && !nav.progress?.offRoute,
  );
  const liveLimit = useSpeedLimit(position, kmh, limitWanted && routeLimit === undefined);
  const speedLimit = routeLimit !== undefined ? routeLimit : liveLimit;
  const overLimit = voice.speedAlert && speedLimit !== null && kmh > speedLimit + SPEED_MARGIN_KMH;
  // Changement de limitation : panneau animé + « Limitation à 50. » (signal discret si voix coupée)
  const limitAlerts = useLimitChangeAlerts(navigating && voice.limitChanges, {
    runs: navigating && !nav.progress?.offRoute ? limitRuns : NO_LIMIT_RUNS,
    alongM: nav.progress?.alongM ?? null,
    position,
    kmh,
    live: routeLimit === undefined ? liveLimit : null,
  });
  const lastLimitChangeAt = limitAlerts.lastChangeAt;
  const [beepKey, setBeepKey] = useState(0);
  useEffect(() => {
    if (!overLimit) return;
    // Jamais par-dessus une annonce (guidage > zone de danger > limitation > bip) ; juste après un
    // changement de limitation, le temps de ralentir avant le premier bip
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const beep = () => {
      isSpeaking().then((busy) => {
        if (stopped) return;
        if (busy) retry = setTimeout(beep, SPEED_BEEP_BUSY_RETRY_MS);
        else setBeepKey((k) => k + 1);
      });
    };
    const grace = Math.max(0, lastLimitChangeAt() + SPEED_BEEP_GRACE_MS - Date.now());
    const first = setTimeout(beep, grace);
    const timer = setInterval(beep, SPEED_BEEP_REPEAT_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearTimeout(retry);
      clearInterval(timer);
    };
  }, [overLimit, lastLimitChangeAt]);

  // Km propres et trajet sans téléphone, envoyés à la fin de la navigation (plafonnés par le serveur)
  const { onTouch: onDrivingTouch, snapshot: drivingSnapshot } = useGoodDrivingTracker(navigating && pointsOn, position, kmh, speedLimit);
  const pointedTrip = useRef<string | null>(null);
  useEffect(() => {
    const trip = nav.summary;
    if (!trip || !pointsOn || pointedTrip.current === trip.id || simulatedNav.current) return;
    pointedTrip.current = trip.id;
    const { cleanKm, phoneFree } = drivingSnapshot();
    recordTripPoints(trip.id, trip.distanceM / 1000, cleanKm, phoneFree)
      .then(async (points) => {
        if (points <= 0) return;
        setTimeout(() => showToast(`+${points} points de bon comportement`), 3000);
        setTripReward(trip.id, { points, badges: [] });
        const fresh = await refreshBadgesAfterGain();
        setTripReward(trip.id, { points, badges: fresh.map((b) => `${b.emoji} ${b.label}`) });
      })
      .catch((e) => console.warn('Points non enregistrés', e));
  }, [nav.summary, pointsOn, drivingSnapshot]);

  // Sortie de plus de 5 km (navigation ou boucle) : écran « Ta sortie » (récap partageable) au lieu du simple résumé
  const outingShown = useRef<string | null>(null);
  const { summary: navSummary, clearSummary } = nav;
  useEffect(() => {
    if (!navSummary || navSummary.distanceM < OUTING_MIN_KM * 1000 || outingShown.current === navSummary.id) return;
    outingShown.current = navSummary.id;
    router.push({ pathname: '/outing', params: { trip: navSummary.id } });
    clearSummary();
  }, [navSummary, clearSummary]);

  // Sécurité : pas de saisie de texte en navigation au-dessus de 10 km/h
  const { setLocked } = useDrivingLock();
  const locked = navigating && kmh > DRIVING_LOCK_SPEED_KMH;
  useEffect(() => {
    setLocked(locked);
  }, [locked, setLocked]);
  useEffect(() => () => setLocked(false), [setLocked]);

  // ---------- Signalements ----------
  const { reports, refresh: refreshReports } = useRoadReports(position);
  const route = navigating ? nav.route : null;
  const alongM = nav.progress?.alongM ?? null;
  const danger = dangerAhead(reports, position, heading, kmh, route, alongM);
  // Annonce vocale : seulement les types de danger choisis dans Paramètres > Voix et alertes
  const spokenReports = reports.filter((r) => !voice.mutedDangerTypes.includes(r.type));
  useDangerAnnouncements(dangerAhead(spokenReports, position, heading, kmh, route, alongM), kmh);

  // ---------- Motards réels : Supabase ne renvoie que ceux que j'ai le droit de voir ----------
  const liveRiders = useLiveRiders(userId, simulating ? null : me, settings?.mode ?? null);
  // Nouveau compte sans amis : petite invitation sur la carte (sinon elle paraît vide)
  const { state: friendsState } = useFriends();
  const noFriends = !!friendsState && friendsState.friends.length === 0 && friendsState.incoming.length === 0;
  // Balade du jour : check-in automatique au RDV, puis convoi (qui décroche ?) pendant la balade
  const convoy = useConvoy({
    rides,
    userId,
    liveRiders,
    me: position,
    onCheckIn: (r) => showToast(`Check-in au RDV : tu es pointé présent pour « ${r.title} »`),
  });
  // Mise à jour : jamais de redémarrage pendant une navigation, un convoi en cours ou un SOS / une chute
  const convoyLive = convoy?.ride.status === 'live';
  const alertActive = !!(sosKind ?? (fall.detected ? 'fall' : null));
  useEffect(() => setAppBusy('navigation', navigating), [navigating]);
  useEffect(() => setAppBusy('convoy', convoyLive), [convoyLive]);
  useEffect(() => setAppBusy('sos', alertActive), [alertActive]);
  const droppedIds = new Set(convoy?.dropped.map((m) => m.id) ?? []);
  // Convoi : badge ouvreur / serre-file sur la pastille
  const convoyRoles = new Map((convoy?.ride.participants ?? []).filter((p) => p.role).map((p) => [p.id, RIDE_ROLES[p.role!].emoji]));
  const markers: MapMarker[] = liveRiders.map((r) => ({
    id: REAL_PREFIX + r.userId,
    latitude: r.latitude,
    longitude: r.longitude,
    photoUrl: photoUrl(r.avatarPath),
    tone: droppedIds.has(r.userId) ? 'alert' : (r.speedKmh ?? 0) < 1 ? 'muted' : 'default',
    badge: convoyRoles.get(r.userId),
  }));

  // ---------- Lieux motards et événements ----------
  const { events } = useEvents();
  // Par défaut : spots bien notés, balades / événements des 7 prochains jours (le reste via les Filtres)
  const mapPlaces =
    navigating || !layers.showPlaces
      ? []
      : (communityPlaces ?? []).filter(
          (p) =>
            !layers.hiddenPlaceKinds.includes(p.kind) &&
            (layers.allSpots || p.createdBy === userId || (p.rating ?? 0) >= MAP_MIN_SPOT_RATING),
        );
  const mapEvents =
    navigating || !layers.showRides
      ? []
      : (events ?? []).filter((e) => isWithinDays(e.startsAt, layers.allDates || e.myStatus ? EVENTS_ON_MAP_DAYS : MAP_DEFAULT_DAYS));
  const selectedPlace = mapPlaces.find((p) => PLACE_PREFIX + p.id === selectedId) ?? null;
  const selectedEvent = mapEvents.find((e) => EVENT_PREFIX + e.id === selectedId) ?? null;
  const parkings = useMotoParkings(mapView, layers.showParkings && !navigating);
  const selectedParking = parkings.find((p) => PARKING_PREFIX + p.id === selectedId) ?? null;
  // Stations-service : zone affichée hors navigation ; en aperçu, celles du trajet (la moins chère en plus gros)
  const areaStations = useFuelStations(mapView, layers.showFuel && !navigating && nav.phase !== 'preview');
  const mapStations = nav.phase === 'preview' ? (routeStations ?? []) : navigating ? [] : areaStations;
  const selectedStation = mapStations.find((s) => FUEL_PREFIX + s.id === selectedId) ?? null;
  // Feux tricolores (affichés de base, zoom ≥ 16) : en navigation, ceux de l'itinéraire autour de ma position ; sinon la zone affichée
  const signalsView = navigating ? (position ? { center: position, zoom: 17 } : null) : mapView;
  const signals = useTrafficSignals(signalsView, !layers.hideSignals, navigating ? (nav.route?.points ?? null) : null);

  // ---------- Zones de danger (points noirs officiels + dangers confirmés de la commu) ----------
  const routeZones = useRouteDangerZones(navigating ? nav.route : null, navigating);
  const zoneSegs = useMemo(
    () => (navigating && nav.route ? zoneSegments(nav.route, routeZones, reports) : []),
    [navigating, nav.route, routeZones, reports],
  );
  const zoneNow = useDangerZoneAlerts(zoneSegs, nav.progress?.alongM ?? null, navigating && voice.dangerZones);
  // Hors navigation : seulement de près (zoom ≥ 14)
  const mapZones = useMapDangerZones(navigating ? null : mapView, !navigating && layers.showReports);

  // ---------- Repères : RDV de balades, signalements, destination ----------
  const mapRides = navigating
    ? []
    : (rides ?? []).filter(
        (r) =>
          (r.visibility === 'public' || r.visibility === 'friends' || r.joined) &&
          r.status !== 'ended' &&
          isWithinDays(r.meetingAt, layers.allDates || r.joined ? RIDES_ON_MAP_DAYS : MAP_DEFAULT_DAYS),
      );
  const selectedRide = layers.showRides ? (mapRides.find((r) => RIDE_PREFIX + r.id === selectedId) ?? null) : null;
  const allPins: MapPin[] = [
    ...(layers.showRides ? mapRides : []).map((r) => ({
      id: RIDE_PREFIX + r.id,
      kind: 'meeting' as const,
      cluster: true,
      label: rideLabel(r),
      latitude: r.meeting.latitude,
      longitude: r.meeting.longitude,
    })),
    ...mapPlaces.map((p) => ({
      id: PLACE_PREFIX + p.id,
      kind: 'place' as const,
      cluster: true,
      label: placeKindInfo(p.kind).short,
      icon: placePinIcon(p.kind),
      latitude: p.latitude,
      longitude: p.longitude,
    })),
    ...mapStations.map((s) => ({
      id: FUEL_PREFIX + s.id,
      kind: 'fuel' as const,
      cluster: !(nav.phase === 'preview' && cheapOnRoute?.id === s.id),
      label: '⛽',
      icon: fuelPinIcon(nav.phase === 'preview' && cheapOnRoute?.id === s.id),
      latitude: s.latitude,
      longitude: s.longitude,
    })),
    ...parkings.map((p) => ({
      id: PARKING_PREFIX + p.id,
      kind: 'parking' as const,
      cluster: true,
      label: 'P',
      icon: parkingPinIcon(),
      latitude: p.latitude,
      longitude: p.longitude,
    })),
    ...mapEvents.map((e) => ({
      id: EVENT_PREFIX + e.id,
      kind: 'event' as const,
      cluster: true,
      label: eventLabel(e.kind, e.startsAt),
      latitude: e.place.latitude,
      longitude: e.place.longitude,
    })),
    ...(layers.showReports ? reports : []).map((r) => ({
      id: REPORT_PREFIX + r.id,
      kind: 'report' as const,
      label: reportInfo(r.type).label,
      icon: reportPinIcon(r.type),
      latitude: r.latitude,
      longitude: r.longitude,
    })),
    ...(navigating
      ? zoneSegs.map((s, i) => {
          const at = segmentPoints(nav.route!, s)[0];
          return at ? { id: `zone:${i}`, kind: 'zone' as const, label: 'Zone de danger', icon: zonePinIcon(), latitude: at.latitude, longitude: at.longitude } : null;
        })
      : mapZones.map((z) => ({ id: `zone:${z.id}`, kind: 'zone' as const, label: 'Zone de danger', icon: zonePinIcon(), latitude: z.latitude, longitude: z.longitude }))
    ).filter((p) => p !== null),
    ...signals.map((p, i) => ({
      id: `signal:${i}`,
      kind: 'signal' as const,
      label: '',
      icon: signalPinIcon(),
      latitude: p.latitude,
      longitude: p.longitude,
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
    ...(convoy?.ride.regroup
      ? [{ id: REGROUP_PIN, kind: 'meeting' as const, label: '🚩 Regroupement', latitude: convoy.ride.regroup.latitude, longitude: convoy.ride.regroup.longitude }]
      : []),
  ];
  // Pendant le démarrage : pas les repères regroupables (balades, spots, parkings, événements), envoyés après
  const pins = startupDone ? allPins : allPins.filter((p) => !p.cluster);
  // Tracés recalculés seulement s'ils changent (pas à chaque position GPS ni à chaque mouvement de la boussole)
  const rideLine = selectedRide && rideRoute?.id === selectedRide.id ? rideRoute.points : null;
  // Routes plaisir notées (calque, hors navigation) : la route touchée est dessinée en plein
  const showRoadLines = !navigating && nav.phase === 'idle' && layers.showRoads;
  const selectedPlaceId = selectedId?.startsWith(PLACE_PREFIX) ? selectedId.slice(PLACE_PREFIX.length) : null;
  const roadLines = useMemo(
    () => (showRoadLines ? roadMapRoutes(communityPlaces, selectedPlaceId) : []),
    [showRoadLines, communityPlaces, selectedPlaceId],
  );
  const routes: MapRoute[] = useMemo(() => {
    const toLine = (points: LatLng[]) => points.map((p) => [p.latitude, p.longitude] as [number, number]);
    // Aperçu : les autres itinéraires proposés en gris, sous celui choisi
    const alternatives: MapRoute[] =
      nav.phase === 'preview'
        ? nav.choices
            .filter((c) => c.route && !c.sameAs && c.route !== nav.route)
            .map((c) => ({ id: `alt:${c.variant}`, points: toLine(c.route!.points), color: Colors.textFaint, muted: true }))
        : [];
    // Zones de danger : portions du tracé surlignées, sous l'itinéraire
    const zones: MapRoute[] = nav.route
      ? zoneSegs
          .map((s, i) => ({ id: `zone:${i}`, points: toLine(segmentPoints(nav.route!, s)), color: DANGER_ZONE_ROUTE, zone: true }))
          .filter((r) => r.points.length >= 2)
      : [];
    return nav.route
      ? [...alternatives, ...zones, { id: 'nav', points: toLine(nav.route.points), color: Colors.route }]
      : rideLine
        ? [...roadLines, { id: 'ride', points: rideLine, color: Colors.accent }]
        : [...roadLines, ...alternatives];
  }, [nav.phase, nav.choices, nav.route, rideLine, zoneSegs, roadLines, Colors]);
  // Aperçu : la carte cadre tout l'itinéraire (2 coins suffisent)
  const fitPoints = nav.phase === 'preview' && nav.route ? boundsOf(nav.route.points) : undefined;

  const selectedReal = liveRiders.find((r) => REAL_PREFIX + r.userId === selectedId) ?? null;
  const selectedReport = reports.find((r) => REPORT_PREFIX + r.id === selectedId) ?? null;

  // Autorisation : déjà donnée → GPS ; jamais demandée → phrase claire puis fenêtre d'Android ;
  // refusée → la carte reste utilisable (dernière position, ville du profil), bandeau pour l'activer
  const [canAskAgain, setCanAskAgain] = useState(true);
  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then((perm) => {
        if (cancelled) return;
        setCanAskAgain(perm.canAskAgain);
        setStatus(perm.status === 'granted' ? 'ready' : perm.status === 'undetermined' && perm.canAskAgain ? 'ask' : 'denied');
      })
      .catch(() => !cancelled && setStatus('ask'));
    return () => {
      cancelled = true;
    };
  }, []);
  const askLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    setCanAskAgain(perm.canAskAgain);
    setStatus(perm.status === 'granted' ? 'ready' : 'denied');
  };
  const defaultView = useDefaultMapView(profile?.city);

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
          // Simulation de trajet (admin) : les vraies positions sont ignorées pendant la navigation
          if (navigating && getSimulation().active) return;
          startupMark('première position GPS');
          // Cap lissé en mouvement, figé à l'arrêt (jamais oublié en navigation), petits sauts de
          // position ignorés à l'arrêt : affiché sur ma carte ET publié aux amis
          const f = stepHeadingFilter(headingFilter.current, { ...loc.coords, time: loc.timestamp }, navigating);
          headingFilter.current = f.state;
          const filtered = { ...loc, coords: { ...loc.coords, ...f.position, heading: f.heading } };
          setLocation(filtered);
          saveLastPosition(filtered.coords);
          setHeading(f.heading);
        },
      );
      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [status, navigating]);

  // Navigation : menu « ⋯ » (tout ce qui n'est pas boussole, son, danger, recentrer ni SOS)
  const navMoreMenu = () =>
    showActionSheet({
      title: 'Options de navigation',
      options: [
        { label: ghost ? 'Quitter le mode fantôme' : 'Mode fantôme (me masquer)', icon: 'eye-off-outline', onPress: onGhostPress },
        {
          label: layers.showReports ? 'Masquer les signalements' : 'Afficher les signalements',
          icon: 'warning-outline',
          onPress: () => layers.setShowReports(!layers.showReports),
        },
        { label: passenger ? 'Je ne suis plus passager' : 'Je suis passager', icon: 'person-outline', onPress: () => setPassenger(!passenger) },
        {
          label: nav.shares.length ? 'Partage du trajet' : 'Partager mon trajet en direct',
          icon: 'share-social-outline',
          onPress: () => setShareSheet(true),
        },
        {
          label: 'Voir tout le trajet',
          icon: 'expand-outline',
          onPress: () => {
            setFollow(false);
            setOverview(true);
            setOverviewKey((k) => (glShown ? { ...k, gl: k.gl + 1 } : { ...k, leaflet: k.leaflet + 1 }));
          },
        },
        { label: 'Ajouter un arrêt', icon: 'add-circle-outline', onPress: () => setStopPicker({ kind: null }) },
        { label: 'Station essence sur mon trajet', icon: 'speedometer-outline', onPress: () => setStopPicker({ kind: 'fuel' }) },
        {
          label: enginePref === '3d' ? 'Vue 2D (carte à plat)' : 'Vue 3D (inclinée)',
          icon: enginePref === '3d' ? 'map-outline' : 'cube-outline',
          onPress: () => {
            resetGl();
            setNavEnginePref(enginePref === '3d' ? '2d' : '3d');
          },
        },
      ],
    });

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
    if (id === REGROUP_PIN && convoy?.ride.regroup) return goToConvoyPoint(convoy.ride.regroup);
    if (id.startsWith(REPORT_PREFIX) || id.startsWith(PLACE_PREFIX) || id.startsWith(EVENT_PREFIX) || id.startsWith(PARKING_PREFIX) || id.startsWith(FUEL_PREFIX)) {
      setDropped(null);
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
    const details = userId ? await fetchRide(ride.id, userId) : null;
    if (!details) return;
    // Tracé sur les routes seulement : sans tracé enregistré, pas de lignes droites entre les étapes
    if (details.route?.length) setRideRoute({ id: ride.id, points: details.route });
  };

  const openRide = (ride: RideSummary) => {
    router.push({ pathname: '/ride/[id]', params: { id: ride.id } });
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

  // Bouton « + » : en navigation, signaler un danger directement ; sinon, choisir quoi ajouter ici
  const onPlus = () => {
    if (navigating || !position) return setQuickSheet(true);
    const here = { label: 'Ma position', lat: String(position.latitude), lng: String(position.longitude) };
    showActionSheet({
      title: 'Ajouter ici',
      options: [
        { label: 'Signaler un danger', icon: 'warning-outline', onPress: () => setQuickSheet(true) },
        { label: 'Ajouter un spot motard', icon: 'location-outline', onPress: () => router.push({ pathname: '/place/new', params: here }) },
        { label: 'Créer un événement', icon: 'calendar-outline', onPress: () => router.push({ pathname: '/event/new', params: here }) },
        ...(canUse('loop') ? [{ label: 'Fais-moi une boucle', icon: 'sync-outline' as const, onPress: () => router.push('/loop') }] : []),
      ],
    });
  };

  const goToConvoyPoint = (place: Place) => {
    const go = () => chooseDestination({ ...place, source: 'lieu' });
    if (!navigating) return go();
    Alert.alert('Changer de destination ?', `Remplacer la navigation en cours par ${place.label} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Y aller', onPress: go },
    ]);
  };

  const regroupAtDropped = () => {
    if (!dropped || !convoy) return;
    const { place } = dropped;
    const rideId = convoy.ride.id;
    Alert.alert('Point de regroupement', `Tout le groupe reçoit une notification avec l’itinéraire vers « ${place.label} ».`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Envoyer',
        onPress: () => {
          setDropped(null);
          setRegroupPoint(rideId, place)
            .then(() => {
              convoy.refresh();
              showToast('Point de regroupement envoyé au groupe');
            })
            .catch((e) => Alert.alert('Regroupement', e instanceof Error ? e.message : String(e)));
        },
      },
    ]);
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

  const communityFromDropped = (target: '/place/new' | '/event/new') => {
    if (!dropped) return;
    const { place } = dropped;
    setDropped(null);
    router.push({ pathname: target, params: { label: place.label, lat: String(place.latitude), lng: String(place.longitude) } });
  };

  const reportAtDropped = () => {
    if (!dropped) return;
    setReportAt(dropped.place);
    setDropped(null);
    setQuickSheet(true);
  };

  const closeReportSheet = () => {
    setReportSheet(false);
    setQuickSheet(false);
    setReportAt(null);
  };

  // Type choisi dans une grille : envoi au bout de 5 s, annulable
  const queueReport = (type: ReportType) => {
    const at = reportAt ?? position;
    closeReportSheet();
    if (!at) return;
    setUndo({ type, at: { latitude: at.latitude, longitude: at.longitude }, deadline: Date.now() + UNDO_MS });
    setUndoNow(Date.now());
  };
  const undoSecondsLeft = undo ? Math.max(1, Math.ceil((undo.deadline - undoNow) / 1000)) : 0;

  // En roulant : un seul tap, position marquée tout de suite (signalement générique « Zone de danger »
  // visible des autres), le type se choisit à l'arrêt
  const markDangerWhileRiding = async () => {
    if (!position || !userId) return;
    const at = { latitude: position.latitude, longitude: position.longitude };
    speak('Danger noté. Tu choisiras le type à l’arrêt', true, 'info');
    showToast('⚠️ Danger noté, tu choisiras le type à l’arrêt');
    let id: string | null = null;
    try {
      id = await createReport(userId, 'danger', at, true);
      refreshReports();
    } catch (e) {
      console.warn('Danger noté hors ligne, envoyé plus tard', e);
    }
    addPending({ ...at, key: `${Date.now()}`, id, at: Date.now() });
  };

  // ---------- Dangers notés en roulant : type choisi à l'arrêt ----------
  const stopped = kmh < 3;
  const [wasStopped, setWasStopped] = useState(stopped);
  const [stillLong, setStillLong] = useState(false);
  if (wasStopped !== stopped) {
    setWasStopped(stopped);
    if (!stopped) {
      setStillLong(false);
      setPendingDismissed(false);
    }
  }
  useEffect(() => {
    if (!stopped) return;
    const timer = setTimeout(() => setStillLong(true), 5000);
    return () => clearTimeout(timer);
  }, [stopped]);
  // Sans réponse au bout de 30 min : le danger reste « Zone de danger » (envoyé maintenant s'il n'a pas pu l'être)
  useEffect(() => {
    if (!userId) return;
    const sweep = () => {
      for (const p of readPending()) {
        if (Date.now() - p.at < PENDING_MAX_MS) continue;
        removePending(p.key);
        if (!p.id) createReport(userId, 'danger', p).catch((e) => console.warn('Danger non envoyé', e));
      }
    };
    sweep();
    const timer = setInterval(sweep, 60_000);
    return () => clearInterval(timer);
  }, [userId]);
  // Les plus vieux de 30 min sont retirés par le balayage ci-dessus (chaque minute)
  const pendingDanger = pendingDangers[0] ?? null;
  const showPending = !!pendingDanger && stillLong && !pendingDismissed && !quickSheet && !reportSheet && !undo;

  const resolvePending = async (action: ReportType | 'keep' | 'delete') => {
    const p = pendingDanger;
    if (!p || !userId) return;
    removePending(p.key);
    try {
      if (action === 'delete') {
        if (p.id) await deleteReport(p.id);
        showToast('Signalement supprimé');
      } else if (action === 'keep') {
        if (!p.id) await createReport(userId, 'danger', p);
      } else {
        if (p.id) await setReportType(p.id, action);
        else await createReport(userId, action, p);
        showToast(`Merci ! ${reportInfo(action).label} signalé`);
        speak('Merci, signalement envoyé');
      }
      await refreshReports();
    } catch (e) {
      Alert.alert('Signalement', e instanceof Error ? e.message : String(e));
    }
  };

  const report = async (type: ReportType, at: LatLng | null = reportAt ?? position) => {
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
    await voteReport(userId, id, value);
    await refreshReports();
    setVotedIds((v) => [...v, id]);
    if (!silent) showToast(value === 'gone' ? 'Merci, signalement retiré si confirmé par d’autres' : 'Merci pour la confirmation');
  };

  // Fin du délai d'annulation : envoi
  useEffect(() => {
    if (!undo) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setUndoNow(now);
      if (now >= undo.deadline) {
        clearInterval(timer);
        setUndo(null);
        report(undo.type, undo.at);
      }
    }, 250);
    return () => clearInterval(timer);
    // report change à chaque rendu ; le minuteur ne dépend que du signalement en attente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo]);

  const fuelFilled = () => {
    if (!myGarage) return;
    markFilled(myGarage, nav.tripM / 1000)
      .then(() => {
        fuelAlert.dismiss();
        showToast('Plein noté : autonomie remise à zéro');
      })
      .catch((e) => Alert.alert('Plein', e instanceof Error ? e.message : String(e)));
  };

  const stopNavigation = () => {
    resetGl();
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
            { label: 'Définir comme Maison', icon: 'home-outline', onPress: () => setFavorite(dest, 'home') },
            { label: 'Définir comme Travail', icon: 'briefcase-outline', onPress: () => setFavorite(dest, 'work') },
            { label: 'Ajouter aux favoris', icon: 'star-outline', onPress: () => setFavorite(dest, 'custom') },
          ],
    });
  };

  const chooseDestination = (
    r: Parameters<typeof nav.choose>[0],
    via?: Parameters<typeof nav.choose>[1],
    extra?: Parameters<typeof nav.choose>[2],
  ) => {
    setFollow(false);
    setSelectedId(null);
    setDropped(null);
    nav.choose(r, via, extra);
  };

  // Lien depuis le site web (« Aller ici » → passeryder://?goLat=…&goLng=…&goLabel=…) :
  // aperçu de l'itinéraire dès que ma position est connue
  const goParams = useLocalSearchParams<{ goLat?: string; goLng?: string; goLabel?: string; gpx?: string; ride?: string }>();
  const goKey = goParams.goLat && goParams.goLng ? `${goParams.goLat},${goParams.goLng}` : null;
  const handledGo = useRef<string | null>(null);
  const hasFix = !!location;
  useEffect(() => {
    if (!goKey || !hasFix || handledGo.current === goKey) return;
    const latitude = Number(goParams.goLat);
    const longitude = Number(goParams.goLng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const label = goParams.goLabel || 'Destination';
    const timer = setTimeout(() => {
      handledGo.current = goKey;
      chooseDestination({ label, latitude, longitude, source: 'lieu' });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goKey, hasFix]);

  // GPX importé (onglet Balades › GPX › Naviguer) : arrivée = fin du tracé, points de passage le long
  const handledGpx = useRef<string | null>(null);
  useEffect(() => {
    if (!goParams.gpx || !hasFix || handledGpx.current === goParams.gpx) return;
    handledGpx.current = goParams.gpx;
    const data = takePendingGpx();
    if (!data) return;
    const end = data.points[data.points.length - 1];
    const via = viaPointsAlong(data.points, GPX_VIA_POINTS).map((p, i) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      label: `Tracé GPX · point ${i + 1}`,
      source: 'lieu' as const,
    }));
    const dest = {
      latitude: end.latitude,
      longitude: end.longitude,
      label: data.name ? `Fin de « ${data.name} »` : 'Fin du tracé GPX',
      source: 'lieu' as const,
    };
    const timer = setTimeout(() => chooseDestination(dest, via), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goParams.gpx, hasFix]);

  // Fiche balade › « Naviguer sur le tracé » : départ, étapes dans l'ordre, arrivée, options de l'organisateur
  const handledRide = useRef<string | null>(null);
  useEffect(() => {
    const rideId = goParams.ride;
    if (!rideId || !hasFix || !userId || handledRide.current === rideId) return;
    handledRide.current = rideId;
    fetchRide(rideId, userId)
      .then((ride) => {
        if (!ride) {
          Alert.alert('Balade introuvable', 'Elle a peut-être été supprimée.');
          return;
        }
        const nearStart = !!position && distanceM(position, ride.start) < RIDE_START_SKIP_M;
        const via = [
          ...(nearStart ? [] : [{ ...ride.start, label: `Départ : ${ride.start.label}`, source: 'lieu' as const }]),
          ...ride.waypoints.map((w, i) => ({ ...w, label: `Étape ${i + 1} : ${w.label}`, source: 'lieu' as const })),
        ];
        const dest = { ...ride.end, label: `Arrivée : ${ride.end.label}`, source: 'lieu' as const };
        chooseDestination(dest, via, ride.routeOptions);
      })
      .catch((e) => Alert.alert('Tracé indisponible', errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goParams.ride, hasFix, userId]);

  const removeMine = async (id: string) => {
    const target = reports.find((r) => r.id === id);
    if (!target) return;
    try {
      await deleteReport(id);
      await refreshReports();
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


  // Navigation : manœuvre d'après si elle suit de près (« puis ↱ »), alertes de la pastille
  const nextManeuver = nav.progress?.next ?? null;
  const afterNext = nextManeuver && nav.route ? (nav.route.steps[nextManeuver.index + 1] ?? null) : null;
  const thenStep = afterNext && nextManeuver && afterNext.alongM - nextManeuver.step.alongM < 300 ? afterNext : null;
  const navAlerts: HudAlert[] = [];
  if (navigating) {
    if (danger)
      navAlerts.push({
        id: `report:${danger.report.id}`,
        icon: <ReportIcon type={danger.report.type} size={18} />,
        text: `${reportInfo(danger.report.type).label} dans ${shortDistance(danger.distanceM)}`,
        tone: 'danger',
      });
    if (zoneNow?.official) navAlerts.push({ id: 'zone', icon: <ZoneIcon size={18} />, text: 'Zone de danger, prudence', tone: 'danger' });
    if (curveAlert) navAlerts.push({ id: `curve:${curveAlert.side}`, icon: curveAlert.side === 'left' ? '↰' : '↱', text: curveAlert.text });
    if (navWeather) navAlerts.push({ id: `weather:${navWeather.hazard}`, icon: navWeather.emoji, text: navWeather.text });
    if (sunAlert) navAlerts.push({ id: 'sun', icon: '🌇', text: sunAlert.text, tone: 'night' });
    if (sparseReminder) navAlerts.push({ id: 'fuel', icon: '⛽', text: sparseReminder });
  }

  // Fiches du repère touché (balade, spot, station, ami…) : sur la carte et en navigation
  const selectedCards = (
    <>
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
  {selectedPlace && (
    <View style={styles.card}>
      <PlaceCard
        place={selectedPlace}
        distanceM={position ? distanceM(position, selectedPlace) : null}
        onPress={() => openPlace(selectedPlace)}
        onClose={() => setSelectedId(null)}
      />
    </View>
  )}
  {selectedStation && (
    <View style={styles.card}>
      <FuelStationCard
        station={selectedStation}
        myFuel={myGarage?.fuelType ?? null}
        distanceM={position ? distanceM(position, selectedStation) : null}
        onGo={() => {
          const place = { label: `⛽ ${stationTitle(selectedStation)}`, latitude: selectedStation.latitude, longitude: selectedStation.longitude, source: 'lieu' as const };
          setSelectedId(null);
          // Aperçu en cours : la station devient une étape ; sinon c'est la destination
          if (nav.phase === 'preview') nav.addStop(place);
          else chooseDestination(place);
        }}
        onClose={() => setSelectedId(null)}
      />
    </View>
  )}
  {selectedParking && (
    <View style={styles.card}>
      <ParkingCard
        parking={selectedParking}
        distanceM={position ? distanceM(position, selectedParking) : null}
        onGo={() =>
          chooseDestination({
            label: `🅿️ ${parkingTitle(selectedParking)}`,
            latitude: selectedParking.latitude,
            longitude: selectedParking.longitude,
            source: 'lieu',
          })
        }
        onClose={() => setSelectedId(null)}
      />
    </View>
  )}
  {selectedEvent && (
    <View style={styles.card}>
      <EventCard
        event={selectedEvent}
        distanceM={position ? distanceM(position, selectedEvent.place) : null}
        onPress={() => openEvent(selectedEvent)}
        onClose={() => setSelectedId(null)}
      />
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
    </>
  );
  // Navigation : cartes d'alerte moto (plein, pause, autonomie) puis le volet
  const navCards = (
    <>
  {navigating && fuelCheck && (
    <View style={styles.card}>
      <FuelCheckBanner leftKm={fuelLeftKm} onPick={pickFuelLevel} onClose={() => setFuelCheck(false)} />
    </View>
  )}
  {navigating && breakReminder.reminder && (
    <View style={styles.card}>
      <BreakBanner
        reminder={breakReminder.reminder}
        stopped={kmh <= DRIVING_LOCK_SPEED_KMH}
        onAdd={() => {
          const spot = breakReminder.reminder?.suggestion;
          if (spot) nav.addStop(spot);
          breakReminder.dismiss();
        }}
        onClose={breakReminder.dismiss}
      />
    </View>
  )}
  {navigating && fuelAlert.suggestion && (
    <View style={styles.card}>
      <FuelSuggestionCard
        suggestion={fuelAlert.suggestion}
        onAdd={() => {
          const station = fuelAlert.suggestion?.station;
          if (station) nav.addStop(station);
          fuelAlert.dismiss();
        }}
        onSearch={() => {
          fuelAlert.dismiss();
          setStopPicker({ kind: 'fuel' });
        }}
        onClose={fuelAlert.dismiss}
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
        fuelLeftKm={fuelLeftKm}
        onFilled={fuelRange(myGarage) ? fuelFilled : undefined}
        nextStation={nextStationText}
      />
    </View>
  )}
    </>
  );


  return (
    <View style={styles.container} onTouchStart={onDrivingTouch}>
      <TipBubble id="carte" enabled={!navigating && status === 'ready'} />
      {(status === 'ask' || status === 'denied') && (
        <View style={styles.locationCard}>
          <Text style={styles.locationTitle}>{status === 'ask' ? 'Centrer la carte sur toi ?' : 'Localisation désactivée'}</Text>
          <Text style={styles.locationText}>
            {status === 'ask'
              ? 'PasseRyder utilise ta position pour te montrer sur la carte, te guider et signaler les dangers. Elle n’est partagée qu’avec qui tu choisis (mode fantôme possible).'
              : 'Sans ta position, la carte s’ouvre sur ta dernière position connue ou ta ville. Active-la pour te voir et être guidé.'}
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => (status === 'ask' || canAskAgain ? askLocation() : Linking.openSettings())}>
            <Text style={styles.buttonText}>{status === 'ask' || canAskAgain ? 'Autoriser la localisation' : 'Ouvrir les réglages'}</Text>
          </Pressable>
        </View>
      )}
      <LeafletMap
        defaultView={defaultView}
        position={mapPosition}
        // Carte 3D affichée par-dessus : Leaflet ne suit plus (rien à calculer en dessous), garde le bip
        navigating={navigating && !glShown}
        navZoom={navZoom}
        follow={follow && nav.phase !== 'preview' && !glShown}
        onUserPan={onMapPan}
        overviewKey={overviewKey.leaflet}
        compass={glShown ? null : compassMode}
        onBearingChange={glShown ? undefined : setMapBearing}
        northUpKey={northUpKey}
        orientation={navOrientation}
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
        beepKey={beepKey}
        chimeKey={limitAlerts.chimeKey}
        // Son bloqué par la page : alerte vocale à la place du bip
        onBeepFailed={() => speak('Vitesse', true, 'info')}
        pins={pins}
        onPinPress={onPinPress}
        routes={routes}
        fitPoints={fitPoints}
        onViewChange={(center, zoom) => setMapView({ center, zoom })}
        onPainted={signalMapReady}
      />
      {glWanted && (
        // Invisible tant que la 3D n'a pas peint ses premières tuiles (Leaflet guide en attendant)
        <View style={[StyleSheet.absoluteFill, !gl.shown && styles.glLoading]} pointerEvents={gl.shown ? 'auto' : 'none'}>
          <NavMapGL
            position={mapPosition}
            navigating
            navZoom={navZoom}
            follow={follow}
            onUserPan={onMapPan}
            overviewKey={overviewKey.gl}
            compass={compassMode}
            onBearingChange={glShown ? setMapBearing : undefined}
            northUpKey={northUpKey}
            orientation={navOrientation}
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
            pins={pins}
            onPinPress={onPinPress}
            routes={routes}
            onReady={(info) => recordNavEngine('3d', info ? `WebGL ${info.version}${info.renderer ? ` · ${info.renderer}` : ''}` : 'WebGL OK')}
            onPainted={() => setGl((g) => ({ ...g, shown: true }))}
            onFallback={(reason) => {
              recordNavEngine('2d', `repli automatique : ${reason}`);
              setGl({ failed: reason, shown: false });
              showToast(`Vue 3D indisponible (${reason}) : carte 2D`);
            }}
          />
        </View>
      )}
      {/* Navigation : habillage rangé en zones (components/nav/nav-hud.tsx) */}
      {navigating && (
        <NavHud
          banner={<NavBanner progress={nav.progress} then={thenStep} rerouting={nav.loading} />}
          alerts={navAlerts}
          topExtra={
            <>
              <PerfBadge />
              {convoy && (
                <ConvoyPanel
                  convoy={convoy}
                  compact
                  position={position}
                  onGoTo={goToConvoyPoint}
                  onOpenRide={() => router.push({ pathname: '/ride/[id]', params: { id: convoy.ride.id } })}
                />
              )}
              {toast && (
                <View style={styles.toast}>
                  <Text style={styles.toastText}>{toast}</Text>
                </View>
              )}
            </>
          }
          speed={<Speedometer compact kmh={kmh} limit={voice.speedLimit ? speedLimit : null} over={overLimit} pulseKey={limitAlerts.pulseKey} />}
          status={
            ghost || homecoming || simulating ? (
              <>
                {ghost && (
                  <HudStatusIcon
                    icon="ghost"
                    family="mci"
                    color={Colors.ghost}
                    label="Mode fantôme : tu es masqué"
                    onPress={() => showToast('Mode fantôme : tu es masqué (menu ⋯ pour le quitter)')}
                  />
                )}
                {homecoming && <HudStatusIcon icon="home" color={Colors.accent} label="Je rentre" onPress={() => router.push('/homecoming')} />}
                {simulating && (
                  <HudStatusIcon
                    icon="flask"
                    color={Colors.accentDark}
                    label="Simulation de trajet"
                    onPress={() => showToast('Simulation de trajet : position non publiée')}
                  />
                )}
              </>
            ) : null
          }
          compass={<MapCompass navigating orientation={navOrientation} onPress={toggleNavOrientation} size={NAV_RAIL_BUTTON} />}
          muted={voice.muted}
          onMute={() => updateVoiceSettings({ muted: !voice.muted })}
          onMore={navMoreMenu}
          sos={
            <SosButton
              size={52}
              onTrigger={() => setSosKind('manual')}
              onHint={() => showToast('SOS : garde le bouton appuyé 2 secondes pour alerter tes contacts d’urgence')}
            />
          }
          danger={
            <View style={styles.dangerColumn} pointerEvents="box-none">
              {/* Interrupteur dans ⋯, rappelé ici seulement quand il est activé */}
              {passenger && <PassengerToggle on={passenger} onChange={setPassenger} />}
              <DangerButton
                riding={riding && !passenger}
                onPress={() => (riding && !passenger ? markDangerWhileRiding() : setQuickSheet(true))}
              />
            </View>
          }
          onRecenter={follow ? null : recenter}
          bottom={
            <>
              {undo && <UndoReportBar type={undo.type} seconds={undoSecondsLeft} onUndo={() => setUndo(null)} />}
              {selectedCards}
              {navCards}
            </>
          }
          attribution={`${glShown ? 'MapLibre' : 'Leaflet'} · © MapTiler © OpenStreetMap`}
        />
      )}
      {/* Couche des commandes : couvre tout l'écran au-dessus de la carte, recherche en haut, + en bas */}
      {!navigating && (
      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          <SearchBar
            near={position}
            onSelect={chooseDestination}
            below={nav.phase === 'idle' ? <QuickPlaces near={position} onSelect={chooseDestination} /> : null}
            categories={nav.phase === 'idle'}
          />

          <View style={styles.top} pointerEvents="box-none">
            <View style={styles.left} pointerEvents="box-none">
              <Speedometer kmh={kmh} limit={voice.speedLimit ? speedLimit : null} over={overLimit} pulseKey={limitAlerts.pulseKey} />
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
              <MapCompass navigating={false} orientation={navOrientation} onPress={() => setNorthUpKey((k) => k + 1)} />
            </View>
            <View style={styles.right} pointerEvents="box-none">
              {/* Afficher / masquer les calques (choix mémorisé) */}
              <LayerButton
                active={layers.showReports}
                icon="warning"
                label={layers.showReports ? 'Masquer les signalements' : 'Afficher les signalements'}
                onPress={() => layers.setShowReports(!layers.showReports)}
              />
              {!homecoming && (
                <Pressable
                  style={styles.layerButton}
                  onPress={() => router.push('/homecoming')}
                  hitSlop={6}
                  accessibilityLabel="Je rentre : prévenir mes contacts si je n'arrive pas">
                  <Ionicons name="home-outline" size={24} color={Colors.accent} />
                </Pressable>
              )}
              <LayerButton
                active={layers.showRides}
                icon="flag"
                label={layers.showRides ? 'Masquer les balades et événements' : 'Afficher les balades et événements'}
                onPress={() => layers.setShowRides(!layers.showRides)}
              />
              <LayerButton
                active={layers.showPlaces}
                icon="cafe"
                label="Filtres de la carte : spots"
                onPress={() => setPlaceFilter(true)}
              />
              {/* Météo actuelle de l'endroit (toucher = 12 h), après le démarrage */}
              {startupDone && nav.phase === 'idle' && <MapWeather at={position ?? mapView?.center ?? null} />}
            </View>
          </View>

          {ghost && (
            <View style={styles.ghostBanner}>
              <MaterialCommunityIcons name="ghost" size={18} color={Colors.white} />
              <Text style={styles.ghostBannerText}>Mode fantôme · tu es masqué</Text>
            </View>
          )}
          {noFriends && !navigating && nav.phase === 'idle' && !ghost && (
            <>
              <Pressable style={styles.inviteChip} onPress={() => router.push('/friends')}>
                <Ionicons name="people" size={18} color={Colors.accent} />
                <Text style={styles.inviteChipText}>Personne sur ta carte · Ajoute tes potes</Text>
              </Pressable>
              <Pressable style={styles.inviteChip} onPress={() => router.push('/invite')}>
                <Ionicons name="paper-plane" size={18} color={Colors.accent} />
                <Text style={styles.inviteChipText}>Inviter des potes sur PasseRyder</Text>
              </Pressable>
            </>
          )}
          {convoy && (
            <ConvoyPanel
              convoy={convoy}
              compact={navigating}
              position={position}
              onGoTo={goToConvoyPoint}
              onOpenRide={() => router.push({ pathname: '/ride/[id]', params: { id: convoy.ride.id } })}
            />
          )}
          {homecoming && (
            <Pressable style={styles.homecomingChip} onPress={() => router.push('/homecoming')}>
              <Ionicons name="home" size={18} color={Colors.white} />
              <Text style={styles.ghostBannerText}>
                Je rentre · vers{' '}
                {new Date(homecoming.deadline).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
          )}
          {!navigating && danger && (
            <View style={[styles.dangerChip, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <ReportIcon type={danger.report.type} size={22} />
              <Text style={styles.dangerText}>
                {reportInfo(danger.report.type).label} droit devant
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
              <Pressable style={[styles.button, styles.recenter]} onPress={() => setFollow(true)}>
                <Ionicons name="navigate" size={20} color={Colors.white} />
                <Text style={styles.buttonText}>Recentrer</Text>
              </Pressable>
            ) : (
              <View />
            )}
            {riding ? (
              <View style={styles.dangerColumn} pointerEvents="box-none">
                <PassengerToggle on={passenger} onChange={setPassenger} />
                <DangerButton
                  riding={riding && !passenger}
                  onPress={() => (riding && !passenger ? markDangerWhileRiding() : setQuickSheet(true))}
                />
              </View>
            ) : (
              <ReportButton onPress={onPlus} />
            )}
          </View>
          {undo && <UndoReportBar type={undo.type} seconds={undoSecondsLeft} onUndo={() => setUndo(null)} />}

          {dropped && (
            <View style={styles.card}>
              <DroppedPinCard
                place={dropped.place}
                resolving={dropped.resolving}
                distanceM={position ? distanceM(position, dropped.place) : null}
                onGo={goToDropped}
                onRide={rideFromDropped}
                onReport={reportAtDropped}
                onAddPlace={() => communityFromDropped('/place/new')}
                onAddEvent={() => communityFromDropped('/event/new')}
                onRegroup={convoy?.canRegroup ? regroupAtDropped : undefined}
                onAddStop={
                  nav.phase === 'preview'
                    ? () => {
                        nav.addStop({ ...dropped.place, source: 'lieu' });
                        setDropped(null);
                      }
                    : undefined
                }
                onClose={() => setDropped(null)}
              />
            </View>
          )}
          {selectedCards}
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
                onRetry={nav.retryChoices}
                onAddStop={() => setStopPicker({ kind: null })}
                onRemoveStop={nav.removeStop}
                onMoveStop={nav.moveStop}
                onFavorite={favoriteMenu}
                weather={previewWeather}
                fuel={previewFuel}
                onAddFuel={() => setStopPicker({ kind: 'fuel' })}
                stations={{ text: routeFuelSummary(routeStations, myFuel), cheapest: cheapOnRoute, fuel: myFuel }}
                onAddStation={(s) => nav.addStop({ label: `⛽ ${stationTitle(s)}`, latitude: s.latitude, longitude: s.longitude, source: 'lieu' })}
                onStart={() => {
                  setSelectedId(null);
                  setDropped(null);
                  setFollow(true);
                  resetGl();
                  nav.start();
                  // Alerte météo au départ (pluie, vent, froid sur le trajet)
                  const alert = spokenWeatherAlert(previewWeather.weather);
                  if (alert) speak(alert, false, 'info');
                }}
                onCancel={() => {
                  nav.stop();
                  setFollow(true);
                }}
              />
            </View>
          )}
        </View>
      </View>
      )}

      {stopPicker && (
        <StopPicker
          initialKind={stopPicker.kind}
          route={nav.route}
          fromM={nav.progress?.alongM ?? 0}
          near={position}
          fuel={myFuel}
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
      <PlaceFilterSheet visible={placeFilter} onClose={() => setPlaceFilter(false)} />
      <TripSummaryModal
        trip={nav.summary}
        onClose={nav.clearSummary}
        onOpenHistory={() => {
          nav.clearSummary();
          router.push('/trips');
        }}
      />
      <ReportSheet visible={reportSheet} onPick={queueReport} onClose={closeReportSheet} />
      <QuickReportSheet
        visible={quickSheet}
        onPick={queueReport}
        onMore={() => {
          setQuickSheet(false);
          setReportSheet(true);
        }}
        onClose={closeReportSheet}
      />
      <QuickReportSheet
        visible={showPending}
        pending={pendingDanger ? reportAge(new Date(pendingDanger.at).toISOString()) : null}
        onPick={(t) => resolvePending(t)}
        onKeepGeneric={() => resolvePending('keep')}
        onDelete={() => resolvePending('delete')}
        onClose={() => setPendingDismissed(true)}
      />
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
  icon: 'warning' | 'flag' | 'cafe';
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

/** Texte du repère d'événement : « 🏍️ sam. 12 » */
function eventLabel(kind: Parameters<typeof eventKindInfo>[0], iso: string) {
  const d = new Date(iso);
  return `${eventKindInfo(kind).emoji} ${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}`;
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

const useStyles = makeStyles((Colors) => ({
  container: { flex: 1 },
  // Carte 3D en cours de chargement : presque transparente (Leaflet visible dessous), mais rendue
  glLoading: { opacity: 0.01 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  message: { fontSize: Type.body, textAlign: 'center', color: Colors.text },
  locationCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 20,
    gap: 12,
    padding: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  locationTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  locationText: { fontSize: Type.body, color: Colors.textMuted, lineHeight: 20 },
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
    elevation: 4,
  },
  header: { alignSelf: 'stretch', gap: 12 },
  top: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { gap: 12, alignItems: 'flex-start' },
  right: { gap: 12, alignItems: 'flex-end' },
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
    shadowOpacity: 0.15,
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
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  ghostButtonOn: { backgroundColor: Colors.ghost },
  recenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostBanner: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.ghost,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
  },
  ghostBannerText: { color: Colors.white, fontWeight: '700', fontSize: Type.body },
  inviteChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  inviteChipText: { color: Colors.text, fontWeight: '700', fontSize: Type.body },
  homecomingChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
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
  dangerText: { color: Colors.white, fontWeight: '800', fontSize: Type.body },
  toast: {
    alignSelf: 'center',
    backgroundColor: Colors.overlayStrong,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toastText: { color: Colors.white, fontWeight: '700', fontSize: Type.body, textAlign: 'center' },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 12 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  dangerColumn: { alignItems: 'flex-end', gap: 8 },
  card: { alignSelf: 'stretch' },
  // Posé sur le coin de la fiche, au-dessus (le badge de niveau occupe le coin haut droit)
  rideClose: {
    position: 'absolute',
    top: -14,
    right: -4,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  button: { backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: Colors.white, fontSize: Type.body, fontWeight: '600' },
}));
