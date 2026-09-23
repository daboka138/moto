import { supabase } from '@/lib/supabase';

// Les règles sont appliquées côté Supabase (fonction can_view_location).
// Ce fichier ne fait que lire et enregistrer les réglages de l'utilisateur.

export type PrivacyMode = 'everyone' | 'friends' | 'selected' | 'ghost';
export type VisibleMode = Exclude<PrivacyMode, 'ghost'>;

export const PRIVACY_MODES: { value: PrivacyMode; label: string; description: string }[] = [
  { value: 'everyone', label: 'Visible par tous', description: 'Tous les membres connectés voient ta position.' },
  { value: 'friends', label: 'Amis uniquement', description: 'Seuls tes amis voient ta position.' },
  { value: 'selected', label: 'Amis sélectionnés', description: 'Seuls les amis que tu coches voient ta position.' },
  { value: 'ghost', label: 'Fantôme', description: 'Personne ne voit ta position.' },
];

export function privacyLabel(mode: PrivacyMode) {
  return PRIVACY_MODES.find((m) => m.value === mode)?.label ?? mode;
}

export type PrivacySettings = {
  mode: PrivacyMode;
  modeBeforeGhost: VisibleMode;
  /** Amis autorisés en mode "selected" */
  allow: string[];
  /** Exceptions : amis à qui je reste masqué en mode "everyone" / "friends" */
  block: string[];
};

export const DEFAULT_PRIVACY: PrivacySettings = { mode: 'friends', modeBeforeGhost: 'friends', allow: [], block: [] };

export async function fetchPrivacy(userId: string): Promise<PrivacySettings> {
  const [settings, rules] = await Promise.all([
    supabase.from('location_privacy').select('mode, mode_before_ghost').eq('user_id', userId).maybeSingle(),
    supabase.from('location_privacy_rules').select('friend_id, kind').eq('owner_id', userId),
  ]);
  if (settings.error) throw settings.error;
  if (rules.error) throw rules.error;
  return {
    mode: settings.data?.mode ?? DEFAULT_PRIVACY.mode,
    modeBeforeGhost: settings.data?.mode_before_ghost ?? DEFAULT_PRIVACY.modeBeforeGhost,
    allow: (rules.data ?? []).filter((r) => r.kind === 'allow').map((r) => r.friend_id),
    block: (rules.data ?? []).filter((r) => r.kind === 'block').map((r) => r.friend_id),
  };
}

export async function savePrivacy(userId: string, next: PrivacySettings, previous: PrivacySettings) {
  // Ordre choisi pour ne jamais être visible par erreur pendant l'enregistrement :
  // on ajoute les exceptions et on retire les autorisations AVANT de changer de mode,
  // on ajoute les autorisations et on retire les exceptions APRÈS.
  await addRules(userId, 'block', diff(next.block, previous.block));
  await removeRules(userId, 'allow', diff(previous.allow, next.allow));

  const { error } = await supabase.from('location_privacy').upsert({
    user_id: userId,
    mode: next.mode,
    mode_before_ghost: next.modeBeforeGhost,
  });
  if (error) throw error;

  await addRules(userId, 'allow', diff(next.allow, previous.allow));
  await removeRules(userId, 'block', diff(previous.block, next.block));
}

/** Bascule rapide fantôme / mode précédent. */
export function toggledGhost(current: PrivacySettings): PrivacySettings {
  if (current.mode === 'ghost') return { ...current, mode: current.modeBeforeGhost };
  return { ...current, mode: 'ghost', modeBeforeGhost: current.mode };
}

function diff(a: string[], b: string[]) {
  return a.filter((x) => !b.includes(x));
}

async function addRules(userId: string, kind: 'allow' | 'block', friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase
    .from('location_privacy_rules')
    .upsert(friendIds.map((friend_id) => ({ owner_id: userId, friend_id, kind })));
  if (error) throw error;
}

async function removeRules(userId: string, kind: 'allow' | 'block', friendIds: string[]) {
  if (!friendIds.length) return;
  const { error } = await supabase
    .from('location_privacy_rules')
    .delete()
    .eq('owner_id', userId)
    .eq('kind', kind)
    .in('friend_id', friendIds);
  if (error) throw error;
}
