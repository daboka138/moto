import type * as Location from 'expo-location';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { LatLng } from '@/lib/geo';
import { bearingDeg, type NavRoute } from '@/lib/navigation';

// Mode test (admin seulement, Paramètres › Mode développeur) : pendant une navigation, la
// position GPS est remplacée par un point qui avance le long de l'itinéraire à vitesse constante.
// Sert à tester guidage, virages serrés, rappel de pause, carburant… sans rouler.
// Sécurité : la fausse position n'est JAMAIS publiée (carte des amis, partage de trajet,
// « Je rentre ») et le trajet ne compte ni pour le compteur, ni pour les badges, ni pour les points.

export type SimulationState = { active: boolean; kmh: number };

export const SIMULATION_SPEEDS = [30, 50, 90, 200];

let state: SimulationState = { active: false, kmh: 50 };
const listeners = new Set<() => void>();

export function setSimulation(patch: Partial<SimulationState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getSimulation = () => state;

export function useSimulation() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );
}

function pointAt(route: NavRoute, alongM: number): { p: LatLng; heading: number } {
  const c = route.cumulative;
  let i = 0;
  while (i < c.length - 2 && c[i + 1] < alongM) i++;
  const a = route.points[i];
  const b = route.points[i + 1] ?? a;
  const t = Math.min(1, Math.max(0, (alongM - c[i]) / (c[i + 1] - c[i] || 1)));
  return {
    p: { latitude: a.latitude + (b.latitude - a.latitude) * t, longitude: a.longitude + (b.longitude - a.longitude) * t },
    heading: bearingDeg(a, b),
  };
}

/** Fausses positions (une par seconde) le long de l'itinéraire tant que la simulation est active */
export function useSimulatedLocation(active: boolean, route: NavRoute | null, onFix: (loc: Location.LocationObject) => void) {
  const along = useRef(0);
  const callback = useRef(onFix);
  useEffect(() => {
    callback.current = onFix;
  });
  const routeKey = route ? `${route.points.length}:${Math.round(route.distanceM)}` : null;

  useEffect(() => {
    if (!active || !route) return;
    // Nouvel itinéraire (départ, recalcul) : on repart de son début
    along.current = 0;
    const timer = setInterval(() => {
      const { kmh } = getSimulation();
      along.current = Math.min(route.distanceM, along.current + kmh / 3.6);
      const atEnd = along.current >= route.distanceM;
      const { p, heading } = pointAt(route, along.current);
      callback.current({
        coords: {
          latitude: p.latitude,
          longitude: p.longitude,
          altitude: null,
          accuracy: 5,
          altitudeAccuracy: null,
          heading,
          speed: atEnd ? 0 : kmh / 3.6,
        },
        timestamp: Date.now(),
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, routeKey]);
}
