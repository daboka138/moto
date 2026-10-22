import { distanceM, type LatLng } from '@/lib/geo';
import { simplifyTrack, trackLengthM } from '@/lib/gpx';

// Routes plaisir (pur, testé par scripts/dev/roads-test.mjs) : portion choisie sur un tracé,
// simplification avant l'envoi, point du milieu (repère sur la carte), notes par critère.
// Aucune note de vitesse : virages, revêtement, paysage, trafic.

export type RoadCriteria = { curves: number; surface: number; scenery: number; traffic: number };
export type CriterionKey = keyof RoadCriteria;

export const ROAD_CRITERIA: { key: CriterionKey; label: string; hint: string }[] = [
  { key: 'curves', label: 'Virages', hint: '1 = ligne droite, 5 = ça tourne tout le temps' },
  { key: 'surface', label: 'Revêtement', hint: '1 = trous et gravillons, 5 = billard' },
  { key: 'scenery', label: 'Paysage', hint: '1 = rien à voir, 5 = à couper le souffle' },
  { key: 'traffic', label: 'Trafic', hint: '1 = chargé, 5 = route tranquille' },
];

/** Points gardés au plus pour le tracé envoyé au serveur (400 maximum côté base) */
export const ROAD_MAX_POINTS = 300;
/** Une route plaisir fait au moins 1 km */
export const ROAD_MIN_M = 1000;

/** Note d'un avis : moyenne arrondie des 4 critères (même calcul que le serveur) */
export const criteriaRating = (c: RoadCriteria) => Math.round((c.curves + c.surface + c.scenery + c.traffic) / 4);

export const criteriaComplete = (c: Partial<RoadCriteria>): c is RoadCriteria =>
  ROAD_CRITERIA.every(({ key }) => Number.isInteger(c[key]) && c[key]! >= 1 && c[key]! <= 5);

/** Moyenne de chaque critère sur les avis qui en ont (null = aucun avis noté par critère) */
export function averageCriteria(reviews: Partial<RoadCriteria>[]): RoadCriteria | null {
  const full = reviews.filter(criteriaComplete);
  if (!full.length) return null;
  const avg = (k: CriterionKey) => full.reduce((s, r) => s + r[k], 0) / full.length;
  return { curves: avg('curves'), surface: avg('surface'), scenery: avg('scenery'), traffic: avg('traffic') };
}

/** Indice du point du tracé le plus proche */
export function nearestIndex(line: LatLng[], p: LatLng): number {
  let best = 0;
  let bestD = Infinity;
  line.forEach((q, i) => {
    const d = distanceM(p, q);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Portion entre deux indices (dans l'ordre du tracé, quel que soit l'ordre des touchers) */
export function sliceLine<T extends LatLng>(line: T[], a: number, b: number): T[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  return line.slice(from, to + 1);
}

/** Point situé à la moitié de la longueur du tracé (repère de la route sur la carte) */
export function midpoint(line: LatLng[]): LatLng {
  if (line.length === 1) return line[0];
  const half = trackLengthM(line) / 2;
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const d = distanceM(line[i - 1], line[i]);
    if (acc + d >= half) {
      const t = d ? (half - acc) / d : 0;
      return {
        latitude: line[i - 1].latitude + (line[i].latitude - line[i - 1].latitude) * t,
        longitude: line[i - 1].longitude + (line[i].longitude - line[i - 1].longitude) * t,
      };
    }
    acc += d;
  }
  return line[line.length - 1];
}

/** Tracé prêt à l'envoi : simplifié, coordonnées arrondies à ~1 m, [[lat, lng], ...] */
export function encodeRoadLine(line: LatLng[]): [number, number][] {
  return simplifyTrack(line, ROAD_MAX_POINTS).map((p) => [Math.round(p.latitude * 1e5) / 1e5, Math.round(p.longitude * 1e5) / 1e5]);
}

export function decodeRoadLine(raw: unknown): LatLng[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const pts = raw
    .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([latitude, longitude]) => ({ latitude, longitude }));
  return pts.length >= 2 ? pts : null;
}

/** Classe de couleur sur la carte selon la note moyenne */
export function roadTier(rating: number | null): 'top' | 'good' | 'fair' | 'low' {
  if (rating === null) return 'low';
  if (rating >= 4.5) return 'top';
  if (rating >= 3.5) return 'good';
  if (rating >= 2.5) return 'fair';
  return 'low';
}

/** Top routes : meilleure note d'abord, puis la plus notée, puis la plus proche */
export function rankRoads<T extends { rating: number | null; reviewsCount: number; distanceM: number }>(roads: T[]): T[] {
  return [...roads].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewsCount - a.reviewsCount || a.distanceM - b.distanceM,
  );
}
