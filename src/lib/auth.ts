import type { AuthError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// Toute l'authentification passe par ce fichier. Le reste de l'app ne dépend que
// de la session (voir session.tsx), pas de la méthode de connexion.
//
// Passage au téléphone : activer le provider Phone (+ Twilio) dans Supabase,
// puis remplacer le formulaire email de sign-in.tsx par un formulaire en deux
// temps qui appelle sendPhoneCode puis verifyPhoneCode (déjà prêts ci-dessous).

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authErrorMessage(error));
}

/** Retourne true si Supabase attend la confirmation de l'email avant d'ouvrir une session. */
export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw new Error(authErrorMessage(error));
  return !data.session;
}

/** Envoie un code par SMS. Numéro au format international : +33612345678 */
export async function sendPhoneCode(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw new Error(authErrorMessage(error));
}

export async function verifyPhoneCode(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw new Error(authErrorMessage(error));
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authErrorMessage(error));
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
    case 'validation_failed':
      return 'Email invalide.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Trop de tentatives, réessaie dans quelques minutes.';
    default:
      return error.message;
  }
}
