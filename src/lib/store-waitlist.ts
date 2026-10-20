import { supabase } from '@/lib/supabase';

// « Préviens-moi » quand l'appli sort sur iPhone (App Store) ou Android (Google Play public).
// Inscriptions dans store_waitlist (RLS : chacun lit les siennes, écritures par RPC). L'envoi
// (notification + push + email, une seule fois) est déclenché par l'admin : Console › Sorties stores
// → Edge Function store-launch. Migration 20261031000000_store_waitlist.sql.

export type StorePlatform = 'ios' | 'android';

export const PLATFORM_LABELS: Record<StorePlatform, string> = { ios: 'iPhone', android: 'Android' };

export type MyWaitlist = Record<StorePlatform, { on: boolean; emailOk: boolean }>;

export async function fetchMyWaitlist(userId: string): Promise<MyWaitlist> {
  const { data, error } = await supabase
    .from('store_waitlist')
    .select('platform, email_ok, unsubscribed_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const out: MyWaitlist = { ios: { on: false, emailOk: false }, android: { on: false, emailOk: false } };
  for (const r of (data ?? []) as { platform: StorePlatform; email_ok: boolean; unsubscribed_at: string | null }[]) {
    out[r.platform] = { on: !r.unsubscribed_at, emailOk: r.email_ok };
  }
  return out;
}

export async function setWaitlist(platform: StorePlatform, on: boolean, emailOk = false) {
  const { error } = await supabase.rpc('set_store_waitlist', { p_platform: platform, p_on: on, p_email_ok: emailOk });
  if (error) throw new Error(error.message);
}

/** Liens des stores (app_settings, publics) : App Store vide tant que l'appli iPhone n'est pas sortie */
export type StoreLinks = { appStoreUrl: string; playStoreUrl: string; googleReview: boolean; publicAndroid: boolean };

export async function fetchStoreLinks(): Promise<StoreLinks> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['app_store_url', 'play_store_url', 'google_review', 'distribution_mode']);
  if (error) throw new Error(error.message);
  const s = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return {
    appStoreUrl: s.app_store_url ?? '',
    playStoreUrl: s.play_store_url ?? '',
    googleReview: s.google_review === 'on',
    publicAndroid: s.distribution_mode === 'public' && s.google_review !== 'on',
  };
}

// ---------- Bandeau du Mur (web) : ✕ = caché 30 jours sur cet appareil ----------
const DISMISS_KEY = 'moto.storeBanner';
const HIDE_MS = 30 * 24 * 3600_000;

export function bannerDismissed(variant: string): boolean {
  try {
    const at = Number(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}')[variant] ?? 0);
    return Date.now() - at < HIDE_MS;
  } catch {
    return false;
  }
}

export function dismissBanner(variant: string) {
  try {
    const all = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}');
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ ...all, [variant]: Date.now() }));
  } catch {
    // stockage indisponible (navigation privée) : le bandeau reviendra
  }
}

// ---------- Console › Sorties stores (admin) ----------
export type LaunchStats = {
  platform: StorePlatform;
  subscribers: number;
  members: number;
  emails: number;
  notified: number;
  emailed: number;
  unsubscribed: number;
  pending: number;
};

export async function fetchLaunchStats(): Promise<LaunchStats[]> {
  const { data, error } = await supabase.rpc('admin_store_launch');
  if (error) throw new Error(error.message);
  return ((data ?? []) as LaunchStats[]).map((r) => ({
    platform: r.platform,
    subscribers: Number(r.subscribers),
    members: Number(r.members),
    emails: Number(r.emails),
    notified: Number(r.notified),
    emailed: Number(r.emailed),
    unsubscribed: Number(r.unsubscribed),
    pending: Number(r.pending),
  }));
}

export type LaunchResult = { test: boolean; emailed: number; failed: number; error: string | null };

/** Prévient les inscrits (ou seulement moi avec test = true) : notification, push, email */
export async function sendStoreLaunch(platform: StorePlatform, test: boolean): Promise<LaunchResult> {
  const { data, error } = await supabase.functions.invoke<LaunchResult & { error?: string }>('store-launch', {
    body: { platform, test },
  });
  if (error) {
    // Message d'erreur renvoyé par la fonction (lien manquant, accès refusé…)
    const ctx = (error as { context?: Response }).context;
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(detail?.error ?? error.message);
  }
  return data as LaunchResult;
}
