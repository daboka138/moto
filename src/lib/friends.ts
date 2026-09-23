import { supabase } from '@/lib/supabase';

/** Ce que les autres voient d'un motard : jamais son prénom ni son nom. */
export type PublicProfile = {
  id: string;
  username: string;
  avatar_path: string;
  city: string | null;
};

export type FriendsState = {
  friends: PublicProfile[];
  /** Demandes reçues, en attente de ma réponse */
  incoming: PublicProfile[];
  /** Demandes que j'ai envoyées */
  outgoing: PublicProfile[];
};

export type Relation = 'self' | 'friend' | 'incoming' | 'outgoing' | 'none';

const PROFILE_FIELDS = 'id, username, avatar_path, city';

type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  requester: PublicProfile;
  addressee: PublicProfile;
};

export async function fetchFriends(userId: string): Promise<FriendsState> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      `requester_id, addressee_id, status,
       requester:profiles!friendships_requester_id_fkey(${PROFILE_FIELDS}),
       addressee:profiles!friendships_addressee_id_fkey(${PROFILE_FIELDS})`,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const state: FriendsState = { friends: [], incoming: [], outgoing: [] };
  for (const row of (data ?? []) as unknown as FriendshipRow[]) {
    const iAmRequester = row.requester_id === userId;
    const other = iAmRequester ? row.addressee : row.requester;
    if (row.status === 'accepted') state.friends.push(other);
    else if (iAmRequester) state.outgoing.push(other);
    else state.incoming.push(other);
  }
  state.friends.sort((a, b) => a.username.localeCompare(b.username));
  return state;
}

export function relationWith(state: FriendsState | null, userId: string, otherId: string): Relation {
  if (otherId === userId) return 'self';
  if (!state) return 'none';
  if (state.friends.some((p) => p.id === otherId)) return 'friend';
  if (state.incoming.some((p) => p.id === otherId)) return 'incoming';
  if (state.outgoing.some((p) => p.id === otherId)) return 'outgoing';
  return 'none';
}

export async function searchUsers(query: string, userId: string): Promise<PublicProfile[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  // % et _ sont des jokers en SQL : on les échappe
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .ilike('username', pattern)
    .neq('id', userId)
    .order('username')
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function sendFriendRequest(userId: string, otherId: string) {
  const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: otherId });
  if (error) {
    if (error.code === '23505') throw new Error('Une demande existe déjà entre vous.');
    throw error;
  }
}

export async function acceptFriendRequest(userId: string, requesterId: string) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester_id', requesterId)
    .eq('addressee_id', userId);
  if (error) throw error;
}

/** Refuser une demande reçue, annuler une demande envoyée ou retirer un ami. */
export async function removeFriendship(userId: string, otherId: string) {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
    );
  if (error) throw error;
}
