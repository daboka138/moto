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
  event_comment: 'Commentaire d’un événement',
  event_photo: 'Photo d’un événement',
  news_comment: 'Commentaire d’une actu',
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

// ---------- Statistiques d'usage (note 39) ----------

export type UsagePeriod = 7 | 30 | 90;

export type UsageStats = {
  days: UsagePeriod;
  since: string;
  /** Premier jour d'ouverture enregistré (null = rien encore) */
  tracking_since: string | null;
  users: number;
  new_period: number;
  dau: number;
  wau: number;
  mau: number;
  active_period: number;
  testers_14d: number;
  platforms: { android: number; web: number; both: number };
  daily: { day: string; android: number; web: number; active: number; signups: number }[];
  weekly_signups: { week: string; count: number }[] | null;
  departments: { department: string; count: number }[];
  retention: { week: string; size: number; d1_n: number; d1: number; d7_n: number; d7: number; d30_n: number; d30: number }[];
  features: { feature: string; n7: number | null; n30: number | null; period: number | null }[];
  usage_daily: { day: string; feature: string; n: number }[];
};

export async function fetchUsageStats(days: UsagePeriod): Promise<UsageStats> {
  const { data, error } = await supabase.rpc('admin_usage_stats', { p_days: days });
  if (error) throw new Error(error.message);
  return data as UsageStats;
}

/** Libellés des fonctions comptées (serveur : triggers ; téléphone : track_usage) */
export const USAGE_LABELS: Record<string, string> = {
  nav_start: 'Navigation lancée',
  loop: 'Boucle générée',
  ride_create: 'Balade créée',
  ride_join: 'Balade rejointe',
  message: 'Message envoyé',
  post: 'Post (Mur)',
  story: 'Story',
  danger_report: 'Danger signalé',
  sos: 'SOS déclenché',
  history: 'Histoire ouverte',
  weather: 'Météo consultée',
  fuel: 'Station carburant',
  search: 'Recherche',
  homecoming: '« Je rentre »',
  trip_share: 'Trajet partagé',
  outing_share: 'Sortie partagée',
  gpx_import: 'Import GPX',
  garage: 'Garage ouvert',
  event_create: 'Événement créé',
  spot_create: 'Spot créé',
  place_review: 'Avis sur un spot',
};

export const usageLabel = (f: string) => USAGE_LABELS[f] ?? f;

/** Pourcentage arrondi (null si personne n'est concerné) */
export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : null);

/** Export CSV (séparateur « ; » pour Excel en français) : jour par jour, puis fidélité et départements */
export function usageCsv(s: UsageStats): string {
  const features = [...new Set(s.usage_daily.map((u) => u.feature))].sort();
  const byDay = new Map<string, Record<string, number>>();
  for (const u of s.usage_daily) (byDay.get(u.day) ?? byDay.set(u.day, {}).get(u.day)!)[u.feature] = u.n;
  const cell = (v: string | number | null) => {
    const t = v === null ? '' : String(v);
    return /[;"\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
  };
  const line = (cells: (string | number | null)[]) => cells.map(cell).join(';');
  const out: string[] = [];
  out.push(line(['Jour', 'Actifs', 'Android', 'Web', 'Inscriptions', ...features.map(usageLabel)]));
  for (const d of s.daily) {
    const u = byDay.get(d.day) ?? {};
    out.push(line([d.day, d.active, d.android, d.web, d.signups, ...features.map((f) => u[f] ?? 0)]));
  }
  out.push('', line(['Semaine d’inscription', 'Inscrits', 'J+1 %', 'J+7 %', 'J+30 %']));
  for (const r of s.retention) out.push(line([r.week, r.size, pct(r.d1, r.d1_n), pct(r.d7, r.d7_n), pct(r.d30, r.d30_n)]));
  out.push('', line(['Département', 'Membres actifs']));
  for (const d of s.departments) out.push(line([d.department === '?' ? 'Inconnu' : d.department, d.count]));
  out.push('', line(['Fonction', '7 jours', '30 jours', `${s.days} jours`]));
  for (const f of s.features) out.push(line([usageLabel(f.feature), f.n7 ?? 0, f.n30 ?? 0, f.period ?? 0]));
  return '﻿' + out.join('\r\n');
}

// ---------- Agenda : événements publics à valider ----------

export type PendingEvent = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  placeLabel: string;
  photoPath: string | null;
  linkUrl: string | null;
  organizerLabel: string | null;
  createdAt: string;
  createdBy: string;
  username: string;
  creatorEvents: number;
};

export async function fetchPendingEvents(): Promise<PendingEvent[]> {
  const { data, error } = await supabase.rpc('admin_event_queue');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, string | number | null>[]).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    title: r.title as string,
    description: r.description as string | null,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string | null,
    placeLabel: r.place_label as string,
    photoPath: r.photo_path as string | null,
    linkUrl: r.link_url as string | null,
    organizerLabel: r.organizer_label as string | null,
    createdAt: r.created_at as string,
    createdBy: r.created_by as string,
    username: r.username as string,
    creatorEvents: Number(r.creator_events),
  }));
}

/** Valider (visible par tous) ou refuser (visible du créateur seulement), avec un mot facultatif */
export async function reviewEvent(id: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('admin_review_event', { p_id: id, p_approve: approve, p_note: note ?? null });
  if (error) throw new Error(error.message);
}
