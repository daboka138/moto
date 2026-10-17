import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { WallpaperPresets } from '@/constants/theme';
import { snapshotImage } from '@/lib/image-snapshot';
import { readFileBytes } from '@/lib/read-file';
import { supabase } from '@/lib/supabase';

// Fonds d'écran des conversations, PERSONNELS (comme WhatsApp) : chacun choisit le sien pour
// chaque conversation, l'autre ne le voit pas. Table chat_wallpapers (RLS : propriétaire seul),
// conversation_id null = toutes mes conversations. Photos : bucket PRIVÉ `wallpapers`
// (<user_id>/wp-….jpg), lues par URL signée.

export type WallpaperKind = 'preset' | 'color' | 'photo';
/** dim : assombrissement en % (0 à 85) */
export type Wallpaper = { kind: WallpaperKind; value: string; dim: number };

/** Assombrissement par défaut d'une photo (bulles lisibles) */
export const PHOTO_DEFAULT_DIM = 40;
export const MAX_DIM = 85;

const BUCKET = 'wallpapers';
const SIGNED_URL_S = 24 * 3600;

type Row = { conversation_id: string | null; kind: WallpaperKind; value: string; dim: number };

// ---------- Cache partagé (chargé une fois par compte) ----------
let rows: Row[] | null = null;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();
const signed = new Map<string, string>();

function setRows(next: Row[]) {
  rows = next;
  listeners.forEach((l) => l());
}

async function load(userId: string) {
  loadedFor = userId;
  const { data, error } = await supabase.from('chat_wallpapers').select('conversation_id, kind, value, dim').eq('user_id', userId);
  if (error) throw error;
  setRows((data ?? []) as Row[]);
}

function useRows(userId: string) {
  useEffect(() => {
    if (userId && loadedFor !== userId) load(userId).catch((e) => console.warn('Fonds d’écran indisponibles', e));
  }, [userId]);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (loadedFor === userId ? rows : null),
  );
}

const toWallpaper = (r: Row | undefined): Wallpaper | null => (r ? { kind: r.kind, value: r.value, dim: r.dim } : null);

/** Fond d'une conversation : le sien, sinon celui de « toutes mes conversations » */
export function useChatWallpaper(userId: string, conversationId: string) {
  const list = useRows(userId);
  const own = list?.find((r) => r.conversation_id === conversationId);
  const common = list?.find((r) => r.conversation_id === null);
  return {
    loaded: list !== null,
    wallpaper: toWallpaper(own ?? common),
    /** true : le fond vient de « toutes mes conversations » */
    inherited: !own && !!common,
  };
}

/** URL signée d'une photo de fond (mise en cache) */
export function useWallpaperPhotoUrl(path: string | null) {
  // URL signée reçue pour un chemin (le cache évite d'attendre au 2e affichage)
  const [fetched, setFetched] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path || signed.has(path)) return;
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_S)
      .then(({ data, error }) => {
        if (error || !data) throw error ?? new Error('URL indisponible');
        signed.set(path, data.signedUrl);
        if (!cancelled) setFetched({ path, url: data.signedUrl });
      })
      .catch((e) => console.warn('Photo de fond indisponible', e));
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!path) return null;
  return signed.get(path) ?? (fetched?.path === path ? fetched.url : null);
}

export function isValidWallpaper(w: Wallpaper) {
  if (w.kind === 'preset') return w.value in WallpaperPresets;
  if (w.kind === 'color') return /^#[0-9a-fA-F]{6}$/.test(w.value);
  return w.value.length > 0;
}

/**
 * Enregistre le fond d'une conversation (all : toutes mes conversations, les fonds propres à
 * chaque conversation sont retirés). null = réinitialiser. Les photos plus utilisées sont effacées.
 */
export async function saveChatWallpaper(userId: string, conversationId: string, wallpaper: Wallpaper | null, all: boolean) {
  const { error } = await supabase.rpc('set_chat_wallpaper', {
    p_conversation: all ? null : conversationId,
    p_kind: wallpaper?.kind ?? null,
    p_value: wallpaper?.value ?? null,
    p_dim: wallpaper ? Math.round(Math.min(MAX_DIM, Math.max(0, wallpaper.dim))) : 0,
    p_all: all,
  });
  if (error) throw new Error(error.message);
  await load(userId);
  cleanupPhotos(userId).catch((e) => console.warn('Nettoyage des fonds impossible', e));
}

/** Efface du stockage mes photos de fond qui ne servent plus */
async function cleanupPhotos(userId: string) {
  const used = new Set((rows ?? []).filter((r) => r.kind === 'photo').map((r) => r.value));
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error) throw error;
  const unused = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => !used.has(p));
  if (unused.length) await supabase.storage.from(BUCKET).remove(unused);
}

/**
 * Ma photo : choisie dans la galerie, recadrée au format écran, compressée (web : réduite à
 * 1600 px), puis envoyée dans mon dossier privé. Renvoie son chemin, null si annulé.
 */
export async function pickWallpaperPhoto(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [9, 16],
    quality: 0.5,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const image = await snapshotImage(asset.uri, asset.mimeType ?? undefined);
  const contentType = image.mimeType && ['image/png', 'image/webp'].includes(image.mimeType) ? image.mimeType : 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/wp-${Date.now()}.${ext}`;
  const bytes = await readFileBytes(image.uri);
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (error) throw new Error(error.message.includes('size') ? 'Photo trop lourde (5 Mo maximum).' : error.message);
  return path;
}
