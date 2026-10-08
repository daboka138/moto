import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// « J'aime » et commentaires des photos du mur. Lecture filtrée par le serveur (RLS) :
// rien entre deux membres qui se sont bloqués. Photos de démo (id « demo-… ») : rien côté serveur.

export type PhotoSocial = { likes: number; likedByMe: boolean; comments: number };

export type PhotoComment = {
  id: string;
  authorId: string;
  username: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
};

export const COMMENT_MAX_LENGTH = 500;

const isDemo = (photoId: string) => photoId.startsWith('demo-');

export async function fetchPhotoSocial(photoId: string, userId: string): Promise<PhotoSocial> {
  if (isDemo(photoId)) return { likes: 0, likedByMe: false, comments: 0 };
  const [likes, comments] = await Promise.all([
    supabase.from('wall_photo_likes').select('user_id').eq('photo_id', photoId),
    supabase.from('wall_photo_comments').select('id', { count: 'exact', head: true }).eq('photo_id', photoId),
  ]);
  if (likes.error) throw likes.error;
  if (comments.error) throw comments.error;
  return {
    likes: likes.data.length,
    likedByMe: likes.data.some((l) => l.user_id === userId),
    comments: comments.count ?? 0,
  };
}

export async function setPhotoLike(photoId: string, userId: string, liked: boolean) {
  if (isDemo(photoId)) return;
  const { error } = liked
    ? await supabase.from('wall_photo_likes').insert({ photo_id: photoId, user_id: userId })
    : await supabase.from('wall_photo_likes').delete().eq('photo_id', photoId).eq('user_id', userId);
  // Déjà aimée (double appui) : rien à faire
  if (error && error.code !== '23505') throw error;
}

type CommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { username: string; avatar_path: string } | null;
};

export async function fetchComments(photoId: string): Promise<PhotoComment[]> {
  if (isDemo(photoId)) return [];
  const { data, error } = await supabase
    .from('wall_photo_comments')
    .select('id, author_id, body, created_at, author:profiles(username, avatar_path)')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as CommentRow[]).map((r) => ({
    id: r.id,
    authorId: r.author_id,
    username: r.author?.username ?? 'motard',
    avatarUrl: photoUrl(r.author?.avatar_path ?? ''),
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addComment(photoId: string, userId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  if (isDemo(photoId)) throw new Error('Pas de commentaire sur les photos de démonstration.');
  const { error } = await supabase
    .from('wall_photo_comments')
    .insert({ photo_id: photoId, author_id: userId, body: text.slice(0, COMMENT_MAX_LENGTH) });
  if (error)
    throw new Error(
      error.message.includes('row-level security') ? 'Tu ne peux pas commenter cette photo.' : error.message,
    );
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from('wall_photo_comments').delete().eq('id', commentId);
  if (error) throw error;
}
