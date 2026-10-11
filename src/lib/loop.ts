import { distanceM, type LatLng } from '@/lib/geo';
import { bearingDeg, fetchValhalla, sameRoute, type NavRoute } from '@/lib/navigation';
import type { RouteOptions } from '@/lib/moto';

// « Fais-moi une boucle » : 2-3 boucles au départ de ma position, avec le moteur d'itinéraire
// déjà en place (Valhalla, serveur OpenStreetMap). Méthode : quelques points de passage posés
// sur un cercle qui part de ma position (rayon choisi d'après la longueur voulue), dans des
// directions différentes ; chaque boucle reçoit un score de sinuosité calculé sur sa géométrie
// (virages par km). Requêtes une par une, pour rester raisonnable avec le serveur public.

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
const CANDIDATES = 5;
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
  // Très sinueux : un point de plus (la boucle serpente davantage)
  const n = r.curviness === 'very' ? 4 : 3;
  let radiusM = (wantKm * 1000) / (2 * Math.PI * ROAD_FACTOR);
  const first = Math.random() * 360;
  const found: Loop[] = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const heading = (first + (i * 360) / CANDIDATES + (Math.random() - 0.5) * 30) % 360;
    const via = loopWaypoints(r.start, heading, radiusM, n);
    try {
      const route = await fetchValhalla([r.start, ...via, r.start], options);
      const { score, degPerKm } = curvature(route.points);
      // Correction du rayon d'après la durée / longueur obtenue (bornée pour rester stable)
      const ratio = want / Math.max(measure(route, score), 1);
      radiusM *= Math.min(1.6, Math.max(0.6, Math.sqrt(ratio)));
      found.push({
        id: `loop-${i}-${Math.round(heading)}`,
        route,
        via,
        score,
        degPerKm,
        overlap: overlapRatio(route.points),
        durationMin: loopDurationMin(route.distanceM, score),
      });
    } catch (e) {
      console.warn('Boucle impossible dans cette direction', e);
    }
    onProgress?.(i + 1, CANDIDATES);
  }
  if (!found.length) throw new Error('Impossible de calculer une boucle ici pour le moment (serveur d’itinéraires injoignable ?).');

  // Durée / longueur à ±35 % de la demande, sinon on garde les plus proches
  const fit = (l: Loop) => Math.abs(measure(l.route, l.score) - want) / want;
  let pool = found.filter((l) => fit(l) <= 0.35 && l.overlap < 0.35);
  if (pool.length < 2) pool = [...found].sort((a, b) => fit(a) - fit(b)).slice(0, 3);
  // Tranquille : peu de virages d'abord ; sinueux / très sinueux : les plus tortueuses d'abord
  const ranked = pool.sort((a, b) => (r.curviness === 'calm' ? a.score - b.score : b.score - a.score) + (a.overlap - b.overlap) * 5);
  const distinct: Loop[] = [];
  for (const l of ranked) if (!distinct.some((d) => sameRoute(d.route, l.route))) distinct.push(l);
  return distinct.slice(0, 3);
}

export function curvinessLabel(score: number) {
  if (score >= 7) return 'Très sinueuse';
  if (score >= 4) return 'Sinueuse';
  return 'Tranquille';
}
