import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// « Motards que tu pourrais connaître » (RPC friend_suggestions) : amis d'amis, mêmes clubs, balades,
// événements, même ville… Jamais de position. Réglage « Apparaître dans les suggestions » (privé).

export type FriendSuggestion = {
  id: string;
  username: string;
  avatarUrl: string;
  motoLabel: string | null;
  /** « 3 amis en commun », « Même club »… */
  reason: string;
};

type Row = { id: string; username: string; avatar_path: string; moto_label: string | null; reason: string };

export async function fetchFriendSuggestions(limit = 15): Promise<FriendSuggestion[]> {
  const { data, error } = await supabase.rpc('friend_suggestions', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    username: r.username,
    avatarUrl: photoUrl(r.avatar_path),
    motoLabel: r.moto_label,
    reason: r.reason,
  }));
}

/** ✕ : ne plus suggérer ce motard */
export async function dismissSuggestion(userId: string, targetId: string) {
  const { error } = await supabase.from('friend_suggestion_dismissals').upsert({ user_id: userId, target_id: targetId });
  if (error) throw error;
}

export async function fetchInSuggestions(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profile_private').select('in_suggestions').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as { in_suggestions?: boolean } | null)?.in_suggestions ?? true;
}

export async function setInSuggestions(enabled: boolean) {
  const { error } = await supabase.rpc('set_in_suggestions', { p_enabled: enabled });
  if (error) throw new Error(error.message);
}
