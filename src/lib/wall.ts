import { photoUrl, uploadPhoto } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export type WallPhoto = {
  id: string;
  ownerId: string;
  /** Chemin dans le bucket (null pour les photos de démo, qui ont directement une URL) */
  path: string | null;
  url: string;
  caption: string | null;
  createdAt: string;
  author?: { username: string; avatarUrl: string };
};

export type ProfileStats = { photos: number; friends: number; rides: number };

type Row = {
  id: string;
  owner_id: string;
  path: string;
  caption: string | null;
  created_at: string;
  owner?: { username: string; avatar_path: string } | null;
};

function toPhoto(r: Row): WallPhoto {
  return {
    id: r.id,
    ownerId: r.owner_id,
    path: r.path,
    url: photoUrl(r.path),
    caption: r.caption,
    createdAt: r.created_at,
    author: r.owner ? { username: r.owner.username, avatarUrl: photoUrl(r.owner.avatar_path) } : undefined,
  };
}

export async function fetchWallPhotos(ownerId: string): Promise<WallPhoto[]> {
  const { data, error } = await supabase
    .from('wall_photos')
    .select('id, owner_id, path, caption, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toPhoto);
}

/** Dernières photos d'une liste de motards (fil d'actualité). */
export async function fetchPhotosOf(ownerIds: string[], limit = 60): Promise<WallPhoto[]> {
  if (!ownerIds.length) return [];
  const { data, error } = await supabase
    .from('wall_photos')
    .select('id, owner_id, path, caption, created_at, owner:profiles(username, avatar_path)')
    .in('owner_id', ownerIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toPhoto);
}

export async function addWallPhoto(userId: string, image: { uri: string; mimeType?: string }, caption: string) {
  const path = await uploadPhoto(userId, 'wall', { path: null, localUri: image.uri, mimeType: image.mimeType });
  const { error } = await supabase
    .from('wall_photos')
    .insert({ owner_id: userId, path, caption: caption.trim() || null });
  if (error) {
    await supabase.storage.from('photos').remove([path]);
    throw error;
  }
}

export async function deleteWallPhoto(photo: WallPhoto) {
  const { error } = await supabase.from('wall_photos').delete().eq('id', photo.id);
  if (error) throw error;
  // Fichier supprimé ensuite : pas bloquant si ça échoue
  if (photo.path) await supabase.storage.from('photos').remove([photo.path]);
}

export async function setCoverPhoto(userId: string, image: { uri: string; mimeType?: string }, previous: string | null) {
  const path = await uploadPhoto(userId, 'cover', { path: null, localUri: image.uri, mimeType: image.mimeType });
  const { error } = await supabase.from('profiles').update({ cover_path: path }).eq('id', userId);
  if (error) throw error;
  if (previous) await supabase.storage.from('photos').remove([previous]);
}

export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  const { data, error } = await supabase.rpc('profile_stats', { target: userId }).single();
  if (error) throw error;
  const row = data as { photos: number; friends: number; rides: number };
  return { photos: row.photos, friends: row.friends, rides: row.rides };
}
