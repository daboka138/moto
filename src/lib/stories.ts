import { File } from 'expo-file-system';

import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Stories 24 h. Le serveur ne renvoie que les stories actives que j'ai le droit
// de voir (RLS) ; les fichiers sont dans un bucket privé, lus par URL signée.

export type StoryVisibility = 'friends' | 'everyone';

export type Story = {
  id: string;
  ownerId: string;
  username: string;
  avatarUrl: string;
  mediaType: 'image' | 'video';
  mediaPath: string | null;
  /** URL lisible (signée pour les vraies stories) */
  url: string;
  durationS: number | null;
  caption: string | null;
  visibility: StoryVisibility;
  createdAt: string;
  isDemo?: boolean;
};

/** Stories d'un même motard, dans l'ordre de publication */
export type StoryGroup = { ownerId: string; username: string; avatarUrl: string; stories: Story[]; isDemo?: boolean };

const BUCKET = 'stories';
const SIGNED_URL_TTL_S = 3600;
export const IMAGE_STORY_MS = 5000;
export const MAX_VIDEO_S = 30;

type Row = {
  id: string;
  owner_id: string;
  media_path: string;
  media_type: 'image' | 'video';
  duration_s: number | null;
  caption: string | null;
  visibility: StoryVisibility;
  created_at: string;
  owner: { username: string; avatar_path: string } | null;
};

export async function fetchStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('id, owner_id, media_path, media_type, duration_s, caption, visibility, created_at, owner:profiles!stories_owner_id_fkey(username, avatar_path)')
    .order('created_at');
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      rows.map((r) => r.media_path),
      SIGNED_URL_TTL_S,
    );
  if (signError) throw signError;
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows
    .filter((r) => urls.get(r.media_path))
    .map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      username: r.owner?.username ?? '?',
      avatarUrl: r.owner ? photoUrl(r.owner.avatar_path) : '',
      mediaType: r.media_type,
      mediaPath: r.media_path,
      url: urls.get(r.media_path)!,
      durationS: r.duration_s,
      caption: r.caption,
      visibility: r.visibility,
      createdAt: r.created_at,
    }));
}

/** Regroupe par motard : moi d'abord, puis les non vues, puis les vues (plus récentes d'abord). */
export function groupStories(stories: Story[], meId: string | undefined, viewed: Set<string>): StoryGroup[] {
  const groups = new Map<string, StoryGroup>();
  for (const s of stories) {
    const g = groups.get(s.ownerId) ?? { ownerId: s.ownerId, username: s.username, avatarUrl: s.avatarUrl, stories: [], isDemo: s.isDemo };
    g.stories.push(s);
    groups.set(s.ownerId, g);
  }
  const allSeen = (g: StoryGroup) => g.stories.every((s) => viewed.has(s.id));
  const latest = (g: StoryGroup) => g.stories[g.stories.length - 1].createdAt;
  return [...groups.values()].sort((a, b) => {
    if (a.ownerId === meId) return -1;
    if (b.ownerId === meId) return 1;
    if (allSeen(a) !== allSeen(b)) return allSeen(a) ? 1 : -1;
    return latest(b).localeCompare(latest(a));
  });
}

export async function fetchViewedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('story_views').select('story_id').eq('viewer_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.story_id);
}

export async function markStoryViewed(userId: string, storyId: string) {
  const { error } = await supabase.from('story_views').insert({ story_id: storyId, viewer_id: userId });
  if (error && error.code !== '23505') throw error;
}

export type StoryViewer = { id: string; username: string; avatarUrl: string; viewedAt: string };

export async function fetchStoryViewers(storyId: string): Promise<StoryViewer[]> {
  const { data, error } = await supabase
    .from('story_views')
    .select('viewer_id, viewed_at, viewer:profiles(username, avatar_path)')
    .eq('story_id', storyId)
    .order('viewed_at', { ascending: false });
  if (error) throw error;
  type V = { viewer_id: string; viewed_at: string; viewer: { username: string; avatar_path: string } | null };
  return ((data ?? []) as unknown as V[]).map((v) => ({
    id: v.viewer_id,
    username: v.viewer?.username ?? '?',
    avatarUrl: v.viewer ? photoUrl(v.viewer.avatar_path) : '',
    viewedAt: v.viewed_at,
  }));
}

export async function publishStory(
  userId: string,
  media: { uri: string; mimeType?: string; type: 'image' | 'video'; durationS: number | null },
  caption: string,
  visibility: StoryVisibility,
) {
  const contentType = media.mimeType ?? (media.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') ?? 'jpg';
  const path = `${userId}/story-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const bytes = await new File(media.uri).arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (uploadError) throw new Error(`Envoi impossible : ${uploadError.message}`);
  const { error } = await supabase.from('stories').insert({
    owner_id: userId,
    media_path: path,
    media_type: media.type,
    duration_s: media.type === 'video' ? Math.min(media.durationS ?? MAX_VIDEO_S, MAX_VIDEO_S) : null,
    caption: caption.trim() || null,
    visibility,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export async function deleteStory(story: Story) {
  const { error } = await supabase.from('stories').delete().eq('id', story.id);
  if (error) throw error;
  if (story.mediaPath) await supabase.storage.from(BUCKET).remove([story.mediaPath]);
}
