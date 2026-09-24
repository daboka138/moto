import { useEffect, useRef, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import {
  fetchNavRoute,
  nextStep,
  projectOnRoute,
  stepSentence,
  type NavRoute,
  type NavStep,
} from '@/lib/navigation';
import { defaultRouteOptions, type MotoCategory, type RouteOptions } from '@/lib/moto';
import type { SearchResult } from '@/lib/search';
import { speak } from '@/lib/voice';

export type NavPhase = 'idle' | 'preview' | 'navigating';

export type NavProgress = {
  next: { step: NavStep; index: number; distanceM: number } | null;
  alongM: number;
  remainingM: number;
  remainingS: number;
  offRoute: boolean;
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

/** Paliers d'annonce avant une manœuvre, selon la vitesse. */
function thresholds(speedKmh: number) {
  if (speedKmh > 80) return { far: 1200, mid: 400, near: 60 };
  if (speedKmh > 45) return { far: 700, mid: 250, near: 40 };
  return { far: 400, mid: 150, near: 25 };
}

/**
 * Navigation guidée : aperçu d'itinéraire, puis guidage avec annonces vocales,
 * recalcul si je sors du trajet, arrivée.
 */
export function useNavigation(me: LatLng | null, speedKmh: number, category: MotoCategory | null) {
  const [phase, setPhase] = useState<NavPhase>('idle');
  const [destination, setDestination] = useState<SearchResult | null>(null);
  // Options préremplies selon la moto principale, modifiables à chaque trajet
  const [options, setOptions] = useState<RouteOptions>(() => defaultRouteOptions(category));
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = phase === 'navigating' && route && me ? computeProgress(route, me) : null;

  const meRef = useRef(me);
  const spoken = useRef(new Set<string>());
  const offRouteCount = useRef(0);
  const lastReroute = useRef(0);
  const rerouting = useRef(false);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const compute = async (dest: SearchResult, opts: RouteOptions) => {
    const from = meRef.current;
    if (!from) {
      setError('Position GPS indisponible');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetchNavRoute(from, dest, opts);
      setRoute(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const choose = (dest: SearchResult) => {
    // Chaque nouveau trajet repart des options de la moto
    const opts = defaultRouteOptions(category);
    setOptions(opts);
    setDestination(dest);
    setPhase('preview');
    setRoute(null);
    compute(dest, opts);
  };

  const updateOptions = (patch: Partial<RouteOptions>) => {
    const next = { ...options, ...patch };
    // 50 cm³ : l'autoroute reste interdite quoi qu'il arrive
    if (next.scooter50) next.avoidHighways = true;
    setOptions(next);
    if (destination) compute(destination, next);
  };

  const start = () => {
    if (!route) return;
    spoken.current = new Set();
    offRouteCount.current = 0;
    setPhase('navigating');
    const first = nextStep(route, 0);
    speak(first ? `C'est parti. ${stepSentence(first.step, first.distanceM)}` : "C'est parti", true);
  };

  const stop = () => {
    setPhase('idle');
    setDestination(null);
    setRoute(null);
    setError(null);
  };
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });

  // Actions pendant la navigation : arrivée, recalcul, annonces vocales
  useEffect(() => {
    if (phase !== 'navigating' || !route || !me) return;
    const { remainingM, offRoute: off, next } = computeProgress(route, me);

    // Arrivée (arrêt différé : pas de changement d'état pendant l'effet)
    if (destination && (distanceM(me, destination) < ARRIVAL_M || remainingM < ARRIVAL_M / 2)) {
      speak('Vous êtes arrivé à destination', true);
      setTimeout(() => stopRef.current(), 0);
      return;
    }

    // Hors trajet : recalcul après plusieurs positions consécutives
    offRouteCount.current = off ? offRouteCount.current + 1 : 0;
    if (
      offRouteCount.current >= OFF_ROUTE_FIXES &&
      !rerouting.current &&
      destination &&
      Date.now() - lastReroute.current > REROUTE_MIN_INTERVAL_MS
    ) {
      rerouting.current = true;
      lastReroute.current = Date.now();
      speak("Recalcul de l'itinéraire", true);
      fetchNavRoute(me, destination, options)
        .then((r) => {
          setRoute(r);
          spoken.current = new Set();
          offRouteCount.current = 0;
        })
        .catch(() => speak('Recalcul impossible pour le moment'))
        .finally(() => {
          rerouting.current = false;
        });
    }

    // Annonces vocales à l'approche de la manœuvre
    if (next && !off) {
      const t = thresholds(speedKmh);
      const key = (level: string) => `${route.engine}:${next.index}:${level}`;
      if (next.distanceM <= t.near && !spoken.current.has(key('near'))) {
        spoken.current.add(key('near')).add(key('mid')).add(key('far'));
        speak(stepSentence(next.step), true);
      } else if (next.distanceM <= t.mid && next.distanceM > t.near && !spoken.current.has(key('mid'))) {
        spoken.current.add(key('mid')).add(key('far'));
        speak(stepSentence(next.step, next.distanceM));
      } else if (next.distanceM <= t.far && next.distanceM > t.mid * 1.5 && !spoken.current.has(key('far'))) {
        spoken.current.add(key('far'));
        speak(stepSentence(next.step, next.distanceM));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, route, me]);

  return {
    phase,
    destination,
    route,
    loading,
    error,
    progress,
    options,
    choose,
    updateOptions,
    start,
    stop,
  };
}
