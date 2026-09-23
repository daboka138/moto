import { useCallback, useEffect, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import { fetchReportsAround, type RoadReport } from '@/lib/reports';

const POLL_MS = 30_000;
/** On recharge la zone si je me suis éloigné de plus de 10 km du dernier centre */
const RECENTER_M = 10_000;

/** Signalements actifs autour de moi, rafraîchis toutes les 30 s. */
export function useRoadReports(me: LatLng | null) {
  const [center, setCenter] = useState<LatLng | null>(null);
  const [reports, setReports] = useState<RoadReport[]>([]);
  if (me && (!center || distanceM(center, me) > RECENTER_M)) setCenter(me);

  const refresh = useCallback(async () => {
    if (!center) return;
    try {
      setReports(await fetchReportsAround(center));
    } catch (e) {
      console.warn('Chargement des signalements impossible', e);
    }
  }, [center]);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    const load = () =>
      fetchReportsAround(center)
        .then((r) => !cancelled && setReports(r))
        .catch((e) => console.warn('Chargement des signalements impossible', e));
    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [center]);

  return { reports, refresh };
}
