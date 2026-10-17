import { useEffect, useState } from 'react';

import type { PickedImage } from '@/lib/pick-image';
import { readFileBytes } from '@/lib/read-file';
import { supabase } from '@/lib/supabase';

// « Histoire de la moto » (note 22) : chapitres et fiches des marques, stockés en base (tables history_*)
// pour être corrigés sans mise à jour de l'app (Console › Histoire). Images libres (Wikimedia Commons)
// dans le bucket public `history`, avec auteur et licence affichés sous chaque image.

const BUCKET = 'history';

export type HistoryImage = {
  id: string;
  path: string;
  url: string;
  caption: string | null;
  author: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string | null;
  sortOrder: number;
  brandId: string | null;
  chapterId: string | null;
};

export type TimelineItem = { year: string; text: string };
export type HistoryModel = { name: string; year: string; text: string };

export type HistoryChapter = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  timeline: TimelineItem[];
  sortOrder: number;
  hidden: boolean;
  images: HistoryImage[];
};

export type HistoryBrand = {
  id: string;
  slug: string;
  name: string;
  country: string;
  foundedYear: number | null;
  foundedPlace: string | null;
  founders: string | null;
  tagline: string | null;
  body: string;
  timeline: TimelineItem[];
  models: HistoryModel[];
  anecdotes: string[];
  today: string | null;
  sortOrder: number;
  hidden: boolean;
  images: HistoryImage[];
};

/** Pays des marques (ISO 3166-1 alpha-2) */
export const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Autriche',
  CN: 'Chine',
  CZ: 'Tchéquie',
  DE: 'Allemagne',
  ES: 'Espagne',
  FR: 'France',
  GB: 'Royaume-Uni',
  IN: 'Inde',
  IT: 'Italie',
  JP: 'Japon',
  SE: 'Suède',
  US: 'États-Unis',
};

export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

export function historyImageUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Temps de lecture (≈ 200 mots par minute) */
export function readingMinutes(...texts: (string | null | undefined)[]) {
  const words = texts.reduce((a, t) => a + (t ? t.split(/\s+/).filter(Boolean).length : 0), 0);
  return Math.max(1, Math.round(words / 200));
}

/** Texte d'une fiche : blocs « ## intertitre » et paragraphes (séparés par une ligne vide) */
export function bodyBlocks(body: string): { kind: 'title' | 'text'; text: string }[] {
  return body
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => (b.startsWith('## ') ? { kind: 'title' as const, text: b.slice(3).trim() } : { kind: 'text' as const, text: b }));
}

type ImageRow = {
  id: string;
  path: string;
  caption: string | null;
  author: string;
  license: string;
  license_url: string | null;
  source_url: string | null;
  sort_order: number;
  brand_id: string | null;
  chapter_id: string | null;
};

const IMAGE_FIELDS = 'id, path, caption, author, license, license_url, source_url, sort_order, brand_id, chapter_id';

const toImage = (r: ImageRow): HistoryImage => ({
  id: r.id,
  path: r.path,
  url: historyImageUrl(r.path),
  caption: r.caption,
  author: r.author,
  license: r.license,
  licenseUrl: r.license_url,
  sourceUrl: r.source_url,
  sortOrder: r.sort_order,
  brandId: r.brand_id,
  chapterId: r.chapter_id,
});

type ChapterRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  timeline: TimelineItem[];
  sort_order: number;
  hidden_at: string | null;
};

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  country: string;
  founded_year: number | null;
  founded_place: string | null;
  founders: string | null;
  tagline: string | null;
  body: string;
  timeline: TimelineItem[];
  models: HistoryModel[];
  anecdotes: string[];
  today: string | null;
  sort_order: number;
  hidden_at: string | null;
};

const toChapter = (r: ChapterRow, images: HistoryImage[]): HistoryChapter => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  subtitle: r.subtitle,
  body: r.body ?? '',
  timeline: r.timeline ?? [],
  sortOrder: r.sort_order,
  hidden: !!r.hidden_at,
  images: images.filter((i) => i.chapterId === r.id),
});

const toBrand = (r: BrandRow, images: HistoryImage[]): HistoryBrand => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  country: r.country,
  foundedYear: r.founded_year,
  foundedPlace: r.founded_place,
  founders: r.founders,
  tagline: r.tagline,
  body: r.body ?? '',
  timeline: r.timeline ?? [],
  models: r.models ?? [],
  anecdotes: r.anecdotes ?? [],
  today: r.today,
  sortOrder: r.sort_order,
  hidden: !!r.hidden_at,
  images: images.filter((i) => i.brandId === r.id),
});

export type HistoryIndex = { chapters: HistoryChapter[]; brands: HistoryBrand[] };

let cachedIndex: HistoryIndex | null = null;

/** Tout le contenu (chapitres, marques, images). Masqués : visibles par l'admin seulement (RLS). */
export async function fetchHistoryIndex(): Promise<HistoryIndex> {
  const [c, b, i] = await Promise.all([
    supabase.from('history_chapters').select('*').order('sort_order'),
    supabase.from('history_brands').select('*').order('sort_order'),
    supabase.from('history_images').select(IMAGE_FIELDS).order('sort_order'),
  ]);
  const error = c.error ?? b.error ?? i.error;
  if (error) throw error;
  const images = ((i.data ?? []) as ImageRow[]).map(toImage);
  cachedIndex = {
    chapters: ((c.data ?? []) as ChapterRow[]).map((r) => toChapter(r, images)),
    brands: ((b.data ?? []) as BrandRow[]).map((r) => toBrand(r, images)),
  };
  return cachedIndex;
}

/** Contenu (cache de la dernière lecture affiché tout de suite, puis rafraîchi) */
export function useHistoryIndex() {
  const [data, setData] = useState<HistoryIndex | null>(cachedIndex);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchHistoryIndex()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

// ---------- Console › Histoire (admin seulement, vérifié par RLS) ----------

export type BrandDraft = Omit<HistoryBrand, 'id' | 'images' | 'hidden'> & { id?: string };
export type ChapterDraft = Omit<HistoryChapter, 'id' | 'images' | 'hidden'> & { id?: string };

export async function saveBrand(d: BrandDraft): Promise<string> {
  const row = {
    slug: d.slug,
    name: d.name.trim(),
    country: d.country.toUpperCase(),
    founded_year: d.foundedYear,
    founded_place: d.foundedPlace?.trim() || null,
    founders: d.founders?.trim() || null,
    tagline: d.tagline?.trim() || null,
    body: d.body,
    timeline: d.timeline,
    models: d.models,
    anecdotes: d.anecdotes,
    today: d.today?.trim() || null,
    sort_order: d.sortOrder,
  };
  const q = d.id
    ? supabase.from('history_brands').update(row).eq('id', d.id).select('id').single()
    : supabase.from('history_brands').insert(row).select('id').single();
  const { data, error } = await q;
  if (error) throw error;
  return data.id;
}

export async function saveChapter(d: ChapterDraft): Promise<string> {
  const row = { slug: d.slug, title: d.title.trim(), subtitle: d.subtitle?.trim() || null, body: d.body, timeline: d.timeline, sort_order: d.sortOrder };
  const q = d.id
    ? supabase.from('history_chapters').update(row).eq('id', d.id).select('id').single()
    : supabase.from('history_chapters').insert(row).select('id').single();
  const { data, error } = await q;
  if (error) throw error;
  return data.id;
}

export async function setHistoryHidden(table: 'history_brands' | 'history_chapters', id: string, hidden: boolean) {
  const { error } = await supabase
    .from(table)
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export type ImageDraft = {
  id?: string;
  owner: { brandId: string } | { chapterId: string };
  caption: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  sortOrder: number;
};

/** Ajoute / modifie une image (photo choisie envoyée dans le bucket history si fournie) */
export async function saveHistoryImage(d: ImageDraft, photo: PickedImage | null) {
  let path: string | undefined;
  if (photo) {
    const contentType = photo.mimeType ?? 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    path = `upload-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const bytes = await readFileBytes(photo.uri);
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
    if (error) throw new Error(`Envoi de l’image impossible : ${error.message}`);
  }
  const row = {
    ...('brandId' in d.owner ? { brand_id: d.owner.brandId, chapter_id: null } : { chapter_id: d.owner.chapterId, brand_id: null }),
    caption: d.caption.trim() || null,
    author: d.author.trim(),
    license: d.license.trim(),
    license_url: d.licenseUrl.trim() || null,
    source_url: d.sourceUrl.trim() || null,
    sort_order: d.sortOrder,
    ...(path ? { path } : {}),
  };
  const { error } = d.id
    ? await supabase.from('history_images').update(row).eq('id', d.id)
    : await supabase.from('history_images').insert({ ...row, path: path! });
  if (error) throw error;
}

export async function deleteHistoryImage(image: HistoryImage) {
  const { error } = await supabase.from('history_images').delete().eq('id', image.id);
  if (error) throw error;
  // Fichier envoyé depuis la console : supprimé aussi (les images d'origine restent, elles ne coûtent rien)
  if (image.path.startsWith('upload-')) await supabase.storage.from(BUCKET).remove([image.path]);
}

/** Lignes « année | texte » ↔ frise */
export const timelineToText = (t: TimelineItem[]) => t.map((x) => `${x.year} | ${x.text}`).join('\n');
export const textToTimeline = (s: string): TimelineItem[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [year, ...rest] = l.split('|');
      return { year: year.trim(), text: rest.join('|').trim() };
    })
    .filter((x) => x.year && x.text);

/** Lignes « nom | année | texte » ↔ modèles */
export const modelsToText = (m: HistoryModel[]) => m.map((x) => `${x.name} | ${x.year} | ${x.text}`).join('\n');
export const textToModels = (s: string): HistoryModel[] =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, year, ...rest] = l.split('|');
      return { name: (name ?? '').trim(), year: (year ?? '').trim(), text: rest.join('|').trim() };
    })
    .filter((x) => x.name);

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
