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

// ---------- Le long de l'itinéraire (navigation) ----------
// Limitations récupérées par morceaux de 20 km du tracé (une requête par morceau, 5 km avant d'y arriver),
// gardées pour tout le trajet : plus de requête toutes les 8 s tant que je suis sur l'itinéraire.

/** Portion du tracé (distances le long de l'itinéraire, m) et sa limitation (null = inconnue) */
export type LimitRun = { fromM: number; toM: number; limit: number | null };

const CHUNK_M = 20_000;
const AHEAD_M = 5_000;
const CHUNK_SPACING_M = 30;
const CHUNK_MAX_POINTS = 600;
const RETRY_MS = 30_000;

type RouteShape = { points: LatLng[]; cumulative: number[]; distanceM: number };

/** Limitations d'un morceau du tracé [startM, startM + 20 km] */
export async function fetchRouteLimits(route: RouteShape, startM: number): Promise<{ runs: LimitRun[]; endM: number }> {
  const endM = Math.min(route.distanceM, startM + CHUNK_M);
  const shape: LatLng[] = [];
  let lastAt = -Infinity;
  for (let i = 0; i < route.points.length; i++) {
    const at = route.cumulative[i];
    if (at < startM) continue;
    if (at > endM) break;
    if (at - lastAt >= CHUNK_SPACING_M || at === endM) {
      shape.push(route.points[i]);
      lastAt = at;
    }
  }
  if (shape.length < 2) return { runs: [], endM };
  const step = Math.ceil(shape.length / CHUNK_MAX_POINTS);
  const sent = shape.filter((_, i) => i % step === 0 || i === shape.length - 1);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shape: sent.map((p) => ({ lat: p.latitude, lon: p.longitude })),
        costing: 'motorcycle',
        shape_match: 'map_snap',
        filters: { attributes: ['edge.speed_limit', 'edge.length'], action: 'include' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Valhalla ${res.status}`);
    const json = (await res.json()) as {
      edges?: { speed_limit?: number; length?: number; source_percent_along?: number; target_percent_along?: number }[];
    };
    return { runs: limitRuns(json.edges ?? [], startM, endM), endM };
  } finally {
    clearTimeout(timer);
  }
}

/** Tronçons Valhalla → portions du tracé (longueurs recalées sur la vraie distance du morceau) */
export function limitRuns(
  edges: { speed_limit?: number; length?: number; source_percent_along?: number; target_percent_along?: number }[],
  startM: number,
  endM: number,
): LimitRun[] {
  const lengths = edges.map((e, i) => {
    let km = e.length ?? 0;
    if (i === 0 && e.source_percent_along != null) km *= 1 - e.source_percent_along;
    if (i === edges.length - 1 && e.target_percent_along != null) km *= e.target_percent_along;
    return km * 1000;
  });
  const total = lengths.reduce((s, l) => s + l, 0);
  if (!total) return [];
  const scale = (endM - startM) / total;
  const runs: LimitRun[] = [];
  let at = startM;
  edges.forEach((e, i) => {
    const limit = typeof e.speed_limit === 'number' && e.speed_limit >= 5 && e.speed_limit <= 150 ? e.speed_limit : null;
    const to = at + lengths[i] * scale;
    const last = runs.at(-1);
    if (last && last.limit === limit) last.toM = to;
    else runs.push({ fromM: at, toM: to, limit });
    at = to;
  });
  return runs;
}

/**
 * Limitation à ma position sur l'itinéraire : nombre, null (route sans limitation connue : rien
 * d'affiché) ou undefined (morceau pas encore chargé : utiliser la limitation en direct).
 */
export function useRouteSpeedLimit(route: RouteShape | null, alongM: number | null, enabled: boolean): number | null | undefined {
  // Limitations chargées (affichage) ; suivi des requêtes dans une ref (effets seulement)
  const [loaded, setLoaded] = useState<{ route: RouteShape | null; runs: LimitRun[] }>({ route: null, runs: [] });
  const fetching = useRef<{ route: RouteShape | null; to: number; busy: boolean; retryAt: number }>({
    route: null,
    to: 0,
    busy: false,
    retryAt: 0,
  });
  const along500 = alongM === null ? null : Math.floor(alongM / 500);

  useEffect(() => {
    if (fetching.current.route !== route) fetching.current = { route, to: 0, busy: false, retryAt: 0 };
    const f = fetching.current;
    if (!enabled || !route || along500 === null || f.busy || f.to >= route.distanceM) return;
    if (along500 * 500 + AHEAD_M < f.to || Date.now() < f.retryAt) return;
    // Un saut (itinéraire repris plus loin) : on repart de ma position
    const start = Math.max(f.to, along500 * 500);
    f.busy = true;
    fetchRouteLimits(route, start)
      .then(({ runs, endM }) => {
        if (fetching.current !== f) return;
        f.to = endM;
        setLoaded((l) => ({ route, runs: l.route === route ? [...l.runs, ...runs] : runs }));
      })
      .catch(() => {
        f.retryAt = Date.now() + RETRY_MS;
      })
      .finally(() => {
        f.busy = false;
      });
  }, [enabled, route, along500]);

  if (!enabled || !route || alongM === null || loaded.route !== route) return undefined;
  const run = loaded.runs.find((r) => alongM >= r.fromM && alongM < r.toM);
  return run ? run.limit : undefined;
}
