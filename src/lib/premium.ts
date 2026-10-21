import { useEffect, useState } from 'react';

import { refreshFeatures } from '@/lib/features';
import { supabase } from '@/lib/supabase';

// Préparation du premium (note 33) : TOUT EST DÉSACTIVÉ ET GRATUIT. Aucun paiement dans l'app
// (Google Play Billing / App Store via RevenueCat au build 1.3.0, Stripe sur le web plus tard :
// PLAY_STORE.md § 7). Premium plus tard = UNIQUEMENT de nouvelles fonctions avancées ; ce qui est
// gratuit aujourd'hui le restera et la sécurité sera toujours gratuite.

export type PremiumOffer = {
  active: boolean;
  monthly: number;
  yearly: number;
  founderDiscountPct: number;
  founderOfferMonths: number;
};

export type AdminPremium = PremiumOffer & { activatedAt: string | null; founders: number; members: number };

/** Prix (écran Premium) : null tant que le premium est inactif, sauf pour l'admin (aperçu) */
export async function fetchPremiumOffer(): Promise<PremiumOffer | null> {
  const { data, error } = await supabase.rpc('premium_offer');
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as Record<string, number | boolean>;
  return {
    active: !!d.active,
    monthly: Number(d.monthly),
    yearly: Number(d.yearly),
    founderDiscountPct: Number(d.founderDiscountPct),
    founderOfferMonths: Number(d.founderOfferMonths),
  };
}

/** « 3,99 € » */
export const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// ---------- Membres fondateurs (inscrits avant l'activation du premium) ----------

const founders = new Map<string, boolean>();

/** Badge « Membre fondateur » d'un profil (lu une fois par session) */
export function useIsFounder(userId: string | null | undefined) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!userId || founders.has(userId)) return;
    let cancelled = false;
    supabase
      .from('founding_members')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return;
        founders.set(userId, !!data);
        if (!cancelled) setTick((t) => t + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return userId ? (founders.get(userId) ?? false) : false;
}

// ---------- Console › Fonctions › Premium (admin, vérifié par le serveur) ----------

export async function fetchAdminPremium(): Promise<AdminPremium> {
  const { data, error } = await supabase.rpc('admin_premium');
  if (error) throw new Error(error.message);
  const d = data as Record<string, number | boolean | string | null>;
  return {
    active: !!d.active,
    activatedAt: (d.activatedAt as string | null) ?? null,
    monthly: Number(d.monthly),
    yearly: Number(d.yearly),
    founderDiscountPct: Number(d.founderDiscountPct),
    founderOfferMonths: Number(d.founderOfferMonths),
    founders: Number(d.founders),
    members: Number(d.members),
  };
}

export async function savePremiumConfig(c: { monthly: number; yearly: number; founderDiscountPct: number; founderOfferMonths: number }) {
  const { error } = await supabase.rpc('admin_set_premium_config', {
    p_monthly: c.monthly,
    p_yearly: c.yearly,
    p_discount: c.founderDiscountPct,
    p_months: c.founderOfferMonths,
  });
  if (error) throw new Error(error.message);
}

/** Interrupteur global (la 1re activation fige la liste des membres fondateurs) */
export async function setPremiumActive(on: boolean) {
  const { error } = await supabase.rpc('admin_set_premium_active', { p_on: on });
  if (error) throw new Error(error.message);
  await refreshFeatures();
}
