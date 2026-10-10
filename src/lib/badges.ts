import { Platform } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

// Badges et défis. Les statistiques (rider_stats) sont tenues par le serveur : km et cols
// envoyés à la fin de chaque navigation (record_trip), balades comptées quand elles se terminent.
// Les badges et défis sont calculés ici à partir de ces totaux (publics, sur le profil).

export type RiderStats = {
  totalKm: number;
  trips: number;
  ridesDone: number;
  passesCount: number;
  /** Mois des compteurs mensuels (AAAA-MM) */
  month: string;
  monthKm: number;
  monthRides: number;
  monthPasses: number;
  weekStreak: number;
  bestWeekStreak: number;
  activeWeeks: number;
  /** Lundi de la dernière semaine active (AAAA-MM-JJ) */
  lastWeek: string | null;
};

export const EMPTY_STATS: RiderStats = {
  totalKm: 0,
  trips: 0,
  ridesDone: 0,
  passesCount: 0,
  month: '',
  monthKm: 0,
  monthRides: 0,
  monthPasses: 0,
  weekStreak: 0,
  bestWeekStreak: 0,
  activeWeeks: 0,
  lastWeek: null,
};

type Row = {
  total_km: number | string;
  trips: number;
  rides_done: number;
  passes_count: number;
  month: string;
  month_km: number | string;
  month_rides: number;
  month_passes: number;
  week_streak: number;
  best_week_streak: number;
  active_weeks: number;
  last_week: string | null;
};

export async function fetchRiderStats(userId: string): Promise<RiderStats> {
  const { data, error } = await supabase.from('rider_stats').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return EMPTY_STATS;
  const r = data as Row;
  return {
    totalKm: Number(r.total_km),
    trips: r.trips,
    ridesDone: r.rides_done,
    passesCount: r.passes_count,
    month: r.month,
    monthKm: Number(r.month_km),
    monthRides: r.month_rides,
    monthPasses: r.month_passes,
    weekStreak: r.week_streak,
    bestWeekStreak: r.best_week_streak,
    activeWeeks: r.active_weeks,
    lastWeek: r.last_week,
  };
}

export type RiderPass = { osmId: number; name: string; elevationM: number | null; firstAt: string };

/** Mes cols franchis (privés) */
export async function fetchMyPasses(): Promise<RiderPass[]> {
  const { data, error } = await supabase.from('rider_passes').select('*').order('first_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ osmId: r.osm_id, name: r.name, elevationM: r.elevation_m, firstAt: r.first_at }));
}

// ---------- Badges ----------

export type BadgeFamily = 'km' | 'rides' | 'passes' | 'streak';

export type Badge = {
  id: string;
  family: BadgeFamily;
  emoji: string;
  label: string;
  description: string;
  /** Seuil à atteindre */
  goal: number;
};

const tiers = (family: BadgeFamily, emoji: string, steps: [number, string][], unit: (n: number) => string): Badge[] =>
  steps.map(([goal, label]) => ({ id: `${family}-${goal}`, family, emoji, label, description: unit(goal), goal }));

export const BADGES: Badge[] = [
  ...tiers('km', '🛣️', [[100, 'Premiers tours de roue'], [1000, 'Mille bornes'], [5000, 'Grand rouleur'], [10000, 'Bouffeur de bitume'], [25000, 'Tour du monde en vue']], (n) => `${n.toLocaleString('fr-FR')} km parcourus en navigation`),
  ...tiers('rides', '🏍️', [[1, 'Première balade'], [5, 'Habitué du groupe'], [10, 'Pilier des sorties'], [25, 'Capitaine de route'], [50, 'Légende des balades']], (n) => `${n} balade${n > 1 ? 's' : ''} terminée${n > 1 ? 's' : ''}`),
  ...tiers('passes', '⛰️', [[1, 'Premier col'], [5, 'Grimpeur'], [10, 'Chasseur de cols'], [25, 'Roi de la montagne']], (n) => `${n} col${n > 1 ? 's' : ''} franchi${n > 1 ? 's' : ''}`),
  ...tiers('streak', '🔥', [[4, 'Régulier'], [12, 'Fidèle au guidon'], [26, 'Toute l’année']], (n) => `${n} semaines d’affilée avec au moins une sortie`),
];

function valueOf(s: RiderStats, family: BadgeFamily) {
  switch (family) {
    case 'km':
      return s.totalKm;
    case 'rides':
      return s.ridesDone;
    case 'passes':
      return s.passesCount;
    case 'streak':
      return s.bestWeekStreak;
  }
}

export type BadgeProgress = Badge & { value: number; unlocked: boolean };

export function badgeProgress(s: RiderStats): BadgeProgress[] {
  return BADGES.map((b) => {
    const value = valueOf(s, b.family);
    return { ...b, value, unlocked: value >= b.goal };
  });
}

export const unlockedBadges = (s: RiderStats) => badgeProgress(s).filter((b) => b.unlocked);

// ---------- Défis du mois ----------

export type Challenge = { id: string; emoji: string; label: string; value: number; goal: number; unit: string; done: boolean };

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Lundi de la semaine en cours (AAAA-MM-JJ, heure locale) */
function thisMonday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthlyChallenges(s: RiderStats): Challenge[] {
  // Compteurs d'un mois précédent : remis à zéro (le serveur le fait à la prochaine sortie)
  const same = s.month === currentMonth();
  const km = same ? s.monthKm : 0;
  const rides = same ? s.monthRides : 0;
  const passes = same ? s.monthPasses : 0;
  // Série en cours : vivante si la dernière semaine active est celle-ci ou la précédente
  const monday = thisMonday();
  const last = s.lastWeek;
  const prev = new Date(`${monday}T12:00:00`);
  prev.setDate(prev.getDate() - 7);
  const prevIso = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  const streak = last === monday || last === prevIso ? s.weekStreak : 0;
  const list: Omit<Challenge, 'done'>[] = [
    { id: 'month-km', emoji: '🛣️', label: '300 km ce mois-ci', value: Math.round(km), goal: 300, unit: 'km' },
    { id: 'month-rides', emoji: '🏍️', label: '2 balades ce mois-ci', value: rides, goal: 2, unit: 'balades' },
    { id: 'month-pass', emoji: '⛰️', label: 'Un nouveau col ce mois-ci', value: passes, goal: 1, unit: 'col' },
    { id: 'streak', emoji: '🔥', label: '4 semaines d’affilée', value: streak, goal: 4, unit: 'semaines' },
  ];
  return list.map((c) => ({ ...c, value: Math.min(c.value, c.goal), done: c.value >= c.goal }));
}

// ---------- Fin de trajet : km + cols franchis ----------

type Pass = { id: number; name: string; lat: number; lng: number; ele: number | null };

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
/** Un col compte si le tracé passe à moins de 150 m */
const PASS_RADIUS_M = 150;
const SAMPLE_M = 300;
const MAX_SAMPLES = 400;

/** Cols (mountain_pass OpenStreetMap) le long d'une trace GPS ; null si Overpass ne répond pas */
export async function passesAlong(track: LatLng[]): Promise<Pass[] | null> {
  if (track.length < 2) return [];
  const samples: LatLng[] = [track[0]];
  for (const p of track) if (distanceM(samples[samples.length - 1], p) >= SAMPLE_M) samples.push(p);
  samples.push(track[track.length - 1]);
  const step = Math.ceil(samples.length / MAX_SAMPLES);
  const coords = samples
    .filter((_, i) => i % step === 0)
    .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
    .join(',');
  const query = `[out:json][timeout:25];node["mountain_pass"="yes"](around:${PASS_RADIUS_M},${coords});out 40;`;
  for (const server of OVERPASS) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(Platform.OS === 'web' ? {} : { 'User-Agent': 'PasseRyder/1.0 (https://passeryder.fr)' }),
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) continue;
      // Serveur saturé : réponse HTML au lieu du JSON
      const json = (await res.json()) as { elements?: { id: number; lat: number; lon: number; tags?: Record<string, string> }[] };
      if (!json.elements) continue;
      return json.elements.map((e) => ({
        id: e.id,
        name: e.tags?.name ?? 'Col',
        lat: e.lat,
        lng: e.lon,
        // « 1 250 m », « 1250 » : on ne garde que le nombre
        ele: Number.isFinite(parseFloat(e.tags?.ele ?? '')) ? Math.round(parseFloat(e.tags!.ele!.replace(',', '.'))) : null,
      }));
    } catch {
      // serveur suivant
    }
  }
  return null;
}

// Traces dont les cols n'ont pas pu être cherchés (Overpass saturé) : nouvel essai plus tard
const PENDING_KEY = 'moto.pendingPasses';

function readPending(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writePending(ids: string[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ids.slice(-20)));
  } catch {
    // pas grave
  }
}

/**
 * Envoie le trajet terminé aux statistiques ; renvoie les nouveaux cols franchis.
 * Les km partent tout de suite ; si la recherche des cols échoue, elle sera refaite plus tard.
 */
export async function recordTrip(km: number, track: LatLng[] | null, tripId?: string): Promise<number> {
  const passes = track ? await passesAlong(track).catch(() => null) : [];
  if (passes === null && tripId) writePending([...readPending().filter((x) => x !== tripId), tripId]);
  const { data, error } = await supabase.rpc('record_trip', { p_km: Math.round(km * 10) / 10, p_passes: passes ?? [] });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Nouvel essai pour les cols des trajets en attente (readTrack : trace gardée sur le téléphone) */
export async function retryPendingPasses(readTrack: (id: string) => LatLng[] | null): Promise<number> {
  const pending = readPending();
  if (!pending.length) return 0;
  let added = 0;
  const left: string[] = [];
  for (const id of pending) {
    const track = readTrack(id);
    if (!track) continue;
    const passes = await passesAlong(track).catch(() => null);
    if (passes === null) {
      left.push(id);
      continue;
    }
    if (passes.length) {
      const { data, error } = await supabase.rpc('record_trip', { p_km: 0, p_passes: passes });
      if (error) {
        left.push(id);
        continue;
      }
      added += (data as number) ?? 0;
    }
  }
  writePending(left);
  return added;
}
