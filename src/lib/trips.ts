import { useSyncExternalStore } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';

// Trajets faits en navigation : statistiques enregistrées pendant le guidage, puis résumé
// gardé dans « Mes trajets » (Profil). L'historique reste sur le téléphone, jamais envoyé.

export type TripSummary = {
  id: string;
  /** Destination visée */
  destination: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  /** Durée totale, arrêts compris (s) */
  durationS: number;
  /** Vitesse moyenne en roulant (arrêts exclus), km/h */
  avgKmh: number;
  maxKmh: number;
  /** Arrivé à destination (sinon navigation arrêtée en route) */
  arrived: boolean;
  /** Trace GPS gardée (export GPX) */
  hasTrack?: boolean;
};

/** Mesures en cours, sauvegardées avec la navigation (reprise après redémarrage de l'app) */
export type TripStats = {
  startedAt: number;
  distanceM: number;
  movingS: number;
  maxKmh: number;
  last: (LatLng & { at: number }) | null;
  /** Trace GPS : [lat, lng, horodatage ms], un point tous les 25 m environ */
  track?: [number, number, number][];
};

/** Au-delà, la mesure GPS est trop imprécise pour compter dans la distance */
const MAX_ACCURACY_M = 30;
/** Un saut plus grand (coupure GPS, reprise) n'est pas compté */
const MAX_JUMP_M = 2000;
/** En dessous de 5 km/h, on est à l'arrêt (le temps ne compte pas dans la moyenne) */
const MOVING_KMH = 5;
/** Vitesse GPS aberrante */
const MAX_PLAUSIBLE_KMH = 300;
/** Trajet trop court pour être gardé */
const MIN_SAVED_M = 300;
/** Trace : un point tous les 25 m, 6000 points au plus (au-delà, un point sur deux est retiré) */
const TRACK_STEP_M = 25;
const MAX_TRACK_POINTS = 6000;

export function newTripStats(): TripStats {
  return { startedAt: Date.now(), distanceM: 0, movingS: 0, maxKmh: 0, last: null, track: [] };
}

/** Ajoute une position GPS aux mesures (renvoie de nouvelles mesures) */
export function recordFix(s: TripStats, p: LatLng & { accuracy: number | null }, kmh: number, now = Date.now()): TripStats {
  if (p.accuracy != null && p.accuracy > MAX_ACCURACY_M) return s;
  const maxKmh = kmh <= MAX_PLAUSIBLE_KMH ? Math.max(s.maxKmh, kmh) : s.maxKmh;
  const point = { latitude: p.latitude, longitude: p.longitude, at: now };
  addTrackPoint(s, point);
  if (!s.last) return { ...s, maxKmh, last: point };
  const d = distanceM(s.last, p);
  // Petits déplacements : on attend d'avoir bougé (le bruit GPS gonflerait la distance)
  if (d < 5) return maxKmh === s.maxKmh ? s : { ...s, maxKmh };
  const dt = (now - s.last.at) / 1000;
  const moving = kmh >= MOVING_KMH || (dt > 0 && (d / dt) * 3.6 >= MOVING_KMH);
  return {
    ...s,
    maxKmh,
    distanceM: s.distanceM + (d <= MAX_JUMP_M ? d : 0),
    movingS: s.movingS + (moving && dt < 60 ? dt : 0),
    last: point,
  };
}

/** Ajoute le point à la trace (tableau partagé, modifié sur place : pas de copie à chaque position) */
function addTrackPoint(s: TripStats, p: LatLng & { at: number }) {
  if (!s.track) s.track = [];
  const last = s.track[s.track.length - 1];
  if (last && distanceM({ latitude: last[0], longitude: last[1] }, p) < TRACK_STEP_M) return;
  s.track.push([Math.round(p.latitude * 1e6) / 1e6, Math.round(p.longitude * 1e6) / 1e6, p.at]);
  if (s.track.length > MAX_TRACK_POINTS) s.track = s.track.filter((_, i) => i % 2 === 0 || i === s.track!.length - 1);
}

export function summarize(s: TripStats, destination: string, arrived: boolean, now = Date.now()): TripSummary {
  return {
    id: `${s.startedAt}`,
    destination,
    startedAt: new Date(s.startedAt).toISOString(),
    endedAt: new Date(now).toISOString(),
    distanceM: Math.round(s.distanceM),
    durationS: Math.round((now - s.startedAt) / 1000),
    avgKmh: s.movingS > 0 ? Math.round((s.distanceM / s.movingS) * 3.6) : 0,
    maxKmh: Math.round(s.maxKmh),
    arrived,
    hasTrack: (s.track?.length ?? 0) >= 2,
  };
}

// ---------- Historique « Mes trajets » ----------

const KEY = 'moto.trips';
const MAX_TRIPS = 200;

function read(): TripSummary[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

let trips = read();
const listeners = new Set<() => void>();

function write(next: TripSummary[]) {
  trips = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // pas grave : gardé pour cette session
  }
  listeners.forEach((l) => l());
}

const trackKey = (id: string) => `moto.track.${id}`;

/** Garde le trajet s'il est assez long (et sa trace GPS à part) ; renvoie true s'il est enregistré */
export function saveTrip(t: TripSummary, track?: TripStats['track']) {
  if (t.distanceM < MIN_SAVED_M) return false;
  const next = [t, ...trips.filter((x) => x.id !== t.id)];
  next.slice(MAX_TRIPS).forEach((old) => removeTrack(old.id));
  if (track && track.length >= 2) {
    try {
      localStorage.setItem(trackKey(t.id), JSON.stringify(track));
    } catch {
      t.hasTrack = false;
    }
  }
  write(next.slice(0, MAX_TRIPS));
  return true;
}

/** Trace GPS d'un trajet (null si non gardée) */
export function readTrack(id: string): { latitude: number; longitude: number; time: number }[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(trackKey(id)) ?? 'null') as [number, number, number][] | null;
    return raw ? raw.map(([latitude, longitude, time]) => ({ latitude, longitude, time })) : null;
  } catch {
    return null;
  }
}

function removeTrack(id: string) {
  try {
    localStorage.removeItem(trackKey(id));
  } catch {
    // pas grave
  }
}

export function deleteTrip(id: string) {
  removeTrack(id);
  write(trips.filter((t) => t.id !== id));
}

export function clearTrips() {
  trips.forEach((t) => removeTrack(t.id));
  write([]);
}

export function useTrips() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => trips,
  );
}
