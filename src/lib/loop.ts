import { distanceM, type LatLng } from '@/lib/geo';
import {
  bearingDeg,
  crossesWater,
  encodePolyline6,
  fetchValhalla,
  joinRoutes,
  postValhalla,
  sameRoute,
  valhallaCosting,
  valhallaLocation,
  type NavRoute,
} from '@/lib/navigation';
import type { RouteOptions } from '@/lib/moto';

// « Fais-moi une boucle » : 2-3 boucles au départ de ma position, avec le moteur d'itinéraire
// déjà en place (Valhalla, serveur OpenStreetMap). Méthode : quelques points de passage posés
// sur un cercle qui part de ma position (rayon choisi d'après la longueur voulue), dans des
// directions différentes ; chaque boucle reçoit un score de sinuosité calculé sur sa géométrie
// (virages par km). Requêtes une par une, pour rester raisonnable avec le serveur public.
// Garde-fous (bord de mer, grandes villes) :
// - points de passage vérifiés avant le calcul (Valhalla /locate + altitude Open-Meteo) : en mer
//   (0 m, loin de toute route) → rapprochés du départ ; en plein massif → recalés sur la route la
//   plus proche ; en plein centre-ville → déplacés ; jamais sur une ligne de ferry ni un sentier ;
// - départ en ville : points en éventail vers la campagne et le relief, sortie et retour par des
//   routes directes (sans autoroute), du côté le moins bâti d'abord ;
// - ferries et trains-autos interdits, toute boucle qui passe sur l'eau est rejetée ;
// - cul-de-sac pour atteindre un point de passage → point ramené au carrefour, boucle recalculée ;
// - classement « plaisir » : sinuosité, moins la part en ville dense (trace_attributes) et les
//   allers-retours (plus de 20 % du tracé repris = écartée).

export type Curviness = 'calm' | 'twisty' | 'very';

export const CURVINESS: { value: Curviness; label: string; emoji: string }[] = [
  { value: 'calm', label: 'Tranquille', emoji: '🙂' },
  { value: 'twisty', label: 'Sinueux', emoji: '〰️' },
  { value: 'very', label: 'Très sinueux', emoji: '🌀' },
];

export const LOOP_DURATIONS_MIN = [30, 60, 90, 120, 180];
export const LOOP_DISTANCES_KM = [40, 80, 120, 160, 200];

export type LoopTarget = { kind: 'duration'; minutes: number } | { kind: 'distance'; km: number };

export type LoopRequest = {
  start: LatLng;
  target: LoopTarget;
  curviness: Curviness;
  avoidHighways: boolean;
  /** 50 cm³ : profil cyclomoteur (jamais d'autoroute ni de voie rapide) */
  scooter50?: boolean;
};

export type Loop = {
  id: string;
  route: NavRoute;
  /** Points de passage utilisés pour la calculer (repris pour naviguer) */
  via: LatLng[];
  /** 0 à 10 : virages par km, ramenés sur 10 */
  score: number;
  /** Degrés de virage cumulés par km (brut) */
  degPerKm: number;
  /** Part du trajet faite deux fois (aller-retour sur la même route), 0 à 1 */
  overlap: number;
  /** Durée estimée à moto (min) : Valhalla compte trop large sur les petites routes */
  durationMin: number;
  /** Part du trajet en ville dense, 0 à 1 (null : inconnue, serveur indisponible) */
  urban: number | null;
  /** Km parcourus avant de quitter la ville dense (null : inconnu) */
  exitKm: number | null;
};

/** Vitesse moyenne de départ selon le type de route (pour passer d'une durée à une distance) */
const AVG_KMH: Record<Curviness, number> = { calm: 60, twisty: 45, very: 35 };

/** Vitesse moyenne à moto selon la sinuosité : ~65 km/h sur route tranquille, ~30 km/h en lacets */
export function loopDurationMin(distanceM: number, score: number) {
  const kmh = Math.min(65, Math.max(30, 65 - 3.5 * score));
  return Math.round((distanceM / 1000 / kmh) * 60);
}
/** Une route fait environ 1,3 fois la distance à vol d'oiseau */
const ROAD_FACTOR = 1.3;
/** Calculs d'itinéraire au plus (boucles rejetées comprises), et boucles valables voulues */
const MAX_ROUTES = 6;
const ENOUGH = 4;
/** Sans altitude connue : aucune route à moins de 600 m = en mer */
const SEA_M = 600;
/** Point à moins de 300 m d'une route : gardé tel quel ; sinon recalé sur la route (3 km au plus) */
const NEAR_ROAD_M = 300;
const SNAP_MAX_M = 3000;
/**
 * Rues (classe « résidentielle » et au-dessus) à moins de 200 m : 25 ou plus = centre-ville
 * (Vieux-Port 28, Castellane 48, Aubagne 70 ; crêtes, cols, lotissements : 1 à 6)
 */
const URBAN_WAYS = 25;
const PROBE_RADIUS_M = 200;
/** 12 rues ou plus à moins de 200 m : zone bâtie (ville, banlieue dense) */
const BUILT_WAYS = 12;
/** Directions sondées et points sondés sur le cercle de chacune */
const HEADINGS = 8;
const HEADING_SAMPLES = 6;
/** Densité Valhalla (0 à 15) à partir de laquelle on roule en ville dense (Prado → Vieux-Port : 55 % du trajet) */
const DENSE = 9;
/** Aller-retour toléré sans pénalité, et maximum pour être proposée */
const OVERLAP_FREE = 0.1;
const OVERLAP_MAX = 0.2;
/** Cul-de-sac pris pour atteindre un point de passage, à supprimer */
const SPUR_MIN_M = 250;
const SPUR_MAX_M = 5000;
const SPUR_STEP_M = 25;
const SPUR_SIDE_M = 80;
const EARTH_M = 6_371_000;

export function targetKm(t: LoopTarget, c: Curviness) {
  return t.kind === 'distance' ? t.km : (t.minutes / 60) * AVG_KMH[c];
}

/** Point à `m` mètres de `p` dans la direction `deg` */
function offset(p: LatLng, deg: number, m: number): LatLng {
  const b = (deg * Math.PI) / 180;
  const lat1 = (p.latitude * Math.PI) / 180;
  const lon1 = (p.longitude * Math.PI) / 180;
  const d = m / EARTH_M;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: (lat2 * 180) / Math.PI, longitude: (((lon2 * 180) / Math.PI + 540) % 360) - 180 };
}

/**
 * Points de passage d'une boucle : cercle de rayon r passant par le départ, centre dans la
 * direction `heading` ; n points répartis sur le cercle (le départ n'en fait pas partie).
 */
export function loopWaypoints(start: LatLng, heading: number, radiusM: number, n: number): LatLng[] {
  const center = offset(start, heading, radiusM);
  const back = (heading + 180) % 360; // direction centre → départ
  return Array.from({ length: n }, (_, k) => offset(center, back + ((k + 1) * 360) / (n + 1), radiusM));
}

/** Tracé rééchantillonné tous les `stepM` mètres (gomme le bruit des petits segments) */
function resample(points: LatLng[], stepM: number): LatLng[] {
  if (points.length < 2) return points;
  const out = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += distanceM(points[i - 1], points[i]);
    if (acc >= stepM) {
      out.push(points[i]);
      acc = 0;
    }
  }
  return out;
}

/** Sinuosité : degrés de virage cumulés par km (virages de moins de 8° ignorés : simple bruit) */
export function curvature(points: LatLng[]): { degPerKm: number; score: number } {
  const pts = resample(points, 60);
  let total = 0;
  let length = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = bearingDeg(pts[i - 1], pts[i]);
    const b = bearingDeg(pts[i], pts[i + 1]);
    const turn = Math.abs(((b - a + 540) % 360) - 180);
    // Demi-tour (point de passage atteint par un aller-retour) : ce n'est pas un virage
    if (turn >= 8 && turn < 150) total += turn;
    length += distanceM(pts[i - 1], pts[i]);
  }
  const km = Math.max(length / 1000, 0.1);
  const degPerKm = total / km;
  // ~30°/km : grands axes ; ~150°/km : départementales vallonnées ; 300°/km et plus : routes de cols
  return { degPerKm, score: Math.round(Math.min(10, degPerKm / 30) * 10) / 10 };
}

/** Part du tracé empruntée deux fois (grille de ~80 m), pour écarter les allers-retours */
export function overlapRatio(points: LatLng[]): number {
  const pts = resample(points, 80);
  const seen = new Map<string, number>();
  let repeated = 0;
  pts.forEach((p, i) => {
    const key = `${Math.round(p.latitude * 1300)}:${Math.round(p.longitude * 900)}`;
    const first = seen.get(key);
    // Revenir dans la même case bien plus tard = même route reprise
    if (first !== undefined && i - first > 6) repeated++;
    else if (first === undefined) seen.set(key, i);
  });
  return pts.length ? repeated / pts.length : 0;
}

function optionsFor(r: LoopRequest): RouteOptions {
  return {
    scooter50: !!r.scooter50,
    avoidHighways: r.avoidHighways || !!r.scooter50,
    avoidTolls: r.avoidHighways,
    avoidUnpaved: true,
    preferTrails: false,
    // Sinueux / très sinueux : profil « petites routes » (grands axes évités, relief bienvenu)
    style: r.curviness === 'calm' ? 'fast' : 'fun',
  };
}

/** Point entre a (t = 0) et b (t = 1), au-delà si t > 1 */
const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({
  latitude: a.latitude + (b.latitude - a.latitude) * t,
  longitude: a.longitude + (b.longitude - a.longitude) * t,
});

/**
 * Sondage d'un point : route la plus proche, rues autour, altitude. `spot` = point de passage
 * utilisable (le point lui-même près d'une route, sinon la route la plus proche dans un massif),
 * null en mer ou trop loin de toute route.
 */
type Probe = { roadM: number; ways: number; elevation: number | null; sea: boolean; spot: LatLng | null };
const isUrban = (p: Probe) => p.ways >= URBAN_WAYS;
const isBuilt = (p: Probe) => p.ways >= BUILT_WAYS;

type LocateResult = { edges: { way_id: number; correlated_lat: number; correlated_lon: number }[] | null };

/** Altitudes (Open-Meteo, sans clé, 100 points par requête) : 0 en mer. null si indisponible */
async function elevations(points: LatLng[]): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    try {
      const url =
        'https://api.open-meteo.com/v1/elevation?latitude=' +
        chunk.map((p) => p.latitude.toFixed(5)).join(',') +
        '&longitude=' +
        chunk.map((p) => p.longitude.toFixed(5)).join(',');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const json = (await (await fetch(url, { signal: controller.signal })).json().finally(() => clearTimeout(timer))) as {
        elevation?: number[];
      };
      chunk.forEach((_, j) => out.push(json.elevation?.[j] ?? null));
    } catch {
      chunk.forEach(() => out.push(null));
    }
  }
  return out;
}

/** Sondage de chaque point (Valhalla /locate, 40 points par requête, + altitudes) */
async function probe(points: LatLng[], costing: string): Promise<Probe[]> {
  const located: { roadM: number; ways: number; road: LatLng | null }[] = [];
  for (let i = 0; i < points.length; i += 40) {
    const chunk = points.slice(i, i + 40);
    const res = await postValhalla<LocateResult[]>('locate', {
      costing,
      verbose: false,
      // Rues et routes seulement : ni sentier, ni piste, ni voie de service (le point y serait inaccessible)
      locations: chunk.map((p) => ({
        ...valhallaLocation(p),
        radius: PROBE_RADIUS_M,
        search_filter: { exclude_ferry: true, min_road_class: 'residential' },
      })),
    });
    chunk.forEach((p, j) => {
      // La route la plus proche est renvoyée même au-delà du rayon
      const roads = (res[j]?.edges ?? []).map((e) => ({ latitude: e.correlated_lat, longitude: e.correlated_lon }));
      const road = roads.length ? roads.reduce((a, b) => (distanceM(p, b) < distanceM(p, a) ? b : a)) : null;
      located.push({ roadM: road ? distanceM(p, road) : Infinity, ways: new Set((res[j]?.edges ?? []).map((e) => e.way_id)).size, road });
    });
  }
  // Altitude : mer (0 m) ou massif pour les points loin d'une route, relief préféré pour tous
  const heights = await elevations(points);
  return points.map((p, i) => {
    const l = located[i];
    const elevation = heights[i];
    const sea = l.roadM > NEAR_ROAD_M && (elevation != null ? elevation < 2 : l.roadM > SEA_M);
    const spot = l.roadM <= NEAR_ROAD_M ? p : !sea && l.road && l.roadM <= SNAP_MAX_M ? l.road : null;
    return { roadM: l.roadM, ways: l.ways, elevation, sea, spot };
  });
}

/**
 * Directions classées : d'abord celles dont le cercle passe hors des zones bâties et sur la terre
 * ferme (depuis Marseille : collines, Calanques, Sainte-Baume plutôt que la ville et la mer).
 */
async function rankHeadings(
  start: LatLng,
  radiusM: number,
  costing: string,
  first: number,
): Promise<{ headings: number[]; startBuilt: boolean }> {
  const headings = Array.from({ length: HEADINGS }, (_, i) => (first + (i * 360) / HEADINGS + (Math.random() - 0.5) * 20) % 360);
  try {
    const samples = headings.map((h) => loopWaypoints(start, h, radiusM, HEADING_SAMPLES));
    // Le départ est sondé avec : en ville, on en sort par des routes directes
    const probes = await probe([start, ...samples.flat()], costing);
    const cost = headings.map((_, i) => {
      const ps = probes.slice(1 + i * HEADING_SAMPLES, 1 + (i + 1) * HEADING_SAMPLES);
      // Zones bâties et mer à éviter, relief bienvenu
      return (
        ps.filter((p) => !p.sea && isBuilt(p)).length +
        0.5 * ps.filter((p) => !p.spot).length -
        ps.reduce((a, p) => a + Math.min(1, (p.elevation ?? 0) / 300), 0) / HEADING_SAMPLES
      );
    });
    const ranked = headings
      .map((h, i) => ({ h, c: cost[i] }))
      .sort((a, b) => a.c - b.c)
      .map((x) => x.h);
    return { headings: ranked, startBuilt: isBuilt(probes[0]) };
  } catch {
    return { headings, startBuilt: false };
  }
}

/** Éventail (départ en ville) : 16 directions, 6 distances sondées par direction (part de D) */
const FAN_DIRECTIONS = 16;
const FAN_DISTANCES = [0.55, 0.7, 0.85, 1, 1.2, 1.45];
/** Points sondés sur le chemin d'accès (part de D) : bâti ou en mer = boucle qui traverse la ville */
const FAN_ACCESS = [0.35, 0.55];
/** Écart des points de l'éventail, en directions de 22,5° (± 45° pour 3 points, ± 22° / 67° pour 4) */
const FAN_SPREAD: Record<number, number[]> = { 3: [-2, 0, 2], 4: [-3, -1, 1, 3] };
/** Départ → P1 → … → Pn → départ : environ 4 fois la distance D des points, par la route (mesuré à Marseille, Cassis) */
const FAN_PERIMETER = 4;

/** Une direction de l'éventail : points de passage pour une échelle donnée (1 = taille prévue) */
type FanPlan = { id: string; via: (scale: number) => LatLng[] | null };

/**
 * Départ en ville : points de passage en éventail, dans les directions où l'on trouve de la
 * campagne (terre ferme, peu de rues), en relief de préférence, en sortant de la ville au plus
 * vite ; les meilleures directions d'abord. L'échelle est corrigée au fil des essais.
 */
export async function fanWaypoints(start: LatLng, km: number, costing: string, n: number): Promise<FanPlan[]> {
  const D = (km * 1000) / FAN_PERIMETER;
  const step = 360 / FAN_DIRECTIONS;
  const grid = Array.from({ length: FAN_DIRECTIONS }, (_, d) => FAN_DISTANCES.map((f) => offset(start, d * step, D * f)));
  const access = Array.from({ length: FAN_DIRECTIONS }, (_, d) => FAN_ACCESS.map((f) => offset(start, d * step, D * f)));
  const probes = await probe([...grid.flat(), ...access.flat()], costing);
  const at = (d: number, j: number) => probes[d * FAN_DISTANCES.length + j];
  // Chemin d'accès bâti, ou en mer (la route contourne alors par la côte et la ville)
  const builtAccess = (d: number) =>
    FAN_ACCESS.filter((_, k) => {
      const p = probes[FAN_DIRECTIONS * FAN_DISTANCES.length + d * FAN_ACCESS.length + k];
      return !p.spot || isBuilt(p);
    }).length;
  const spread = FAN_SPREAD[n] ?? FAN_SPREAD[3];

  // Points de l'éventail centré sur d à l'échelle `scale`, avec leur coût (null : impossible)
  const build = (d: number, scale: number) => {
    const via: LatLng[] = [];
    const dirs: number[] = [];
    let cost = 0;
    // Distances essayées : la plus proche de l'échelle d'abord
    const order = FAN_DISTANCES.map((f, j) => ({ f, j })).sort((a, b) => Math.abs(a.f - scale) - Math.abs(b.f - scale));
    for (const s of spread) {
      // Branche impossible (mer, ville) : essayée aussi une direction plus près de l'axe
      let found: { dir: number; j: number } | null = null;
      for (const t of s === 0 ? [s] : [s, s - Math.sign(s)]) {
        const dir = (d + t + FAN_DIRECTIONS) % FAN_DIRECTIONS;
        const o = order.find(({ j }) => !!at(dir, j).spot && !isBuilt(at(dir, j)));
        if (o) {
          found = { dir, j: o.j };
          break;
        }
      }
      if (!found) return null;
      const p = at(found.dir, found.j);
      if (via.length && via[via.length - 1] === p.spot) return null; // deux branches au même point
      via.push(p.spot!);
      dirs.push(found.dir);
      // Relief bienvenu (collines, cols : jusqu'à -3 à 300 m), taille prévue de préférence
      cost += 2 * Math.abs(FAN_DISTANCES[found.j] - scale) - Math.min(3, (p.elevation ?? 0) / 100);
    }
    // Sortie et retour : à travers la ville ou non ; on part du côté le moins bâti (la ville éventuelle au retour)
    const exitBuilt = builtAccess(dirs[0]);
    const returnBuilt = builtAccess(dirs[dirs.length - 1]);
    cost += 1.5 * (exitBuilt + returnBuilt);
    return { via: returnBuilt < exitBuilt ? [...via].reverse() : via, cost };
  };

  const ranked = Array.from({ length: FAN_DIRECTIONS }, (_, d) => ({ d, plan: build(d, 1) }))
    .filter((x): x is { d: number; plan: NonNullable<ReturnType<typeof build>> } => !!x.plan)
    .sort((a, b) => a.plan.cost - b.plan.cost);
  // Les meilleures directions, sans deux voisines (boucles différentes)
  const chosen: number[] = [];
  for (const { d } of ranked) {
    const gap = (x: number) => Math.min(Math.abs(x - d), FAN_DIRECTIONS - Math.abs(x - d));
    if (chosen.every((c) => gap(c) >= 2)) chosen.push(d);
  }
  return chosen.map((d) => ({ id: `fan-${Math.round(d * step)}`, via: (scale: number) => build(d, scale)?.via ?? null }));
}

/** Autres places essayées pour un point de passage mal placé : plus près du départ, ou un peu plus loin */
const ALTERNATIVES = [0.75, 1.3, 0.55, 0.35];

/**
 * Points de passage sur la terre ferme, hors des centres-villes. Un point en mer est rapproché du
 * départ ; un point en plein massif est recalé sur la route la plus proche ; un point en plein
 * centre est déplacé (gardé seulement s'il n'y a pas mieux autour).
 * null : impossible de placer les points dans cette direction.
 */
export async function placeWaypoints(start: LatLng, via: LatLng[], costing: string): Promise<LatLng[] | null> {
  const first = await probe(via, costing);
  const out = via.map((p, i) => first[i].spot ?? p);
  const bad = via.map((_, i) => i).filter((i) => !first[i].spot || isUrban(first[i]));
  if (!bad.length) return out;
  const options = bad.map((i) => ALTERNATIVES.map((t) => lerp(start, via[i], t)));
  const probes = await probe(options.flat(), costing);
  let k = 0;
  for (const [b, i] of bad.entries()) {
    const found = probes.slice(k, k + options[b].length);
    k += options[b].length;
    const good = found.find((p) => p.spot && !isUrban(p));
    const land = found.find((p) => p.spot);
    if (good) out[i] = good.spot!;
    else if (first[i].spot) continue; // ville tout autour : on garde le point (pénalisé au classement)
    else if (land) out[i] = land.spot!;
    else return null;
  }
  return out;
}

/** Tracé rééchantillonné à pas réguliers (interpolé : indices comparables à l'aller et au retour) */
function evenly(points: LatLng[], stepM: number): LatLng[] {
  if (points.length < 2) return points;
  const out = [points[0]];
  let carry = 0; // distance parcourue depuis le dernier point posé
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = distanceM(a, b);
    let t = stepM - carry;
    while (t <= d) {
      out.push(lerp(a, b, t / d));
      t += stepM;
    }
    carry = d - (t - stepM);
  }
  return out;
}

/**
 * Cul-de-sac pour atteindre un point de passage (on y va et on revient par la même route) :
 * renvoie l'entrée du cul-de-sac (à mettre à la place du point), ou null s'il n'y en a pas.
 */
export function spurBase(points: LatLng[], waypoint: LatLng): LatLng | null {
  const pts = evenly(points, SPUR_STEP_M);
  let m = 0;
  for (let i = 1; i < pts.length; i++) if (distanceM(pts[i], waypoint) < distanceM(pts[m], waypoint)) m = i;
  const near = (i: number, j: number) => {
    for (let d = -2; d <= 2; d++) {
      const x = pts[i + d];
      // 80 m : aller et retour parfois sur deux voies parallèles (chaussées séparées, boucle de desserte)
      if (x && distanceM(x, pts[j]) < SPUR_SIDE_M) return true;
    }
    return false;
  };
  let k = 1;
  while (m - k >= 0 && m + k < pts.length && near(m - k, m + k)) k++;
  const lengthM = (k - 1) * SPUR_STEP_M;
  return lengthM >= SPUR_MIN_M && lengthM <= SPUR_MAX_M ? pts[m - k + 1] : null;
}

type TraceAttributes = { edges?: { length: number; density?: number }[] };

/** Part du tracé en ville dense, et km parcourus avant d'en sortir (Valhalla trace_attributes) */
async function urbanStats(route: NavRoute, costing: string): Promise<{ urban: number; exitKm: number } | null> {
  try {
    const res = await postValhalla<TraceAttributes>('trace_attributes', {
      encoded_polyline: encodePolyline6(route.points),
      // Tracé de plusieurs étapes bout à bout : edge_walk échoue aux jonctions, d'où le repli map-matching
      shape_match: 'walk_or_snap',
      costing,
      filters: { attributes: ['edge.length', 'edge.density'], action: 'include' },
    });
    const edges = res.edges ?? [];
    const dense = (e: { density?: number }) => (e.density ?? 0) >= DENSE;
    const total = edges.reduce((a, e) => a + e.length, 0);
    if (!total) return null;
    // Sortie de la ville : premier endroit où les 2 km suivants sont à moins de 20 % en ville dense
    let along = 0;
    let exitKm = total;
    for (let i = 0; i < edges.length; i++) {
      let len = 0;
      let d = 0;
      for (let j = i; j < edges.length && len < 2; j++) {
        len += edges[j].length;
        if (dense(edges[j])) d += edges[j].length;
      }
      if (d / len < 0.2) {
        exitKm = along;
        break;
      }
      along += edges[i].length;
    }
    const denseKm = edges.reduce((a, e) => a + (dense(e) ? e.length : 0), 0);
    return { urban: denseKm / total, exitKm };
  } catch {
    return null;
  }
}

/** Note de classement : sinuosité voulue, moins la ville (part et km avant d'en sortir) et les allers-retours */
export function plaisirScore(l: Pick<Loop, 'score' | 'urban' | 'overlap' | 'exitKm'>, curviness: Curviness) {
  const curves = curviness === 'calm' ? 10 - l.score : l.score;
  return curves - 10 * (l.urban ?? 0) - 0.15 * (l.exitKm ?? 0) - 30 * Math.max(0, l.overlap - OVERLAP_FREE);
}

/**
 * Génère jusqu'à 3 boucles. `onProgress(n, total)` après chaque calcul.
 * Le rayon est corrigé au fil des essais pour coller à la longueur voulue.
 */
export async function generateLoops(r: LoopRequest, onProgress?: (done: number, total: number) => void): Promise<Loop[]> {
  const wantKm = targetKm(r.target, r.curviness);
  // Ce qu'on compare à la demande : la durée calculée (durée demandée) ou la distance
  const want = r.target.kind === 'duration' ? r.target.minutes : r.target.km;
  const measure = (route: NavRoute, score: number) =>
    r.target.kind === 'duration' ? loopDurationMin(route.distanceM, score) : route.distanceM / 1000;
  const options = optionsFor(r);
  const { costing } = valhallaCosting(options);
  // Très sinueux : un point de plus (la boucle serpente davantage)
  const n = r.curviness === 'very' ? 4 : 3;
  const radius0 = (wantKm * 1000) / (2 * Math.PI * ROAD_FACTOR);
  // Taille corrigée au fil des essais (cercle : rayon ; éventail : échelle radiusM / radius0)
  let radiusM = radius0;
  const first = Math.random() * 360;
  const found: Loop[] = [];
  let reached = false; // le serveur a répondu au moins une fois
  const { headings, startBuilt } = await rankHeadings(r.start, radiusM, costing, first);
  // Départ en ville et boucle « petites routes » : sortie et retour par des routes directes (sans
  // autoroute), sinon le profil petites routes zigzague dans les rues. Petites routes ensuite.
  const exitFast = startBuilt && options.style === 'fun';
  const fetchLoop = async (via: LatLng[]) => {
    const stops = [r.start, ...via, r.start];
    if (!exitFast) return fetchValhalla(stops, options, (i) => i > 0 && i < stops.length - 1);
    const direct: RouteOptions = { ...options, style: 'fast' };
    const out = await fetchValhalla([r.start, via[0]], direct, (i) => i === 1);
    const middle = await fetchValhalla(via, options, () => true);
    const back = await fetchValhalla([via[via.length - 1], r.start], direct, (i) => i === 0);
    return joinRoutes([out, middle, back]);
  };
  // Point de passage injoignable (route interdite au profil, île…) : boucle sans le dernier, puis sans le premier
  const fetchLoopOrDrop = async (via: LatLng[]) => {
    try {
      return { route: await fetchLoop(via), via };
    } catch (e) {
      if (via.length <= 2) throw e;
      for (const k of [via.length - 1, 0]) {
        const fewer = via.filter((_, j) => j !== k);
        const route = await fetchLoop(fewer).catch(() => null);
        if (route) return { route, via: fewer };
      }
      throw e;
    }
  };
  // Départ en ville : éventail vers la campagne ; sinon (ou s'il n'y en a pas) cercle passant par le départ
  const fan = startBuilt ? await fanWaypoints(r.start, wantKm, costing, n).catch(() => []) : [];
  type Plan = { id: string; via: () => Promise<LatLng[] | null> };
  const plans: Plan[] = fan.length
    ? fan.map((f) => ({ id: f.id, via: async () => f.via(radiusM / radius0) }))
    : headings.map((h) => ({
        id: `loop-${Math.round(h)}`,
        via: () => placeWaypoints(r.start, loopWaypoints(r.start, h, radiusM, n), costing),
      }));
  for (let i = 0; i < Math.min(MAX_ROUTES, plans.length) && found.length < ENOUGH; i++) {
    const plan = plans[i];
    try {
      const planned = await plan.via();
      reached = true;
      if (!planned) continue; // que de la mer dans cette direction
      let { route, via } = await fetchLoopOrDrop(planned);
      if (crossesWater(route)) continue; // ferry ou traversée : rejetée, direction suivante
      // Culs-de-sac aux points de passage : point ramené à l'entrée, boucle recalculée
      const bases = via.map((p) => spurBase(route.points, p));
      if (bases.some(Boolean)) {
        const fixed = via.map((p, k) => bases[k] ?? p);
        const again = await fetchLoop(fixed).catch(() => null);
        if (again && !crossesWater(again)) {
          route = again;
          via = fixed;
        }
      }
      const { score, degPerKm } = curvature(route.points);
      // Correction de la taille d'après la durée / longueur obtenue (bornée pour rester stable) ;
      // éventail : longueur à peu près proportionnelle à la taille
      const ratio = want / Math.max(measure(route, score), 1);
      radiusM *= Math.min(1.6, Math.max(0.6, fan.length ? ratio : Math.sqrt(ratio)));
      const town = await urbanStats(route, costing);
      found.push({
        id: `${plan.id}-${i}`,
        route,
        via,
        score,
        degPerKm,
        overlap: overlapRatio(route.points),
        durationMin: loopDurationMin(route.distanceM, score),
        urban: town?.urban ?? null,
        exitKm: town?.exitKm ?? null,
      });
    } catch (e) {
      console.warn('Boucle impossible dans cette direction', e);
    } finally {
      onProgress?.(i + 1, MAX_ROUTES);
    }
  }
  onProgress?.(MAX_ROUTES, MAX_ROUTES);
  if (!found.length) {
    throw new Error(
      reached
        ? 'Pas de boucle possible depuis ce départ (mer ou routes trop rares autour). Essaie un autre lieu ou une autre durée.'
        : 'Impossible de calculer une boucle ici pour le moment (serveur d’itinéraires injoignable ?).',
    );
  }

  // Classement : d'abord la durée (ou longueur) demandée à ±35 %, puis le plaisir (sinuosité voulue,
  // moins la ville et les allers-retours). Plus de 20 % d'aller-retour : écartée s'il y a mieux.
  // Départ en ville : jusqu'à 60 % plus longue acceptée (sortir de la ville coûte des kilomètres)
  const fit = (l: Loop) => Math.abs(measure(l.route, l.score) - want) / want;
  const longest = startBuilt ? 1.6 : 1.35;
  const fits = (l: Loop) => {
    const m = measure(l.route, l.score);
    return m >= want * 0.65 && m <= want * longest;
  };
  const clean = found.filter((l) => l.overlap <= OVERLAP_MAX);
  const pool = clean.length ? clean : found;
  const ranked = pool.sort(
    (a, b) =>
      Number(fits(b)) - Number(fits(a)) ||
      (fits(a) ? plaisirScore(b, r.curviness) - plaisirScore(a, r.curviness) : fit(a) - fit(b)),
  );
  const distinct: Loop[] = [];
  for (const l of ranked) if (!distinct.some((d) => sameRoute(d.route, l.route))) distinct.push(l);
  return distinct.slice(0, 3);
}

export function curvinessLabel(score: number) {
  if (score >= 7) return 'Très sinueuse';
  if (score >= 4) return 'Sinueuse';
  return 'Tranquille';
}
