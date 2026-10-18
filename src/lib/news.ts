import { useSyncExternalStore } from 'react';

import { COMMENT_MAX, type Comment, type LikeSummary } from '@/lib/social';
import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// « Actu moto » dans le Mur : articles des flux RSS récupérés par le serveur (Edge Function
// fetch-news, toutes les 3 h). On n'affiche que le titre, 1-2 phrases du résumé du flux, la
// source, la date, et « Lire l'article » ouvre le site d'origine. Jamais le texte de l'article.

export type NewsItem = {
  id: string;
  sourceName: string;
  siteUrl: string | null;
  url: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  /** Taille réelle de l'image (mesurée par le serveur), null si inconnue */
  imageWidth: number | null;
  imageHeight: number | null;
  publishedAt: string;
  likes: number;
  likedByMe: boolean;
  comments: number;
};

type NewsRow = {
  id: string;
  source_name: string;
  site_url: string | null;
  url: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  published_at: string;
  likes: number;
  liked_by_me: boolean;
  comments: number;
};

const toNews = (r: NewsRow): NewsItem => ({
  id: r.id,
  sourceName: r.source_name,
  siteUrl: r.site_url,
  url: r.url,
  title: r.title,
  summary: r.summary,
  imageUrl: r.image_url,
  imageWidth: r.image_width ?? null,
  imageHeight: r.image_height ?? null,
  publishedAt: r.published_at,
  likes: Number(r.likes),
  likedByMe: r.liked_by_me,
  comments: Number(r.comments),
});

/** En dessous de 600 px de large, une image étirée en pleine largeur serait pixelisée : vignette */
export const NEWS_LARGE_IMAGE_MIN = 600;

/** Grande image (≥ 600 px), vignette à côté du titre (petite ou taille inconnue), ou rien */
export function newsImageMode(n: Pick<NewsItem, 'imageUrl' | 'imageWidth'>): 'large' | 'thumb' | 'none' {
  if (!n.imageUrl) return 'none';
  return n.imageWidth && n.imageWidth >= NEWS_LARGE_IMAGE_MIN ? 'large' : 'thumb';
}

/** Proportions de la grande image : jamais plus haute que du 16:9 (recadrée, object-fit cover) */
export function newsImageRatio(n: Pick<NewsItem, 'imageWidth' | 'imageHeight'>): number {
  return n.imageWidth && n.imageHeight ? Math.max(n.imageWidth / n.imageHeight, 16 / 9) : 16 / 9;
}

/** Dernières actus (14 jours), les plus récentes d'abord */
export async function fetchNews(limit = 30): Promise<NewsItem[]> {
  const { data, error } = await supabase.rpc('news_feed', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as NewsRow[]).map(toNews);
}

export async function fetchNewsItem(id: string): Promise<NewsItem | null> {
  const list = await fetchNews(100);
  return list.find((n) => n.id === id) ?? null;
}

/** Actus du jour d'abord quand le Mur est vide, puis les plus récentes */
export function sortNewsForEmptyWall(list: NewsItem[], now = new Date()): NewsItem[] {
  const today = now.toDateString();
  const isToday = (n: NewsItem) => new Date(n.publishedAt).toDateString() === today;
  return [...list.filter(isToday), ...list.filter((n) => !isToday(n))];
}

export async function setNewsLike(newsId: string, userId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('news_likes').insert({ news_id: newsId, user_id: userId })
    : await supabase.from('news_likes').delete().eq('news_id', newsId).eq('user_id', userId);
  if (error && error.code !== '23505') throw error;
}

export async function fetchNewsLikes(newsId: string, userId: string): Promise<LikeSummary> {
  const { data, error } = await supabase.from('news_likes').select('user_id').eq('news_id', newsId);
  if (error) throw error;
  return { likes: data.length, likedByMe: data.some((l) => l.user_id === userId) };
}

type CommentRow = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { username: string; avatar_path: string } | null;
};

export async function fetchNewsComments(newsId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('news_comments')
    .select('id, author_id, body, created_at, author:profiles(username, avatar_path)')
    .eq('news_id', newsId)
    .order('created_at')
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

export async function addNewsComment(newsId: string, userId: string, body: string) {
  const text = body.trim().slice(0, COMMENT_MAX);
  if (!text) return;
  const { error } = await supabase.from('news_comments').insert({ news_id: newsId, author_id: userId, body: text });
  if (error) throw error;
}

export async function deleteNewsComment(id: string) {
  const { error } = await supabase.from('news_comments').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Réglage « Afficher les actus moto » (sur l'appareil, activé par défaut) ----------

const KEY = 'moto.feed.news';
const listeners = new Set<() => void>();

function readShowNews(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setShowNews(show: boolean) {
  try {
    localStorage.setItem(KEY, show ? 'on' : 'off');
  } catch {
    // pas grave : le choix ne sera pas mémorisé
  }
  listeners.forEach((l) => l());
}

export function useShowNews(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readShowNews,
    readShowNews,
  );
}

// ---------- Console admin ----------

export type NewsSource = {
  id: string;
  name: string;
  feedUrl: string;
  siteUrl: string | null;
  enabled: boolean;
  lastFetchAt: string | null;
  lastStatus: string | null;
  lastNew: number | null;
};

export async function fetchNewsSources(): Promise<NewsSource[]> {
  const { data, error } = await supabase
    .from('news_sources')
    .select('id, name, feed_url, site_url, enabled, last_fetch_at, last_status, last_new')
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    feedUrl: s.feed_url,
    siteUrl: s.site_url,
    enabled: s.enabled,
    lastFetchAt: s.last_fetch_at,
    lastStatus: s.last_status,
    lastNew: s.last_new,
  }));
}

export async function setNewsSourceEnabled(id: string, enabled: boolean) {
  const { error } = await supabase.from('news_sources').update({ enabled }).eq('id', id);
  if (error) throw error;
}

export async function addNewsSource(name: string, feedUrl: string) {
  const url = feedUrl.trim();
  if (!/^https?:\/\//.test(url)) throw new Error('L’adresse du flux doit commencer par https://');
  let siteUrl: string | null = null;
  try {
    siteUrl = new URL(url).origin;
  } catch {
    throw new Error('Adresse du flux invalide');
  }
  const { error } = await supabase
    .from('news_sources')
    .insert({ name: name.trim(), feed_url: url, site_url: siteUrl, sort_order: 100 });
  if (error) throw new Error(error.code === '23505' ? 'Ce flux est déjà dans la liste.' : error.message);
}

export type AdminNews = { id: string; title: string; sourceName: string; publishedAt: string; hidden: boolean };

export async function fetchAdminNews(): Promise<AdminNews[]> {
  const { data, error } = await supabase
    .from('news_items')
    .select('id, title, published_at, hidden_at, source:news_sources(name)')
    .order('published_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return ((data ?? []) as unknown as {
    id: string;
    title: string;
    published_at: string;
    hidden_at: string | null;
    source: { name: string } | null;
  }[]).map((n) => ({
    id: n.id,
    title: n.title,
    sourceName: n.source?.name ?? '',
    publishedAt: n.published_at,
    hidden: !!n.hidden_at,
  }));
}

export async function setNewsHidden(id: string, hidden: boolean) {
  const { error } = await supabase
    .from('news_items')
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/** Récupération immédiate (admin) : renvoie le compte rendu par source */
export async function fetchNewsNow(): Promise<Record<string, string>> {
  const { data, error } = await supabase.functions.invoke('fetch-news', { body: {} });
  if (error) throw error;
  return (data?.sources ?? {}) as Record<string, string>;
}
