import { useEffect, useRef, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';

// Limitation de vitesse de la route où je roule (étiquette OSM « maxspeed »), via le
// « map matching » de Valhalla (serveur public FOSSGIS) : on lui envoie mes dernières
// positions, il les recale sur la route et renvoie sa limitation. Inconnue = rien d'affiché.

const URL = 'https://valhalla1.openstreetmap.de/trace_attributes';
const TIMEOUT_MS = 8000;
/** Une requête toutes les 8 s au plus (le serveur public limite le débit) */
const INTERVAL_MS = 8000;
/** Positions gardées pour le recalage, espacées d'au moins 15 m */
const TRACE_POINTS = 6;
const TRACE_SPACING_M = 15;
/** En dessous, on ne demande rien (à l'arrêt, on garde la dernière valeur) */
const MIN_KMH = 10;
/** Sans réponse récente, la valeur affichée n'est plus fiable */
const STALE_MS = 45_000;

export async function fetchSpeedLimit(trace: LatLng[]): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: trace.map((p) => ({ lat: p.latitude, lon: p.longitude })),
        costing: 'motorcycle',
        shape_match: 'map_snap',
        filters: { attributes: ['edge.speed_limit'], action: 'include' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { edges?: { speed_limit?: number }[] };
    // Dernier tronçon = la route où je suis maintenant
    const limit = json.edges?.at(-1)?.speed_limit;
    return typeof limit === 'number' && limit >= 5 && limit <= 150 ? limit : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Limitation de vitesse de ma route (km/h), null si inconnue ou désactivée. */
export function useSpeedLimit(position: LatLng | null, kmh: number, enabled: boolean) {
  const [limit, setLimit] = useState<{ value: number | null; at: number } | null>(null);
  const trace = useRef<LatLng[]>([]);
  const lastRequest = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled || !position) return;
    const last = trace.current.at(-1);
    if (!last || distanceM(last, position) >= TRACE_SPACING_M) {
      // Un saut (coupure GPS) : on repart d'une trace propre
      if (last && distanceM(last, position) > 1000) trace.current = [];
      trace.current = [...trace.current, { latitude: position.latitude, longitude: position.longitude }].slice(-TRACE_POINTS);
    }
    const now = Date.now();
    if (kmh < MIN_KMH || trace.current.length < 2 || busy.current || now - lastRequest.current < INTERVAL_MS) return;
    busy.current = true;
    lastRequest.current = now;
    fetchSpeedLimit(trace.current)
      .then((value) => setLimit({ value, at: Date.now() }))
      .catch(() => {
        // réseau : la dernière valeur reste jusqu'à expiration
      })
      .finally(() => {
        busy.current = false;
      });
  }, [enabled, position, kmh]);

  if (!enabled || !limit || limit.value === null) return null;
  // À l'arrêt, la dernière limitation reste affichée ; en roulant, elle doit être récente
  // eslint-disable-next-line react-hooks/purity
  if (kmh >= MIN_KMH && Date.now() - limit.at > STALE_MS) return null;
  return limit.value;
}
