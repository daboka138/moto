import { supabase } from '@/lib/supabase';

// Positions en direct. Supabase ne renvoie QUE les positions que l'utilisateur
// a le droit de voir (policy RLS + can_view_location) : aucun filtre de
// confidentialité n'est fait ici.

export type LivePositionInput = {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  heading: number | null;
  accuracy: number | null;
};

export type LiveRider = {
  userId: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  updatedAt: string;
  username: string;
  avatarPath: string;
  moto: { brand: string; model: string; displacement_cc: number | null } | null;
};

/** Positions plus anciennes ignorées (appli fermée, plus de réseau...) */
const STALE_AFTER_MS = 15 * 60 * 1000;

export async function publishPosition(userId: string, p: LivePositionInput) {
  const { error } = await supabase.from('live_positions').upsert({
    user_id: userId,
    latitude: p.latitude,
    longitude: p.longitude,
    speed_kmh: p.speedKmh,
    heading: p.heading,
    accuracy_m: p.accuracy,
  });
  if (error) throw error;
}

export async function clearMyPosition(userId: string) {
  const { error } = await supabase.from('live_positions').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function isInActiveGroupRide(): Promise<boolean> {
  const { data, error } = await supabase.rpc('in_active_group_ride');
  if (error) throw error;
  return data === true;
}

type Row = {
  user_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  updated_at: string;
  profile: {
    username: string;
    avatar_path: string;
    motorcycles: { brand: string; model: string; displacement_cc: number | null }[];
  } | null;
};

export async function fetchVisibleRiders(userId: string): Promise<LiveRider[]> {
  const since = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from('live_positions')
    .select(
      'user_id, latitude, longitude, speed_kmh, updated_at, profile:profiles(username, avatar_path, motorcycles(brand, model, displacement_cc))',
    )
    .neq('user_id', userId)
    .gt('updated_at', since);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.profile)
    .map((r) => ({
      userId: r.user_id,
      latitude: r.latitude,
      longitude: r.longitude,
      speedKmh: r.speed_kmh,
      updatedAt: r.updated_at,
      username: r.profile!.username,
      avatarPath: r.profile!.avatar_path,
      moto: r.profile!.motorcycles[0] ?? null,
    }));
}
