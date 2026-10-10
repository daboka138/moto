import type { LatLng } from '@/lib/geo';
import { photoUrl, uploadPhoto, type PhotoValue } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Lieux motards communautaires : cafés et restos bikers, garages moto, points de vue, routes à faire.
// Chaque membre peut ajouter un lieu (avec photo) et donner une note + un avis par lieu.
// Lecture filtrée par le serveur (RLS) : rien entre deux membres qui se sont bloqués.

export type PlaceKind = 'biker_cafe' | 'garage' | 'viewpoint' | 'road';

export const PLACE_KINDS: { value: PlaceKind; label: string; short: string; emoji: string }[] = [
  { value: 'biker_cafe', label: 'Café / resto biker', short: 'Café biker', emoji: '☕' },
  { value: 'garage', label: 'Garage moto', short: 'Garage', emoji: '🔧' },
  { value: 'viewpoint', label: 'Point de vue', short: 'Point de vue', emoji: '📸' },
  { value: 'road', label: 'Route à faire', short: 'Route', emoji: '🛣️' },
];

export const placeKindInfo = (k: PlaceKind) => PLACE_KINDS.find((x) => x.value === k)!;

export type CommunityPlace = LatLng & {
  id: string;
  kind: PlaceKind;
  name: string;
  description: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  createdBy: string;
  creatorName: string;
  rating: number | null;
  reviewsCount: number;
  isDemo?: boolean;
};

export type PlaceReview = {
  id: string;
  authorId: string;
  username: string;
  avatarUrl: string;
  rating: number;
  body: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  createdAt: string;
};

type PlaceRow = {
  id: string;
  kind: PlaceKind;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  photo_path: string | null;
  created_by: string;
  creator: { username: string } | null;
  reviews: { rating: number }[];
};

const FIELDS = 'id, kind, name, description, latitude, longitude, photo_path, created_by, creator:profiles!places_created_by_fkey(username), reviews:place_reviews(rating)';

function toPlace(r: PlaceRow): CommunityPlace {
  const ratings = r.reviews.map((x) => x.rating);
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    latitude: r.latitude,
    longitude: r.longitude,
    photoPath: r.photo_path,
    photoUrl: r.photo_path ? photoUrl(r.photo_path) : null,
    createdBy: r.created_by,
    creatorName: r.creator?.username ?? 'motard',
    rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    reviewsCount: ratings.length,
  };
}

/** Lieux dans un rayon approximatif (carré) autour d'un point */
export async function fetchPlacesAround(center: LatLng, radiusKm = 80): Promise<CommunityPlace[]> {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));
  const { data, error } = await supabase
    .from('places')
    .select(FIELDS)
    .gte('latitude', center.latitude - dLat)
    .lte('latitude', center.latitude + dLat)
    .gte('longitude', center.longitude - dLng)
    .lte('longitude', center.longitude + dLng)
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as PlaceRow[]).map(toPlace);
}

export async function fetchPlace(id: string): Promise<CommunityPlace | null> {
  const { data, error } = await supabase.from('places').select(FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toPlace(data as unknown as PlaceRow) : null;
}

type ReviewRow = {
  id: string;
  author_id: string;
  rating: number;
  body: string | null;
  photo_path: string | null;
  created_at: string;
  author: { username: string; avatar_path: string } | null;
};

export async function fetchReviews(placeId: string): Promise<PlaceReview[]> {
  const { data, error } = await supabase
    .from('place_reviews')
    .select('id, author_id, rating, body, photo_path, created_at, author:profiles(username, avatar_path)')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as ReviewRow[]).map((r) => ({
    id: r.id,
    authorId: r.author_id,
    username: r.author?.username ?? 'motard',
    avatarUrl: photoUrl(r.author?.avatar_path ?? ''),
    rating: r.rating,
    body: r.body,
    photoPath: r.photo_path,
    photoUrl: r.photo_path ? photoUrl(r.photo_path) : null,
    createdAt: r.created_at,
  }));
}

export type PlaceDraft = LatLng & { kind: PlaceKind; name: string; description: string; photo: PhotoValue };

export async function createPlace(userId: string, d: PlaceDraft): Promise<string> {
  const photoPath = d.photo.localUri ? await uploadPhoto(userId, 'place', d.photo) : null;
  const { data, error } = await supabase
    .from('places')
    .insert({
      created_by: userId,
      kind: d.kind,
      name: d.name.trim(),
      description: d.description.trim() || null,
      latitude: d.latitude,
      longitude: d.longitude,
      photo_path: photoPath,
    })
    .select('id')
    .single();
  if (error) {
    if (photoPath) await supabase.storage.from('photos').remove([photoPath]);
    throw new Error(error.message);
  }
  return data.id;
}

export async function deletePlace(place: CommunityPlace, reviews: PlaceReview[]) {
  const { error } = await supabase.from('places').delete().eq('id', place.id);
  if (error) throw error;
  // Photos du lieu et des avis (les miennes seulement : le stockage n'autorise que mon dossier)
  const paths = [place.photoPath, ...reviews.map((r) => r.photoPath)].filter((p): p is string => !!p && p.startsWith(`${place.createdBy}/`));
  if (paths.length) await supabase.storage.from('photos').remove(paths);
}

/** Mon avis (créé ou remplacé) */
export async function saveReview(
  userId: string,
  placeId: string,
  r: { rating: number; body: string; photo: PhotoValue | null; previousPhotoPath: string | null },
) {
  let photoPath = r.photo?.path ?? null;
  if (r.photo?.localUri) photoPath = await uploadPhoto(userId, 'review', r.photo);
  const { error } = await supabase.from('place_reviews').upsert(
    { place_id: placeId, author_id: userId, rating: r.rating, body: r.body.trim() || null, photo_path: photoPath },
    { onConflict: 'place_id,author_id' },
  );
  if (error) throw new Error(error.message);
  if (r.previousPhotoPath && r.previousPhotoPath !== photoPath) await supabase.storage.from('photos').remove([r.previousPhotoPath]);
}

export async function deleteReview(review: PlaceReview, userId: string) {
  const { error } = await supabase.from('place_reviews').delete().eq('id', review.id);
  if (error) throw error;
  if (review.photoPath && review.authorId === userId) await supabase.storage.from('photos').remove([review.photoPath]);
}

export function stars(rating: number) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
