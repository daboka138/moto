import 'expo-sqlite/localStorage/install';

import { useEffect, useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

// Fonctionnalités gratuites / premium / désactivées (table app_features, modifiable par l'admin
// seulement) et plan du membre (free / premium, écrit par le serveur). UN SEUL point de décision
// dans l'app : canUse('clé'). Bêta : tout est gratuit. Aucun paiement n'existe pour l'instant.
// Le serveur applique la même règle quand c'est lui qui agit (feature_allowed, ex. points).

export type FeatureKey = 'good_points' | 'loop' | 'route_weather' | 'gpx' | 'garage' | 'convoy_tools' | 'premium_offer';
export type FeatureStatus = 'free' | 'premium' | 'disabled';
export type Feature = { key: string; name: string; description: string | null; status: FeatureStatus; sort: number };
export type Plan = { plan: 'free' | 'premium'; lifetime: boolean; until: string | null };

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  free: 'Gratuit',
  premium: 'Premium',
  disabled: 'Désactivé',
};

// Avant le premier chargement (ou hors ligne sans cache) : tout gratuit, bouton Premium caché
const DEFAULT_STATUS: Record<FeatureKey, FeatureStatus> = {
  good_points: 'free',
  loop: 'free',
  route_weather: 'free',
  gpx: 'free',
  garage: 'free',
  convoy_tools: 'free',
  premium_offer: 'disabled',
};

const CACHE_KEY = 'moto.features';

type State = { features: Feature[] | null; plan: Plan | null; userId: string | null };

function readCache(): Feature[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Feature[]) : null;
  } catch {
    return null;
  }
}

let state: State = { features: readCache(), plan: null, userId: null };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function featureStatus(key: FeatureKey): FeatureStatus {
  return state.features?.find((f) => f.key === key)?.status ?? DEFAULT_STATUS[key];
}

export const hasPremium = () => state.plan?.plan === 'premium';

/** La fonctionnalité est-elle disponible pour moi ? (seul point de décision de l'app) */
export function canUse(key: FeatureKey): boolean {
  const status = featureStatus(key);
  if (status === 'free') return true;
  if (status === 'premium') return hasPremium();
  return false;
}

/** canUse() qui se met à jour quand l'admin change un réglage ou quand le plan change */
export function useCanUse(key: FeatureKey) {
  useSyncExternalStore(subscribe, () => state);
  return canUse(key);
}

export function useFeatures() {
  return useSyncExternalStore(subscribe, () => state);
}

/** Recharge les fonctionnalités et mon plan */
export async function refreshFeatures(userId: string | null = state.userId) {
  const [features, plan] = await Promise.all([
    supabase.from('app_features').select('key, name, description, status, sort').order('sort'),
    userId ? supabase.rpc('my_plan') : Promise.resolve({ data: null, error: null }),
  ]);
  if (features.error) throw features.error;
  const list = (features.data ?? []) as Feature[];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // pas grave : valeurs par défaut au prochain démarrage hors ligne
  }
  update({ features: list, plan: (plan.data as Plan | null) ?? null, userId });
}

/** Chargement au démarrage et à chaque changement de compte (_layout.tsx) */
export function useFeaturesSync(userId: string | undefined) {
  useEffect(() => {
    if (!userId) {
      update({ plan: null, userId: null });
      return;
    }
    refreshFeatures(userId).catch((e) => console.warn('Fonctionnalités indisponibles', e));
  }, [userId]);
}

// ---------- Console admin (RLS : seul l'admin peut écrire) ----------

export async function setFeatureStatus(key: string, status: FeatureStatus) {
  const { data, error } = await supabase.from('app_features').update({ status }).eq('key', key).select('key');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Modification refusée');
  await refreshFeatures();
}

export type PremiumMode = 'lifetime' | 'until' | 'free';

/** Offrir le premium à un membre (testeurs) ou le retirer */
export async function setUserPremium(userId: string, mode: PremiumMode, until?: Date) {
  const { error } = await supabase.rpc('admin_set_premium', {
    p_user: userId,
    p_mode: mode,
    p_until: until ? until.toISOString() : null,
  });
  if (error) throw new Error(error.message);
  if (userId === state.userId) await refreshFeatures();
}
