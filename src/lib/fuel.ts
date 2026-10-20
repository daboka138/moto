import { useEffect, useRef, useState } from 'react';

import type { NavRoute } from '@/lib/navigation';
import type { LatLng } from '@/lib/geo';
import { poisAlongRoute, spotsAlongRoute, type RoutePoi } from '@/lib/pois';
import { speak } from '@/lib/voice';
import { sparseStationsAhead, type FuelType, type RouteStation } from '@/lib/fuel-prices';

// Autonomie en navigation : si le carburant restant (Garage : réservoir, conso, dernier plein)
// ne suffit pas pour finir le trajet avec une marge (ou passe sous 50 km), alerte vocale et station
// proposée sur le trajet : spots « station » de la communauté et stations aux prix officiels
// (France ; ailleurs, OpenStreetMap).

/** Marge gardée à l'arrivée */
export const FUEL_RESERVE_KM = 30;
/** En dessous, alerte même si la destination est proche */
export const LOW_FUEL_KM = 50;
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
  spots = [],
  fuel = 'e10',
}: {
  navigating: boolean;
  leftKm: number | null;
  remainingKm: number | null;
  route: NavRoute | null;
  alongM: number;
  /** Spots « station » de la communauté (carte) */
  spots?: (LatLng & { label: string })[];
  /** Carburant de ma moto (prix des stations officielles) */
  fuel?: FuelType;
}) {
  const [suggestion, setSuggestion] = useState<FuelSuggestion | null>(null);
  const stage = useRef<'none' | 'low' | 'critical'>('none');
  const inputs = useRef({ route, alongM, spots, fuel });
  useEffect(() => {
    inputs.current = { route, alongM, spots, fuel };
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
    const { route: r, alongM: from, spots: community, fuel: myFuel } = inputs.current;
    if (!r) return;
    let cancelled = false;
    const timer = setTimeout(() => setSuggestion({ leftKm, station: null, searching: true }), 0);
    const fromCommunity = spotsAlongRoute(r, community, from);
    poisAlongRoute(r, 'fuel', from, myFuel)
      .catch(() => [] as RoutePoi[])
      .then((osm) => {
        const stations = [...fromCommunity, ...osm].sort((a, b) => a.aheadM - b.aheadM);
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

/**
 * Longue portion sans station (routes de montagne), autonomie renseignée : en approchant d'une
 * station (< 5 km), si la suivante (ou l'arrivée) est trop loin pour ce qu'il me reste, rappel
 * vocal une fois par station + bandeau. Calcul sur le téléphone (sparseStationsAhead, pur).
 */
export function useSparseStationReminder({
  navigating,
  stations,
  alongM,
  routeM,
  leftKm,
}: {
  navigating: boolean;
  stations: RouteStation[] | null;
  alongM: number | null;
  routeM: number;
  leftKm: number | null;
}) {
  const said = useRef(new Set<number>());
  const sparse = navigating && alongM !== null ? sparseStationsAhead(stations, alongM, routeM, leftKm) : null;
  const stationId = sparse?.station.id ?? null;
  useEffect(() => {
    if (!navigating) said.current.clear();
  }, [navigating]);
  useEffect(() => {
    if (!sparse || stationId === null || said.current.has(stationId)) return;
    said.current.add(stationId);
    const inKm = Math.max(1, Math.round((sparse.station.alongM - (alongM ?? 0)) / 1000));
    const gap = Math.round(sparse.gapKm / 5) * 5;
    speak(
      sparse.afterIsArrival
        ? `Pense à faire le plein : prochaine station dans ${inKm} kilomètres, puis plus rien avant l'arrivée`
        : `Pense à faire le plein : prochaine station dans ${inKm} kilomètres, la suivante est à ${gap} kilomètres`,
      true,
      'info',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId]);
  if (!sparse || alongM === null) return null;
  const inKm = Math.max(1, Math.round((sparse.station.alongM - alongM) / 1000));
  return `Pense à faire le plein dans ${inKm} km : ${sparse.afterIsArrival ? 'plus de station ensuite' : `la station suivante est à ${Math.round(sparse.gapKm)} km`}`;
}
