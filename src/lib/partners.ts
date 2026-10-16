import { Linking } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

// Liens partenaires « Idées de balades » (articles, guides de routes…), gérés UNIQUEMENT dans la
// console admin. Lecture par tous (actifs seulement, RLS), compteur de clics anonyme (un nombre,
// aucune donnée sur qui clique) via record_partner_click.

export type PartnerLink = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  zoneLabel: string | null;
  /** Centre de la zone (null = partout) */
  zone: LatLng | null;
  zoneRadiusKm: number | null;
  active: boolean;
  sortOrder: number;
  clicks: number;
};

export type PartnerLinkDraft = Omit<PartnerLink, 'id' | 'clicks'> & { id?: string };

type Row = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  zone_label: string | null;
  zone_lat: number | null;
  zone_lng: number | null;
  zone_radius_km: number | null;
  active: boolean;
  sort_order: number;
  clicks: number;
};

const toLink = (r: Row): PartnerLink => ({
  id: r.id,
  title: r.title,
  description: r.description,
  url: r.url,
  imageUrl: r.image_url,
  zoneLabel: r.zone_label,
  zone: r.zone_lat != null && r.zone_lng != null ? { latitude: r.zone_lat, longitude: r.zone_lng } : null,
  zoneRadiusKm: r.zone_radius_km,
  active: r.active,
  sortOrder: r.sort_order,
  clicks: Number(r.clicks),
});

/** Tous les liens visibles (membre : actifs ; admin : tous), dans l'ordre de la console */
export async function fetchPartnerLinks(): Promise<PartnerLink[]> {
  const { data, error } = await supabase
    .from('partner_links')
    .select('id, title, description, url, image_url, zone_label, zone_lat, zone_lng, zone_radius_km, active, sort_order, clicks')
    .order('sort_order')
    .order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toLink);
}

/** Liens à proposer près d'un point : actifs, sans zone ou dont la zone le contient. Sans point : tous. */
export function linksNear(links: PartnerLink[], near: LatLng | null) {
  return links.filter(
    (l) => l.active && (!near || !l.zone || !l.zoneRadiusKm || distanceM(near, l.zone) <= l.zoneRadiusKm * 1000),
  );
}

/** Compte le clic (anonyme, sans attendre) et ouvre le lien dans le navigateur du téléphone */
export function openPartnerLink(link: PartnerLink) {
  supabase.rpc('record_partner_click', { p_id: link.id }).then(
    () => {},
    () => {},
  );
  Linking.openURL(link.url).catch(() => {});
}

// ---------- Console admin (écriture refusée aux autres par RLS) ----------

export async function savePartnerLink(d: PartnerLinkDraft) {
  const row = {
    title: d.title.trim(),
    description: d.description?.trim() || null,
    url: d.url.trim(),
    image_url: d.imageUrl?.trim() || null,
    zone_label: d.zoneLabel?.trim() || null,
    zone_lat: d.zone?.latitude ?? null,
    zone_lng: d.zone?.longitude ?? null,
    zone_radius_km: d.zone ? d.zoneRadiusKm : null,
    active: d.active,
    sort_order: d.sortOrder,
  };
  const { error } = d.id
    ? await supabase.from('partner_links').update(row).eq('id', d.id)
    : await supabase.from('partner_links').insert(row);
  if (error) throw new Error(error.message);
}

export async function deletePartnerLink(id: string) {
  const { error } = await supabase.from('partner_links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
