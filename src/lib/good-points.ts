import 'expo-sqlite/localStorage/install';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { DRIVING_LOCK_SPEED_KMH } from '@/lib/driving-lock';
import { distanceM, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

// Points de bon comportement (opt-in, désactivé par défaut, score privé par défaut).
// Les points sont écrits par le serveur uniquement (award_points) : danger confirmé, balade,
// convoi, regroupement et spot y sont calculés ; seuls les km propres et le « trajet sans
// téléphone » sont mesurés ici, pendant la navigation, puis envoyés (plafonnés côté serveur).
// JAMAIS de points liés à la vitesse ou au temps de parcours. Niveaux et badges calculés ici
// à partir des compteurs.

export type PointKind =
  | 'clean_km'
  | 'phone_free'
  | 'danger_confirmed'
  | 'danger_confirm'
  | 'ride_organized'
  | 'convoy_done'
  | 'regroup'
  | 'spot_rated'
  | 'challenge'
  | 'referral';

export const POINT_KINDS: Record<PointKind, { emoji: string; label: string; rule: string }> = {
  clean_km: { emoji: '🛡️', label: 'Km propres', rule: '1 point / 10 km roulés en navigation sans dépasser la limitation connue (40 par jour au plus)' },
  phone_free: { emoji: '📵', label: 'Trajet sans téléphone', rule: '5 points pour un trajet de 5 km ou plus sans toucher l’écran en roulant' },
  danger_confirmed: { emoji: '⚠️', label: 'Danger confirmé', rule: '10 points quand un autre motard confirme ton signalement' },
  danger_confirm: { emoji: '🤝', label: 'Danger confirmé pour les autres', rule: '2 points quand tu confirmes un danger signalé par un autre (5 par jour)' },
  ride_organized: { emoji: '🗓️', label: 'Balade organisée', rule: '20 points pour une balade terminée avec au moins 2 participants présents' },
  convoy_done: { emoji: '🚩', label: 'Convoi mené', rule: '15 points pour l’ouvreur et le serre-file d’une balade menée jusqu’au bout' },
  regroup: { emoji: '🧲', label: 'Regroupement', rule: '5 points quand tu rejoins le point de regroupement' },
  spot_rated: { emoji: '☕', label: 'Spot bien noté', rule: '15 points quand ton spot reçoit au moins 2 avis d’autres membres, moyenne 4 ★ ou plus' },
  challenge: { emoji: '🎯', label: 'Défi du mois', rule: 'Bonus quand le défi du mois est réussi' },
  referral: { emoji: '📨', label: 'Pote parrainé', rule: '30 points quand un pote inscrit avec ton invitation termine son profil et fait une 1re action (10 par mois)' },
};

export type Counters = Partial<Record<PointKind, number>>;

export type GoodPointsSettings = {
  enabled: boolean;
  showOnProfile: boolean;
  friendsRanking: boolean;
  departmentRanking: boolean;
  department: string | null;
};

export type MonthlyChallenge = {
  month: string;
  emoji: string;
  title: string;
  description: string | null;
  metric: PointKind | 'points';
  goal: number;
  bonus: number;
  progress: number;
  done: boolean;
};

export type PointEvent = { kind: PointKind; points: number; qty: number; at: string };

export type MyGoodPoints = {
  settings: GoodPointsSettings;
  total: number;
  month: number;
  today: number;
  dailyCap: number;
  counters: Counters;
  challenge: MonthlyChallenge | null;
  history: PointEvent[];
};

// ---------- Niveaux ----------

export type Level = { id: string; emoji: string; label: string; min: number };

export const LEVELS: Level[] = [
  { id: 'apprenti', emoji: '🔰', label: 'Apprenti', min: 0 },
  { id: 'motard', emoji: '🏍️', label: 'Motard', min: 150 },
  { id: 'road_captain', emoji: '🧭', label: 'Road Captain', min: 750 },
  { id: 'legende', emoji: '👑', label: 'Légende', min: 3000 },
];

export function levelOf(total: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && total >= LEVELS[i + 1].min) i++;
  const level = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const progress = next ? (total - level.min) / (next.min - level.min) : 1;
  return { level, next, progress: Math.max(0, Math.min(1, progress)) };
}

// ---------- Badges (17) ----------

export type GoodBadge = { id: string; emoji: string; label: string; description: string; kind: PointKind; goal: number };

export const GOOD_BADGES: GoodBadge[] = [
  { id: 'clean-100', emoji: '🛡️', label: 'Conduite propre', description: '100 km propres', kind: 'clean_km', goal: 100 },
  { id: 'clean-1000', emoji: '🛡️', label: 'Mille bornes propres', description: '1 000 km propres', kind: 'clean_km', goal: 1000 },
  { id: 'clean-5000', emoji: '🏅', label: 'Exemplaire', description: '5 000 km propres', kind: 'clean_km', goal: 5000 },
  { id: 'phone-10', emoji: '📵', label: 'Mains sur le guidon', description: '10 trajets sans téléphone', kind: 'phone_free', goal: 10 },
  { id: 'phone-50', emoji: '📵', label: 'Zéro distraction', description: '50 trajets sans téléphone', kind: 'phone_free', goal: 50 },
  { id: 'danger-1', emoji: '⚠️', label: 'Vigie', description: 'Premier danger confirmé par un autre motard', kind: 'danger_confirmed', goal: 1 },
  { id: 'danger-10', emoji: '🚨', label: 'Œil de lynx', description: '10 dangers confirmés', kind: 'danger_confirmed', goal: 10 },
  { id: 'confirm-10', emoji: '🤝', label: 'Entraide', description: '10 dangers confirmés pour les autres', kind: 'danger_confirm', goal: 10 },
  { id: 'convoy-1', emoji: '🏍️', label: 'Premier convoi', description: 'Premier convoi mené jusqu’au bout', kind: 'convoy_done', goal: 1 },
  { id: 'convoy-5', emoji: '🚩', label: 'Ouvreur confirmé', description: '5 convois menés', kind: 'convoy_done', goal: 5 },
  { id: 'ride-1', emoji: '🗓️', label: 'Rassembleur', description: 'Première balade organisée avec 2 participants', kind: 'ride_organized', goal: 1 },
  { id: 'ride-5', emoji: '👥', label: 'Chef de meute', description: '5 balades organisées', kind: 'ride_organized', goal: 5 },
  { id: 'regroup-5', emoji: '🧲', label: 'Toujours au regroupement', description: '5 regroupements rejoints', kind: 'regroup', goal: 5 },
  { id: 'spot-1', emoji: '☕', label: 'Dénicheur', description: 'Premier spot bien noté', kind: 'spot_rated', goal: 1 },
  { id: 'spot-10', emoji: '🗺️', label: 'Guide local', description: '10 spots bien notés', kind: 'spot_rated', goal: 10 },
  { id: 'referral-3', emoji: '📨', label: 'Recruteur', description: '3 potes parrainés', kind: 'referral', goal: 3 },
  { id: 'referral-10', emoji: '🎖️', label: 'Ambassadeur', description: '10 potes parrainés', kind: 'referral', goal: 10 },
];

export type GoodBadgeProgress = GoodBadge & { value: number; unlocked: boolean };

export function goodBadges(counters: Counters): GoodBadgeProgress[] {
  return GOOD_BADGES.map((b) => {
    const value = Number(counters[b.kind] ?? 0);
    return { ...b, value, unlocked: value >= b.goal };
  });
}

// ---------- Serveur ----------

type Raw = {
  settings: { enabled: boolean; show_on_profile: boolean; friends_ranking: boolean; department_ranking: boolean; department: string | null };
  total: number;
  month: number;
  today: number;
  daily_cap: number;
  counters: Record<string, number | string>;
  challenge: (Omit<MonthlyChallenge, 'progress'> & { progress: number | string }) | null;
  history: { kind: PointKind; points: number; qty: number | string; at: string }[];
};

const toCounters = (raw: Record<string, number | string> | null | undefined): Counters =>
  Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, Number(v)])) as Counters;

export async function fetchMyGoodPoints(): Promise<MyGoodPoints> {
  const { data, error } = await supabase.rpc('my_good_points');
  if (error) throw new Error(error.message);
  const r = data as Raw;
  const settings: GoodPointsSettings = {
    enabled: r.settings.enabled,
    showOnProfile: r.settings.show_on_profile,
    friendsRanking: r.settings.friends_ranking,
    departmentRanking: r.settings.department_ranking,
    department: r.settings.department,
  };
  setEnabledCache(settings.enabled);
  return {
    settings,
    total: Number(r.total),
    month: Number(r.month),
    today: Number(r.today),
    dailyCap: r.daily_cap,
    counters: toCounters(r.counters),
    challenge: r.challenge ? { ...r.challenge, progress: Number(r.challenge.progress) } : null,
    history: r.history.map((h) => ({ ...h, qty: Number(h.qty) })),
  };
}

export async function saveGoodPointsSettings(s: GoodPointsSettings) {
  const { error } = await supabase.rpc('set_good_points_settings', {
    p_enabled: s.enabled,
    p_show_on_profile: s.showOnProfile,
    p_friends_ranking: s.friendsRanking,
    p_department_ranking: s.departmentRanking,
    p_department: s.department?.trim().toUpperCase() || null,
  });
  if (error) throw new Error(error.message);
  setEnabledCache(s.enabled);
}

/** Efface tout mon historique de points (les réglages restent) */
export async function resetGoodPoints() {
  const { error } = await supabase.rpc('reset_good_points');
  if (error) throw new Error(error.message);
  writeSeen([]);
}

export type RiderGoodPoints = { total: number; counters: Counters; visible: boolean };

/** Niveau et badges d'un motard (null s'il ne les montre pas sur son profil) */
export async function fetchRiderGoodPoints(userId: string): Promise<RiderGoodPoints | null> {
  const { data, error } = await supabase.rpc('rider_good_points', { p_user: userId });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as { total: number; counters: Record<string, number | string>; visible: boolean };
  return { total: Number(r.total), counters: toCounters(r.counters), visible: r.visible };
}

export type RankingRow = { userId: string; username: string; avatarPath: string; points: number; isMe: boolean };

export async function fetchRanking(scope: 'friends' | 'department'): Promise<RankingRow[]> {
  const { data, error } = await supabase.rpc('good_points_ranking', { p_scope: scope });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string; username: string; avatar_path: string; points: number; is_me: boolean }[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    avatarPath: r.avatar_path,
    points: r.points,
    isMe: r.is_me,
  }));
}

/** Fin d'une navigation : km propres + trajet sans téléphone. Renvoie les points gagnés. */
export async function recordTripPoints(tripId: string, km: number, cleanKm: number, phoneFree: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('record_trip_points', {
    p_trip: tripId,
    p_km: Math.round(km * 10) / 10,
    p_clean_km: Math.round(cleanKm * 10) / 10,
    p_phone_free: phoneFree,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ---------- Activé ? (mémorisé sur le téléphone pour la navigation) ----------

const ENABLED_KEY = 'moto.goodPoints.enabled';
let enabledCache = (() => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
})();
const enabledListeners = new Set<() => void>();

function setEnabledCache(on: boolean) {
  if (on === enabledCache) return;
  enabledCache = on;
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    // pas grave
  }
  enabledListeners.forEach((l) => l());
}

/** Points activés sur ce compte (dernière valeur connue) */
export function useGoodPointsEnabled() {
  return useSyncExternalStore(
    (l) => {
      enabledListeners.add(l);
      return () => {
        enabledListeners.delete(l);
      };
    },
    () => enabledCache,
  );
}

/** Au changement de compte : relit le réglage sur le serveur */
export function useGoodPointsSync(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('good_points_settings')
      .select('enabled')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setEnabledCache(data?.enabled === true));
  }, [userId]);
}

// ---------- Nouveau badge : petite animation (components/good-points.tsx) ----------

const SEEN_KEY = 'moto.goodPoints.seenBadges';

function readSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // pas grave : le badge sera fêté une fois de plus
  }
}

/** Badge à fêter (bon comportement ou badges de motard, lib/badges.ts) */
export type CelebratedBadge = { id: string; emoji: string; label: string; description: string };

let celebrations: CelebratedBadge[] = [];
const celebrationListeners = new Set<() => void>();

export function useBadgeCelebrations() {
  return useSyncExternalStore(
    (l) => {
      celebrationListeners.add(l);
      return () => {
        celebrationListeners.delete(l);
      };
    },
    () => celebrations,
  );
}

/** Ajoute des badges à fêter (animation BadgeCelebrationHost, un à la fois) */
export function celebrateBadges(list: CelebratedBadge[]) {
  celebrations = [...celebrations, ...list];
  celebrationListeners.forEach((l) => l());
}

export function dismissCelebration() {
  celebrations = celebrations.slice(1);
  celebrationListeners.forEach((l) => l());
}

/** Compare les badges obtenus avec ceux déjà fêtés sur ce téléphone */
export function checkNewBadges(counters: Counters): GoodBadge[] {
  const unlocked = goodBadges(counters).filter((b) => b.unlocked);
  const seen = readSeen();
  writeSeen(unlocked.map((b) => b.id));
  // Première fois sur ce téléphone (réinstallation…) : rien à fêter, on mémorise
  if (seen === null && unlocked.length > 0) return [];
  const fresh = unlocked.filter((b) => !(seen ?? []).includes(b.id));
  if (!fresh.length) return [];
  celebrateBadges(fresh);
  return fresh;
}

/** Après un gain de points : relit les compteurs, fête et renvoie les nouveaux badges */
export async function refreshBadgesAfterGain() {
  const mine = await fetchMyGoodPoints();
  return checkNewBadges(mine.counters);
}

/** À l'activation : on part d'une liste vide (le premier badge sera fêté) */
export function initSeenBadges(counters: Counters) {
  if (readSeen() === null) writeSeen(goodBadges(counters).filter((b) => b.unlocked).map((b) => b.id));
}

// ---------- Mesure pendant la navigation ----------

/** Tolérance du compteur GPS avant de considérer un dépassement */
const MARGIN_KMH = 3;
/** Saut GPS : distance ignorée */
const MAX_JUMP_M = 2000;

/**
 * Km propres (pas au-dessus d'une limitation CONNUE) et manipulation du téléphone en roulant
 * (écran touché ou app quittée au-dessus de 10 km/h). Remis à zéro au début de chaque navigation.
 */
export function useGoodDrivingTracker(active: boolean, position: LatLng | null, kmh: number, speedLimit: number | null) {
  const data = useRef({ cleanM: 0, overM: 0, touches: 0, left: false });
  const last = useRef<LatLng | null>(null);
  const speed = useRef(0);

  useEffect(() => {
    speed.current = kmh;
  }, [kmh]);

  useEffect(() => {
    if (!active) return;
    data.current = { cleanM: 0, overM: 0, touches: 0, left: false };
    last.current = null;
  }, [active]);

  useEffect(() => {
    if (!active || !position) return;
    const prev = last.current;
    last.current = { latitude: position.latitude, longitude: position.longitude };
    if (!prev) return;
    const d = distanceM(prev, position);
    if (d > MAX_JUMP_M) return;
    if (speedLimit !== null && kmh > speedLimit + MARGIN_KMH) data.current.overM += d;
    else data.current.cleanM += d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, position?.latitude, position?.longitude]);

  // App quittée (autre appli, écran d'accueil) en roulant
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && speed.current > DRIVING_LOCK_SPEED_KMH) data.current.left = true;
    });
    return () => sub.remove();
  }, [active]);

  /** À brancher sur onTouchStart de l'écran de la carte */
  const onTouch = useCallback(() => {
    if (active && speed.current > DRIVING_LOCK_SPEED_KMH) data.current.touches += 1;
  }, [active]);

  const snapshot = useCallback(
    () => ({ cleanKm: data.current.cleanM / 1000, phoneFree: data.current.touches === 0 && !data.current.left }),
    [],
  );

  return { onTouch, snapshot };
}
