import { supabase } from '@/lib/supabase';

/**
 * Version des CGU en vigueur = date affichée sur passeryder.fr/conditions.
 * À changer à chaque modification importante des CGU : tous les membres
 * devront alors les accepter de nouveau (écran terms.tsx).
 */
export const TERMS_VERSION = '2026-09-27';

export const TERMS_URL = 'https://passeryder.fr/conditions';
export const PRIVACY_POLICY_URL = 'https://passeryder.fr/confidentialite';
export const CONTACT_EMAIL = 'passeryder@gmail.com';

/** Le membre a-t-il accepté la version en vigueur ? */
export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('version')
    .eq('user_id', userId)
    .eq('version', TERMS_VERSION)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Enregistre l'acceptation (date fixée par le serveur). */
export async function acceptTerms() {
  const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION });
  if (error) throw error;
}
