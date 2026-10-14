import type { AuthError } from '@supabase/supabase-js';

import { unregisterPush } from '@/lib/push';
import { clearHistory } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import { TERMS_VERSION } from '@/lib/terms';

// Toute l'authentification passe par ce fichier. Le reste de l'app ne dépend que
// de la session (voir session.tsx), pas de la méthode de connexion.
//
// Passage au téléphone : activer le provider Phone (+ Twilio) dans Supabase,
// puis remplacer le formulaire email de sign-in.tsx par un formulaire en deux
// temps qui appelle sendPhoneCode puis verifyPhoneCode (déjà prêts ci-dessous).

/** Erreur d'authentification lisible, avec le code Supabase (ex. « email_not_confirmed ») */
export class AuthFailure extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const fail = (error: AuthError) => new AuthFailure(authErrorMessage(error), error.code);

/** Longueur des nouveaux mots de passe (le serveur exige 6 minimum, l'app en demande 8) */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw fail(error);
}

/**
 * Retourne true si Supabase attend la confirmation de l'email avant d'ouvrir une session.
 * La version des CGU acceptée (case cochée) part dans les métadonnées : un trigger
 * l'enregistre dans terms_acceptances en même temps que le compte.
 */
export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { terms_version: TERMS_VERSION } },
  });
  if (error) throw fail(error);
  return !data.session;
}

/**
 * « Mot de passe oublié » : envoie le lien de réinitialisation. Le lien de l'email (modèle
 * supabase/templates/recovery.html) mène à /auth-callback, dans l'app ou sur app.passeryder.fr.
 * Ne dit jamais si un compte existe : seules les erreurs de saisie ou de quota remontent.
 */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.code === 'validation_failed')) {
    throw fail(error);
  }
}

/** Renvoie l'email de confirmation d'inscription (même réponse que le compte existe ou non) */
export async function resendConfirmation(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.code === 'validation_failed')) {
    throw fail(error);
  }
}

export type EmailLinkType = 'recovery' | 'magiclink';

/** Lien reçu par email (token_hash) : ouvre la session du compte concerné */
export async function verifyEmailLink(tokenHash: string, type: EmailLinkType) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) throw fail(error);
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw fail(error);
}

/** Envoie un code par SMS. Numéro au format international : +33612345678 */
export async function sendPhoneCode(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw fail(error);
}

export async function verifyPhoneCode(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw fail(error);
}

export async function signOut() {
  // Ce téléphone ne reçoit plus les notifications du compte (avant de perdre la session)
  await unregisterPush().catch((e) => console.warn('Désinscription des notifications impossible', e));
  const { error } = await supabase.auth.signOut();
  if (error) throw fail(error);
}

/**
 * Supprime définitivement le compte et toutes ses données (Edge Function
 * delete-account), puis efface la session et l'historique de recherche du téléphone.
 */
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    const body = await (error as { context?: Response }).context?.json().catch(() => null);
    throw new Error(body?.error ?? 'La suppression a échoué. Vérifie ta connexion et réessaie.');
  }
  clearHistory();
  // Le compte n'existe plus côté serveur : on ne vide que la session locale
  await supabase.auth.signOut({ scope: 'local' });
}

function authErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Email ou mot de passe incorrect.';
    case 'email_not_confirmed':
      return "Ton email n'est pas encore confirmé. Clique sur le lien reçu par email.";
    case 'user_already_exists':
    case 'email_exists':
      return 'Un compte existe déjà avec cet email.';
    case 'weak_password':
      return 'Mot de passe trop faible (6 caractères minimum).';
    case 'same_password':
      return 'Choisis un mot de passe différent de l’ancien.';
    case 'otp_expired':
      return 'Ce lien a expiré ou a déjà servi. Demande un nouveau lien.';
    case 'validation_failed':
      return 'Email invalide.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives, réessaie dans quelques minutes.';
    default:
      return error.message;
  }
}
