import { openDirectConversation, sendMessage } from '@/lib/messages';
import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// « J'aime » et commentaires des balades, « J'aime » des stories et réponses en message privé.
// Lecture filtrée par le serveur (RLS) : balades visibles seulement, rien entre membres bloqués.

export type Comment = {
  id: string;
  authorId: string;
  username: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
};

export type LikeSummary = { likes: number; likedByMe: boolean };

export const COMMENT_MAX = 500;

type CommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { username: string; avatar_path: string } | null;
};

const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  authorId: r.author_id,
  username: r.author?.username ?? 'motard',
  avatarUrl: photoUrl(r.author?.avatar_path ?? ''),
  body: r.body,
  createdAt: r.created_at,
});

// ---------- Balades ----------

export async function fetchRideLikes(rideId: string, userId: string): Promise<LikeSummary> {
  const { data, error } = await supabase.from('ride_likes').select('user_id').eq('ride_id', rideId);
  if (error) throw error;
  return { likes: data.length, likedByMe: data.some((l) => l.user_id === userId) };
}

export async function setRideLike(rideId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('ride_likes').insert({ ride_id: rideId, user_id: userId })
    : await supabase.from('ride_likes').delete().eq('ride_id', rideId).eq('user_id', userId);
  if (error && error.code !== '23505') throw error;
}

export async function fetchRideComments(rideId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('ride_comments')
    .select('id, author_id, body, created_at, author:profiles(username, avatar_path)')
    .eq('ride_id', rideId)
    .order('created_at')
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as CommentRow[]).map(toComment);
}

export async function addRideComment(rideId: string, userId: string, body: string) {
  const text = body.trim().slice(0, COMMENT_MAX);
  if (!text) return;
  const { error } = await supabase.from('ride_comments').insert({ ride_id: rideId, author_id: userId, body: text });
  if (error) throw new Error(error.message.includes('row-level security') ? 'Tu ne peux pas commenter cette balade.' : error.message);
}

export async function deleteRideComment(id: string) {
  const { error } = await supabase.from('ride_comments').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Stories ----------

/** Stories que j'ai aimées (parmi celles affichées) */
export async function fetchMyStoryLikes(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('story_likes').select('story_id').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.story_id);
}

export async function setStoryLike(storyId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('story_likes').insert({ story_id: storyId, user_id: userId })
    : await supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId);
  if (error && error.code !== '23505') throw error;
}

/** Qui a aimé ma story (propriétaire seulement, RLS) */
export async function fetchStoryLikers(storyId: string): Promise<string[]> {
  const { data, error } = await supabase.from('story_likes').select('user_id').eq('story_id', storyId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id);
}

/** Réponse à une story : message privé à son auteur, avec la légende en rappel */
export async function replyToStory(userId: string, story: { ownerId: string; caption: string | null }, text: string) {
  const body = text.trim();
  if (!body) return null;
  const conversationId = await openDirectConversation(story.ownerId);
  const quote = story.caption ? ` « ${story.caption.slice(0, 60)} »` : '';
  await sendMessage(userId, conversationId, `↩️ Réponse à ta story${quote} : ${body}`.slice(0, 2000));
  return conversationId;
}
