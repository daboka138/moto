import { useEffect, useRef, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import { defaultRouteOptions, type MotoCategory, type RouteOptions } from '@/lib/moto';
import {
  defaultVariant,
  fetchNavRoute,
  needsValhalla,
  nextStep,
  projectOnRoute,
  sameRoute,
  stepSentence,
  variantOptions,
  variantsFor,
  type NavRoute,
  type NavStep,
  type RouteVariant,
} from '@/lib/navigation';
import type { SearchResult } from '@/lib/search';
import { endTripShares, shareTripWith, updateTripShares } from '@/lib/trip-share';
import { newTripStats, recordFix, saveTrip, summarize, type TripStats, type TripSummary } from '@/lib/trips';
import { speak } from '@/lib/voice';

export type NavPhase = 'idle' | 'preview' | 'navigating';

/** Trajet partagé en direct avec un ami */
export type ActiveShare = { id: string; friendId: string; username: string };

export type NavProgress = {
  next: { step: NavStep; index: number; distanceM: number } | null;
  alongM: number;
  remainingM: number;
  remainingS: number;
  offRoute: boolean;
};

/** Un des itinéraires proposés avant de partir */
export type RouteChoice = {
  variant: RouteVariant;
  route: NavRoute | null;
  loading: boolean;
  error: string | null;
  /** Même tracé qu'une variante déjà proposée : pas affichée en double */
  sameAs: RouteVariant | null;
};

/** Heure d'arrivée estimée (hors rendu : Date.now) */
export function etaFrom(remainingS: number) {
  return new Date(Date.now() + remainingS * 1000);
}

function computeProgress(route: NavRoute, me: LatLng): NavProgress {
  const proj = projectOnRoute(route, me);
  const remainingM = Math.max(0, route.distanceM - proj.alongM);
  return {
    next: nextStep(route, proj.alongM),
    alongM: proj.alongM,
    remainingM,
    remainingS: route.durationS * (remainingM / Math.max(route.distanceM, 1)),
    offRoute: proj.offRouteM > OFF_ROUTE_M,
  };
}

const OFF_ROUTE_M = 45;
const OFF_ROUTE_FIXES = 3;
const REROUTE_MIN_INTERVAL_MS = 12_000;
const ARRIVAL_M = 30;
/** Étape (station, café…) atteinte à moins de 60 m */
const STOP_REACHED_M = 60;
/** Partage en direct : position envoyée toutes les 30 s */
const SHARE_EVERY_MS = 30_000;
/** Mesures du trajet sauvegardées toutes les 15 s (reprise après redémarrage de l'app) */
const SAVE_STATS_EVERY_MS = 15_000;
/** Au-delà, une navigation interrompue n'est plus reprise */
const RESUME_MAX_AGE_MS = 6 * 3600 * 1000;

/** Paliers d'annonce avant une manœuvre, selon la vitesse. */
function thresholds(speedKmh: number) {
  if (speedKmh > 80) return { far: 1200, mid: 400, near: 60 };
  if (speedKmh > 45) return { far: 700, mid: 250, near: 40 };
  return { far: 400, mid: 150, near: 25 };
}

// ---------- Navigation en cours, gardée sur le téléphone ----------

const ACTIVE_KEY = 'moto.activeNav';

type SavedNav = {
  destination: SearchResult;
  stops: SearchResult[];
  options: RouteOptions;
  variant: RouteVariant;
  shares: ActiveShare[];
  stats: TripStats;
  savedAt: number;
};

function readSavedNav(): SavedNav | null {
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? 'null') as SavedNav | null;
    return saved && Date.now() - saved.savedAt < RESUME_MAX_AGE_MS ? saved : null;
  } catch {
    return null;
  }
}

function writeSavedNav(nav: SavedNav | null) {
  try {
    if (nav) localStorage.setItem(ACTIVE_KEY, JSON.stringify(nav));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // pas grave : pas de reprise possible
  }
}

/** Place une étape dans l'ordre du trajet (selon sa position le long du tracé) */
function insertStop(route: NavRoute | null, stops: SearchResult[], place: SearchResult) {
  if (!route) return [...stops, place];
  const along = (p: LatLng) => projectOnRoute(route, p).alongM;
  return [...stops, place].sort((a, b) => along(a) - along(b));
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Navigation guidée : choix entre plusieurs itinéraires, étapes, puis guidage avec annonces
 * vocales, recalcul si je sors du trajet, mesures du trajet, partage en direct, arrivée.
 * Une navigation interrompue (app fermée ou redémarrée) reprend toute seule.
 */
export function useNavigation(
  me: (LatLng & { accuracy: number | null }) | null,
  speedKmh: number,
  category: MotoCategory | null,
  userId: string | undefined,
) {
  const [phase, setPhase] = useState<NavPhase>('idle');
  const [destination, setDestination] = useState<SearchResult | null>(null);
  const [stops, setStops] = useState<SearchResult[]>([]);
  // Options préremplies selon la moto principale, modifiables à chaque trajet
  const [options, setOptions] = useState<RouteOptions>(() => defaultRouteOptions(category));
  const [variant, setVariant] = useState<RouteVariant>('fast');
  const [choices, setChoices] = useState<RouteChoice[]>([]);
  // Itinéraire suivi pendant la navigation (recalculé si je sors du trajet)
  const [navRoute, setNavRoute] = useState<NavRoute | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const [shares, setShares] = useState<ActiveShare[]>([]);
  // Résumé affiché à la fin d'une navigation
  const [summary, setSummary] = useState<TripSummary | null>(null);
  // Distance déjà parcourue pendant cette navigation (mise à jour toutes les 15 s : autonomie)
  const [tripM, setTripM] = useState(0);

  const selected = choices.find((c) => c.variant === variant) ?? null;
  const route = phase === 'navigating' ? navRoute : (selected?.route ?? null);
  const progress = phase === 'navigating' && navRoute && me ? computeProgress(navRoute, me) : null;

  const meRef = useRef(me);
  const spoken = useRef(new Set<string>());
  const offRouteCount = useRef(0);
  const lastReroute = useRef(0);
  const rerouting = useRef(false);
  const computeToken = useRef(0);
  const stats = useRef<TripStats | null>(null);
  const lastStatsSave = useRef(0);
  const lastShareUpdate = useRef(0);
  // Navigation interrompue à reprendre dès que la position est connue
  const [interrupted] = useState(readSavedNav);
  const resume = useRef<SavedNav | null>(interrupted);
  const reachedStop = useRef<SearchResult | null>(null);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // ---------- Aperçu : calcul des itinéraires proposés ----------

  const computeChoices = async (dest: SearchResult, via: SearchResult[], opts: RouteOptions, first: RouteVariant) => {
    const token = ++computeToken.current;
    const variants = variantsFor(opts);
    const from = meRef.current;
    if (!from) {
      setChoices(variants.map((v) => ({ variant: v, route: null, loading: false, error: 'Position GPS indisponible', sameAs: null })));
      return;
    }
    setChoices(variants.map((v) => ({ variant: v, route: null, loading: true, error: null, sameAs: null })));
    const points = [from, ...via, dest];
    const update = (v: RouteVariant, patch: Partial<RouteChoice>) => {
      if (token !== computeToken.current) return;
      setChoices((cs) => {
        const next = cs.map((c) => (c.variant === v ? { ...c, ...patch } : c));
        // Variante identique à une précédente : masquée
        return next.map((c, i) => ({
          ...c,
          sameAs: c.route ? (next.slice(0, i).find((o) => o.route && sameRoute(o.route, c.route!))?.variant ?? null) : null,
        }));
      });
    };
    const run = async (v: RouteVariant) => {
      const vo = variantOptions(opts, v);
      try {
        const r = await fetchNavRoute(points, vo);
        // Valhalla indisponible : l'itinéraire standard ne respecte pas « sans autoroute » / « petites routes »
        if (v !== 'fast' && r.engine === 'osrm' && needsValhalla(vo)) {
          update(v, { loading: false, error: 'Indisponible pour le moment' });
        } else update(v, { route: r, loading: false, error: null });
      } catch (e) {
        update(v, { loading: false, error: errorText(e) });
      }
    };
    // OSRM en parallèle ; Valhalla l'un après l'autre (débit limité du serveur public), la variante choisie d'abord
    const usesValhalla = (v: RouteVariant) => needsValhalla(variantOptions(opts, v));
    variants.filter((v) => !usesValhalla(v)).forEach(run);
    const queue = variants.filter(usesValhalla).sort((a, b) => Number(b === first) - Number(a === first));
    for (const v of queue) {
      if (token !== computeToken.current) return;
      await run(v);
    }
  };

  /** Aperçu vers une destination, avec des étapes déjà prévues (tracé GPX importé) */
  const choose = (dest: SearchResult, via: SearchResult[] = []) => {
    // Chaque nouveau trajet repart des options de la moto
    const opts = defaultRouteOptions(category);
    const v = defaultVariant(opts);
    setOptions(opts);
    setVariant(v);
    setDestination(dest);
    setStops(via);
    setPhase('preview');
    setSummary(null);
    computeChoices(dest, via, opts, v);
  };

  const updateOptions = (patch: Partial<RouteOptions>) => {
    const next = { ...options, ...patch };
    // 50 cm³ : l'autoroute reste interdite quoi qu'il arrive
    if (next.scooter50) next.avoidHighways = true;
    setOptions(next);
    if (destination && phase === 'preview') computeChoices(destination, stops, next, variant);
  };

  const selectVariant = (v: RouteVariant) => setVariant(v);

  // ---------- Navigation ----------

  /** Recalcule l'itinéraire suivi depuis ma position (sortie du trajet, étape ajoutée, reprise) */
  const reroute = (via: SearchResult[], dest: SearchResult, opts: RouteOptions, v: RouteVariant, announce?: string) => {
    const from = meRef.current;
    if (!from || rerouting.current) return;
    rerouting.current = true;
    lastReroute.current = Date.now();
    setNavLoading(true);
    if (announce) speak(announce, true, 'guidance');
    fetchNavRoute([from, ...via, dest], variantOptions(opts, v))
      .then((r) => {
        setNavRoute(r);
        setNavError(null);
        spoken.current = new Set();
        offRouteCount.current = 0;
      })
      .catch((e) => {
        setNavError(errorText(e));
        speak('Recalcul impossible pour le moment', false, 'guidance');
      })
      .finally(() => {
        rerouting.current = false;
        setNavLoading(false);
      });
  };

  const start = () => {
    if (!selected?.route || !destination) return;
    spoken.current = new Set();
    offRouteCount.current = 0;
    stats.current = newTripStats();
    setTripM(0);
    setNavRoute(selected.route);
    setNavError(null);
    setShares([]);
    setPhase('navigating');
    const first = nextStep(selected.route, 0);
    speak(first ? `C'est parti. ${stepSentence(first.step, first.distanceM)}` : "C'est parti", true, 'guidance');
  };

  /** Fin de navigation (arrivée ou arrêt) : résumé enregistré dans « Mes trajets », partages terminés */
  const stop = (arrived = false) => {
    if (phase === 'navigating' && destination && stats.current) {
      const s = summarize(stats.current, destination.label, arrived);
      setSummary(saveTrip(s, stats.current.track) ? s : null);
    }
    if (shares.length) {
      endTripShares(shares.map((x) => x.id), arrived ? 'arrived' : 'stopped').catch((e) => console.warn('Fin du partage impossible', e));
    }
    computeToken.current++;
    stats.current = null;
    resume.current = null;
    writeSavedNav(null);
    setPhase('idle');
    setDestination(null);
    setStops([]);
    setChoices([]);
    setNavRoute(null);
    setNavError(null);
    setShares([]);
  };
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });

  const addStop = (place: SearchResult) => {
    if (!destination) return;
    const next = insertStop(route, stops, place);
    setStops(next);
    if (phase === 'preview') computeChoices(destination, next, options, variant);
    else if (phase === 'navigating') reroute(next, destination, options, variant, `Étape ajoutée : ${place.label}`);
  };

  const removeStop = (index: number) => {
    if (!destination) return;
    const next = stops.filter((_, i) => i !== index);
    setStops(next);
    if (phase === 'preview') computeChoices(destination, next, options, variant);
    else if (phase === 'navigating') reroute(next, destination, options, variant);
  };

  /** Partage mon trajet en direct avec un ami (fiche dans Messages) */
  const share = async (friend: { id: string; username: string }) => {
    if (!userId || !destination || !me || !progress) throw new Error('Itinéraire en cours de calcul, réessaie dans un instant.');
    const id = await shareTripWith(userId, friend.id, destination.label, {
      latitude: me.latitude,
      longitude: me.longitude,
      remainingS: progress.remainingS,
      remainingM: progress.remainingM,
    });
    lastShareUpdate.current = Date.now();
    setShares((list) => [...list, { id, friendId: friend.id, username: friend.username }]);
  };

  // Navigation interrompue (app fermée ou redémarrée) : reprise dès que la position est connue
  useEffect(() => {
    const saved = resume.current;
    if (!saved || !me || phase !== 'idle') return;
    resume.current = null;
    stats.current = saved.stats;
    setTripM(saved.stats.distanceM);
    setDestination(saved.destination);
    setStops(saved.stops);
    setOptions(saved.options);
    setVariant(saved.variant);
    setShares(saved.shares ?? []);
    setNavRoute(null);
    setPhase('navigating');
    reroute(saved.stops, saved.destination, saved.options, saved.variant, `Reprise de la navigation vers ${saved.destination.label}`);
  }, [me, phase]);

  // Navigation en cours gardée sur le téléphone, pour la reprendre après un redémarrage
  useEffect(() => {
    if (phase !== 'navigating' || !destination || !stats.current) return;
    writeSavedNav({ destination, stops, options, variant, shares, stats: stats.current, savedAt: Date.now() });
  }, [phase, destination, stops, options, variant, shares]);

  // Actions pendant la navigation : mesures, étapes, arrivée, recalcul, annonces vocales, partage
  useEffect(() => {
    if (phase !== 'navigating' || !me || !destination) return;
    const now = Date.now();

    if (stats.current) {
      stats.current = recordFix(stats.current, me, speedKmh, now);
      if (now - lastStatsSave.current > SAVE_STATS_EVERY_MS) {
        lastStatsSave.current = now;
        setTripM(stats.current.distanceM);
        writeSavedNav({ destination, stops, options, variant, shares, stats: stats.current, savedAt: now });
      }
    }

    // Pas encore d'itinéraire (reprise, échec du calcul) : nouvel essai régulier
    if (!navRoute) {
      if (!rerouting.current && now - lastReroute.current > REROUTE_MIN_INTERVAL_MS) reroute(stops, destination, options, variant);
      return;
    }
    const { remainingM, remainingS, offRoute: off, next } = computeProgress(navRoute, me);

    // Arrivée (arrêt différé : pas de changement d'état pendant l'effet)
    if (distanceM(me, destination) < ARRIVAL_M || remainingM < ARRIVAL_M / 2) {
      speak('Vous êtes arrivé à destination', true, 'guidance');
      setTimeout(() => stopRef.current(true), 0);
      return;
    }

    // Étape atteinte : retirée de la liste (le tracé, lui, continue vers la suite)
    if (stops.length && stops[0] !== reachedStop.current && distanceM(me, stops[0]) < STOP_REACHED_M) {
      reachedStop.current = stops[0];
      speak(`Étape atteinte : ${stops[0].label}`, true, 'guidance');
      setTimeout(() => setStops((s) => s.slice(1)), 0);
    }

    // Partage en direct : position et heure d'arrivée envoyées régulièrement
    if (shares.length && now - lastShareUpdate.current > SHARE_EVERY_MS) {
      lastShareUpdate.current = now;
      updateTripShares(shares.map((x) => x.id), { latitude: me.latitude, longitude: me.longitude, remainingS, remainingM }).catch((e) =>
        console.warn('Mise à jour du partage impossible', e),
      );
    }

    // Hors trajet : recalcul après plusieurs positions consécutives
    offRouteCount.current = off ? offRouteCount.current + 1 : 0;
    if (offRouteCount.current >= OFF_ROUTE_FIXES && !rerouting.current && now - lastReroute.current > REROUTE_MIN_INTERVAL_MS) {
      reroute(stops, destination, options, variant, "Recalcul de l'itinéraire");
    }

    // Annonces vocales à l'approche de la manœuvre
    if (next && !off) {
      const t = thresholds(speedKmh);
      const key = (level: string) => `${navRoute.engine}:${next.index}:${level}`;
      if (next.distanceM <= t.near && !spoken.current.has(key('near'))) {
        spoken.current.add(key('near')).add(key('mid')).add(key('far'));
        speak(stepSentence(next.step), true, 'guidance');
      } else if (next.distanceM <= t.mid && next.distanceM > t.near && !spoken.current.has(key('mid'))) {
        spoken.current.add(key('mid')).add(key('far'));
        speak(stepSentence(next.step, next.distanceM), false, 'guidance');
      } else if (next.distanceM <= t.far && next.distanceM > t.mid * 1.5 && !spoken.current.has(key('far'))) {
        spoken.current.add(key('far'));
        speak(stepSentence(next.step, next.distanceM), false, 'guidance');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, navRoute, me]);

  return {
    phase,
    destination,
    stops,
    route,
    choices,
    variant,
    /** Aperçu : calcul de l'itinéraire choisi ; navigation : recalcul en cours */
    loading: phase === 'navigating' ? navLoading : (selected?.loading ?? false),
    error: phase === 'navigating' ? navError : (selected?.error ?? null),
    progress,
    options,
    shares,
    summary,
    /** Distance parcourue depuis le départ (m), mise à jour toutes les 15 s */
    tripM: phase === 'navigating' ? tripM : 0,
    choose,
    updateOptions,
    selectVariant,
    start,
    stop,
    addStop,
    removeStop,
    share,
    clearSummary: () => setSummary(null),
  };
}
