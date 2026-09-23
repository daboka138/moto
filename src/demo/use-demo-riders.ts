import { useEffect, useState } from 'react';

import type { LatLng } from '@/demo/geo';
import { DemoSimulation, type DemoRiderState, type RoutingStats } from '@/demo/simulation';

const TICK_MS = 1000;

type DemoSnapshot = { riders: DemoRiderState[]; routing: RoutingStats };

const EMPTY: DemoSnapshot = { riders: [], routing: { osrm: 0, fallback: 0 } };

/**
 * Fait tourner la simulation tant que le mode démo est actif.
 * Les motards sont placés autour de la première position connue de l'utilisateur.
 */
export function useDemoRiders(enabled: boolean, userPosition: LatLng | null): DemoSnapshot {
  const [snapshot, setSnapshot] = useState<DemoSnapshot>(EMPTY);
  const [center, setCenter] = useState<LatLng | null>(null);
  if (userPosition && !center) setCenter(userPosition);

  useEffect(() => {
    if (!enabled || !center) return;
    const simulation = new DemoSimulation(center);
    let last = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const riders = simulation.tick((now - last) / 1000);
      last = now;
      setSnapshot({ riders, routing: { ...simulation.routing } });
    }, TICK_MS);
    return () => {
      clearInterval(interval);
      simulation.dispose();
      setSnapshot(EMPTY);
    };
  }, [enabled, center]);

  return enabled ? snapshot : EMPTY;
}
