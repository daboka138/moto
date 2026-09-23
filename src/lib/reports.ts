import type { LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

// Signalements routiers communautaires.
// LÉGAL (France) : ne JAMAIS ajouter de type radar, police ou contrôle
// (le serveur les refuse de toute façon, voir la migration road_reports).

export type ReportType =
  | 'accident'
  | 'gravel'
  | 'oil'
  | 'roadworks'
  | 'object'
  | 'animal'
  | 'traffic_jam'
  | 'stopped_vehicle'
  | 'danger';

export const REPORT_TYPES: { value: ReportType; label: string; emoji: string; spoken: string }[] = [
  { value: 'accident', label: 'Accident', emoji: '💥', spoken: 'Accident signalé' },
  { value: 'gravel', label: 'Gravillons', emoji: '🪨', spoken: 'Gravillons signalés' },
  { value: 'oil', label: 'Huile / glissant', emoji: '🛢️', spoken: 'Chaussée glissante signalée' },
  { value: 'roadworks', label: 'Travaux', emoji: '🚧', spoken: 'Travaux signalés' },
  { value: 'object', label: 'Objet sur la route', emoji: '📦', spoken: 'Objet sur la route signalé' },
  { value: 'animal', label: 'Animal', emoji: '🦌', spoken: 'Animal signalé' },
  { value: 'traffic_jam', label: 'Bouchon', emoji: '🚦', spoken: 'Bouchon signalé' },
  { value: 'stopped_vehicle', label: 'Véhicule arrêté', emoji: '🚙', spoken: 'Véhicule arrêté signalé' },
  { value: 'danger', label: 'Zone de danger', emoji: '⚠️', spoken: 'Zone de danger signalée' },
];

export const reportInfo = (type: ReportType) => REPORT_TYPES.find((t) => t.value === type)!;

export type RoadReport = LatLng & {
  id: string;
  type: ReportType;
  createdAt: string;
  expiresAt: string;
  author: string;
  authorId: string;
  confirmations: number;
  removals: number;
  isDemo?: boolean;
};

export type Vote = 'still_there' | 'gone';

type Row = {
  id: string;
  type: ReportType;
  latitude: number;
  longitude: number;
  created_by: string;
  created_at: string;
  expires_at: string;
  confirmations: number;
  removals: number;
  author: { username: string } | null;
};

/** Signalements actifs dans un carré de ~radiusKm autour d'un point (le serveur filtre les expirés). */
export async function fetchReportsAround(center: LatLng, radiusKm = 40): Promise<RoadReport[]> {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));
  const { data, error } = await supabase
    .from('road_reports')
    .select('id, type, latitude, longitude, created_by, created_at, expires_at, confirmations, removals, author:profiles!road_reports_created_by_fkey(username)')
    .gte('latitude', center.latitude - dLat)
    .lte('latitude', center.latitude + dLat)
    .gte('longitude', center.longitude - dLng)
    .lte('longitude', center.longitude + dLng)
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    latitude: r.latitude,
    longitude: r.longitude,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    author: r.author?.username ?? '?',
    authorId: r.created_by,
    confirmations: r.confirmations,
    removals: r.removals,
  }));
}

export async function createReport(userId: string, type: ReportType, at: LatLng) {
  const { error } = await supabase
    .from('road_reports')
    .insert({ created_by: userId, type, latitude: at.latitude, longitude: at.longitude });
  if (error) throw new Error(error.message);
}

export async function voteReport(userId: string, reportId: string, vote: Vote) {
  const { error } = await supabase
    .from('road_report_votes')
    .upsert({ report_id: reportId, user_id: userId, vote }, { onConflict: 'report_id,user_id' });
  if (error) throw new Error(error.message);
}

export async function deleteReport(reportId: string) {
  const { error } = await supabase.from('road_reports').delete().eq('id', reportId);
  if (error) throw error;
}

export function reportAge(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}
