import { useEffect, useState } from 'react';

import { A_PROPOS } from '@/guide/contenu';
import { photoUrl, uploadPhoto } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// « Qui est derrière l'appli » (Profil › À propos, et passeryder.fr/createur).
// La photo du créateur est choisie dans la console (app_settings.creator_photo_path, public) ;
// en attendant, le logo.

export const ABOUT_NAME = A_PROPOS.nom;
export const ABOUT_ROLE = A_PROPOS.role;
export const ABOUT_TEXT = A_PROPOS.texte;

const PHOTO_KEY = 'creator_photo_path';

export async function fetchCreatorPhotoUrl(): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', PHOTO_KEY).maybeSingle();
  if (error) throw error;
  return data?.value ? photoUrl(data.value) : null;
}

export function useCreatorPhotoUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchCreatorPhotoUrl()
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return url;
}

/** Console : nouvelle photo (bucket public photos/<admin>/creator-…) */
export async function saveCreatorPhoto(userId: string, localUri: string, mimeType?: string) {
  const path = await uploadPhoto(userId, 'creator', { path: null, localUri, mimeType });
  const { error } = await supabase.from('app_settings').upsert({ key: PHOTO_KEY, value: path }, { onConflict: 'key' });
  if (error) throw error;
}

export async function removeCreatorPhoto() {
  // Pas de suppression dans app_settings : valeur vide = logo
  const { error } = await supabase.from('app_settings').upsert({ key: PHOTO_KEY, value: '' }, { onConflict: 'key' });
  if (error) throw error;
}
