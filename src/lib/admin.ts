import { useEffect, useState } from 'react';

import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Console développeur (admin). Toutes les données passent par des fonctions SQL admin_* qui
// vérifient is_admin() côté serveur : un membre normal reçoit « Accès refusé ». Jamais de clé
// service_role dans l'app. La console ne montre jamais de position, trajet, message privé ni
// numéro de contact d'urgence.

/** Suis-je admin ? (vérifié par le serveur ; null = en cours) */
let cached: { userId: string; admin: boolean } | null = null;

export function useIsAdmin(userId: string | undefined) {
  const [admin, setAdmin] = useState<{ userId: string; admin: boolean } | null>(cached);
  useEffect(() => {
    if (!userId || cached?.userId === userId) return;
    let cancelled = false;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.warn('Rôle admin indisponible', error);
      cached = { userId, admin: data === true };
      setAdmin(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return admin && admin.userId === userId ? admin.admin : false;
}

export type AdminStats = {
  users: number;
  new_today: number;
  new_7d: number;
  new_30d: number;
  active_24h: number;
  active_7d: number;
  rides: number;
  events: number;
  places: number;
  posts: number;
  suspended: number;
  sms_today: number;
  sms_7d: number;
  sms_30d: number;
  sms_errors_7d: number;
  signups: { day: string; count: number }[];
  notify_signups: boolean | null;
};

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) throw new Error(error.message);
  return data as AdminStats;
}

export type AdminUser = {
  id: string;
  username: string;
  avatarUrl: string;
  email: string | null;
  createdAt: string;
  lastSeen: string | null;
  city: string | null;
  platform: string | null;
  suspended: boolean;
  isAdmin: boolean;
  lifetimePremium: boolean;
  premiumUntil: string | null;
};

export const ADMIN_PAGE = 50;

export async function fetchAdminUsers(query: string, offset = 0): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_users', { p_query: query.trim() || null, p_limit: ADMIN_PAGE, p_offset: offset });
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    username: string;
    avatar_path: string;
    email: string | null;
    created_at: string;
    last_seen: string | null;
    city: string | null;
    platform: string | null;
    suspended: boolean;
    is_admin: boolean;
    lifetime_premium: boolean;
    premium_until: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: photoUrl(r.avatar_path),
    email: r.email,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    city: r.city,
    platform: r.platform,
    suspended: r.suspended,
    isAdmin: r.is_admin,
    lifetimePremium: r.lifetime_premium,
    premiumUntil: r.premium_until,
  }));
}

export type AdminReport = {
  targetType: string;
  targetId: string;
  reports: number;
  reasons: string[];
  lastAt: string;
  excerpt: string | null;
  authorId: string | null;
  authorUsername: string | null;
  hidden: boolean;
};

export const REPORT_TYPE_LABELS: Record<string, string> = {
  place: 'Spot',
  place_review: 'Avis sur un spot',
  event: 'Événement',
  photo: 'Photo du mur',
  comment: 'Commentaire de photo',
  ride_comment: 'Commentaire de balade',
  story: 'Story',
  user: 'Compte',
  club: 'Club',
  club_post: 'Message d’un club',
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  spam: 'spam',
  harassment: 'harcèlement',
  inappropriate: 'inapproprié',
  danger: 'dangereux',
  other: 'autre',
};

export async function fetchAdminReports(): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_reports');
  if (error) throw new Error(error.message);
  type Row = {
    target_type: string;
    target_id: string;
    reports: number;
    reasons: string[];
    last_at: string;
    excerpt: string | null;
    author_id: string | null;
    author_username: string | null;
    hidden: boolean;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    targetType: r.target_type,
    targetId: r.target_id,
    reports: Number(r.reports),
    reasons: r.reasons ?? [],
    lastAt: r.last_at,
    excerpt: r.excerpt,
    authorId: r.author_id,
    authorUsername: r.author_username,
    hidden: r.hidden,
  }));
}

export async function moderate(r: AdminReport, action: 'hide' | 'unhide' | 'delete' | 'dismiss') {
  const { error } = await supabase.rpc('admin_moderate', { p_type: r.targetType, p_id: r.targetId, p_action: action });
  if (error) throw new Error(error.message);
}

/** Suspendre (déconnecté, ne peut plus se connecter) ou rétablir un compte */
export async function suspendUser(userId: string, suspend: boolean, reason?: string) {
  const { error } = await supabase.rpc('admin_suspend', { p_user: userId, p_suspend: suspend, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}

export async function setSignupNotify(on: boolean) {
  const { error } = await supabase.rpc('admin_set_signup_notify', { p_on: on });
  if (error) throw new Error(error.message);
}


// ---------- Défi du mois (points de bon comportement) ----------

export type ChallengeMetric =
  | 'clean_km'
  | 'phone_free'
  | 'danger_confirmed'
  | 'danger_confirm'
  | 'ride_organized'
  | 'convoy_done'
  | 'regroup'
  | 'spot_rated'
  | 'points'
  | 'referral';

export const CHALLENGE_METRICS: { value: ChallengeMetric; label: string }[] = [
  { value: 'clean_km', label: 'Km propres' },
  { value: 'phone_free', label: 'Trajets sans téléphone' },
  { value: 'danger_confirmed', label: 'Dangers signalés confirmés' },
  { value: 'danger_confirm', label: 'Dangers confirmés pour les autres' },
  { value: 'ride_organized', label: 'Balades organisées' },
  { value: 'convoy_done', label: 'Convois menés' },
  { value: 'regroup', label: 'Regroupements' },
  { value: 'spot_rated', label: 'Spots bien notés' },
  { value: 'points', label: 'Points gagnés' },
  { value: 'referral', label: 'Potes parrainés' },
];

export type ChallengeRow = {
  month: string;
  emoji: string;
  title: string;
  description: string | null;
  metric: ChallengeMetric;
  goal: number;
  bonus: number;
};

export async function fetchChallenges(): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from('monthly_challenges')
    .select('month, emoji, title, description, metric, goal, bonus')
    .order('month', { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return (data ?? []) as ChallengeRow[];
}

/** Créer ou modifier le défi d'un mois (RLS : admin seulement) */
export async function saveChallenge(c: ChallengeRow) {
  const { error } = await supabase.from('monthly_challenges').upsert(c, { onConflict: 'month' });
  if (error) throw new Error(error.message);
}

export async function deleteChallenge(month: string) {
  const { error } = await supabase.from('monthly_challenges').delete().eq('month', month);
  if (error) throw new Error(error.message);
}


// ---------- Invitations (parrainage) ----------

export type ReferralStats = {
  invited: number;
  invited_30d: number;
  qualified: number;
  top: { username: string; n: number; qualified: number }[];
};

export async function fetchReferralStats(): Promise<ReferralStats> {
  const { data, error } = await supabase.rpc('admin_referral_stats');
  if (error) throw new Error(error.message);
  return data as ReferralStats;
}

// ---------- Réglages publics (app_settings, écriture admin par RLS) ----------

export async function fetchAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}

export async function saveAppSetting(key: string, value: string) {
  const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ---------- Message de bienvenue (envoyé par le serveur à la création du profil) ----------

export type WelcomeSettings = {
  enabled: boolean;
  body: string;
  testUsername: string | null;
  senderUsername: string | null;
  sent: number;
  replied: number;
  /** Inscrits existants qui ne l'ont pas reçu */
  pending: number;
};

export async function fetchWelcome(): Promise<WelcomeSettings> {
  const { data, error } = await supabase.rpc('admin_welcome');
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    enabled: !!d.enabled,
    body: String(d.body ?? ''),
    testUsername: (d.test_username as string | null) ?? null,
    senderUsername: (d.sender_username as string | null) ?? null,
    sent: Number(d.sent ?? 0),
    replied: Number(d.replied ?? 0),
    pending: Number(d.pending ?? 0),
  };
}

export async function saveWelcome(enabled: boolean, body: string, testUsername: string) {
  const { error } = await supabase.rpc('admin_set_welcome', { p_enabled: enabled, p_body: body, p_test_username: testUsername });
  if (error) throw new Error(error.message);
}

/** Envoie le texte saisi au compte de test (enregistré dans les réglages) */
export async function sendWelcomeTest(body: string) {
  const { error } = await supabase.rpc('admin_welcome_test', { p_body: body });
  if (error) throw new Error(error.message);
}

/** Inscrits existants sans bienvenue : renvoie le nombre de messages envoyés */
export async function welcomeBackfill(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_welcome_backfill');
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Aperçu : {pseudo} remplacé comme côté serveur */
export const welcomePreview = (body: string, pseudo: string) => body.replaceAll('{pseudo}', pseudo);
