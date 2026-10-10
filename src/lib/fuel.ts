import { useEffect, useRef, useState } from 'react';

import type { NavRoute } from '@/lib/navigation';
import { poisAlongRoute, type RoutePoi } from '@/lib/pois';
import { speak } from '@/lib/voice';

// Autonomie en navigation : si le carburant restant (Garage : réservoir, conso, dernier plein)
// ne suffit pas pour finir le trajet avec une marge, alerte vocale et station proposée sur le trajet.

/** Marge gardée à l'arrivée */
export const FUEL_RESERVE_KM = 30;
/** En dessous, alerte même si la destination est proche */
const LOW_FUEL_KM = 40;
/** Seconde alerte, plus pressante */
const CRITICAL_FUEL_KM = 15;

export type FuelSuggestion = {
  leftKm: number;
  /** Station la plus proche devant moi sur le trajet (null : aucune trouvée sur 50 km) */
  station: RoutePoi | null;
  searching: boolean;
};

/** Plein nécessaire avant d'arriver ? */
export function needsFuel(leftKm: number | null, remainingKm: number) {
  return leftKm !== null && (leftKm < remainingKm + FUEL_RESERVE_KM || leftKm < LOW_FUEL_KM);
}

export function useFuelAlert({
  navigating,
  leftKm,
  remainingKm,
  route,
  alongM,
}: {
  navigating: boolean;
  leftKm: number | null;
  remainingKm: number | null;
  route: NavRoute | null;
  alongM: number;
}) {
  const [suggestion, setSuggestion] = useState<FuelSuggestion | null>(null);
  const stage = useRef<'none' | 'low' | 'critical'>('none');
  const inputs = useRef({ route, alongM });
  useEffect(() => {
    inputs.current = { route, alongM };
  });

  const low = navigating && remainingKm !== null && needsFuel(leftKm, remainingKm);
  const critical = low && leftKm !== null && leftKm < CRITICAL_FUEL_KM;

  // Nouvelle navigation : on repart de zéro
  useEffect(() => {
    if (!navigating) {
      stage.current = 'none';
      const timer = setTimeout(() => setSuggestion(null), 0);
      return () => clearTimeout(timer);
    }
  }, [navigating]);

  useEffect(() => {
    if (!low || leftKm === null) return;
    const level = critical ? 'critical' : 'low';
    if (stage.current === level || stage.current === 'critical') return;
    stage.current = level;
    const km = Math.round(leftKm);
    speak(
      critical
        ? `Réserve presque vide : environ ${km} kilomètres d'autonomie. Faites le plein dès que possible`
        : `Autonomie faible, environ ${km} kilomètres. Je cherche une station sur le trajet`,
      true,
      'info',
    );
    const { route: r, alongM: from } = inputs.current;
    if (!r) return;
    let cancelled = false;
    const timer = setTimeout(() => setSuggestion({ leftKm, station: null, searching: true }), 0);
    poisAlongRoute(r, 'fuel', from)
      .then((stations) => {
        if (cancelled) return;
        // La plus proche devant moi, à moins d'1 km du tracé et atteignable
        const station = stations.find((s) => s.aheadM > 300 && s.aheadM / 1000 < leftKm - 3) ?? stations[0] ?? null;
        setSuggestion({ leftKm, station, searching: false });
      })
      .catch(() => !cancelled && setSuggestion({ leftKm, station: null, searching: false }));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [low, critical]);

  return { suggestion, dismiss: () => setSuggestion(null) };
}
