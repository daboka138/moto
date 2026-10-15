import 'expo-sqlite/localStorage/install';

import { Alert, Platform, Share } from 'react-native';

import { supabase } from '@/lib/supabase';

// Invitations / parrainage : un code par membre (créé avec le profil, table invite_codes),
// lien https://passeryder.fr/i/CODE (page publique du site). Le code saisi à l'inscription est
// envoyé dans les métadonnées : le serveur crée le parrainage et l'amitié quand le profil est
// créé. Points du parrain (+30) donnés par le serveur, 7 jours après, si le filleul a agi.

export const INVITE_PATTERN = /^[A-Z0-9]{6,10}$/;

export const inviteUrl = (code: string) => `https://passeryder.fr/i/${code}`;

export const cleanInviteCode = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export type Referee = { id: string; username: string; avatarPath: string; qualified: boolean; at: string };
export type MyInvite = { code: string | null; count: number; qualified: number; referees: Referee[] };

export async function fetchMyInvite(): Promise<MyInvite> {
  const { data, error } = await supabase.rpc('my_referrals');
  if (error) throw new Error(error.message);
  const r = data as {
    code: string | null;
    count: number;
    qualified: number;
    referees: { id: string; username: string; avatar_path: string; qualified: boolean; at: string }[];
  };
  return {
    code: r.code,
    count: Number(r.count),
    qualified: Number(r.qualified),
    referees: r.referees.map((x) => ({ id: x.id, username: x.username, avatarPath: x.avatar_path, qualified: x.qualified, at: x.at })),
  };
}

/** Qui invite ? (null si le code n'existe pas) */
export async function fetchInviter(code: string): Promise<{ username: string; avatarPath: string } | null> {
  const { data, error } = await supabase.rpc('invite_info', { p_code: code });
  if (error || !data) return null;
  const r = data as { username: string; avatar_path: string };
  return { username: r.username, avatarPath: r.avatar_path };
}

/** Partage du lien avec un message prêt */
export async function shareInvite(code: string) {
  const url = inviteUrl(code);
  const message = `Je roule avec PasseRyder, rejoins-moi : ${url}\n(mon code d’invitation : ${code})`;
  try {
    if (Platform.OS === 'web' && !navigator.share) {
      await navigator.clipboard.writeText(message);
      Alert.alert('Lien copié', url);
      return;
    }
    await Share.share(Platform.OS === 'web' ? { title: 'PasseRyder', message, url } : { title: 'PasseRyder', message });
  } catch (e) {
    console.warn('Partage impossible', e);
  }
}

// Code arrivé par un lien (version web : app.passeryder.fr/sign-in?invite=CODE), gardé jusqu'à l'inscription
const PENDING_KEY = 'moto.pendingInvite';

export function rememberInviteCode(code: string) {
  const c = cleanInviteCode(code);
  if (!INVITE_PATTERN.test(c)) return;
  try {
    localStorage.setItem(PENDING_KEY, c);
  } catch {
    // pas grave : le champ reste à remplir à la main
  }
}

export function pendingInviteCode(): string {
  try {
    return localStorage.getItem(PENDING_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // pas grave
  }
}
