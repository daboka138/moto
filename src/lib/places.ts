import { distanceM, type LatLng } from '@/lib/geo';
import { trackLengthM } from '@/lib/gpx';
import { photoUrl, uploadPhoto, type PhotoValue } from '@/lib/profile';
import { averageCriteria, decodeRoadLine, encodeRoadLine, midpoint, rankRoads, type RoadCriteria } from '@/lib/road-rules';
import { supabase } from '@/lib/supabase';

// Spots motards communautaires : cafés et restos motards, points de vue, belles routes, stations,
// garages / concessions, parkings moto. Chaque membre peut ajouter un spot (photo + note) et donner
// une note + un avis par spot. Lecture filtrée par le serveur (RLS) : rien entre deux membres qui se
// sont bloqués, et un spot (ou avis) signalé par 3 membres est masqué (sauf pour son auteur).
// Route plaisir = belle route (kind 'road') avec son tracé (line) : avis notés sur 4 critères
// (virages, revêtement, paysage, trafic), la note est leur moyenne (calculée par le serveur).

export type PlaceKind = 'biker_cafe' | 'viewpoint' | 'road' | 'fuel' | 'garage' | 'parking';

export const PLACE_KINDS: { value: PlaceKind; label: string; short: string; emoji: string }[] = [
  { value: 'biker_cafe', label: 'Café / resto motard', short: 'Café motard', emoji: '☕' },
  { value: 'viewpoint', label: 'Point de vue', short: 'Point de vue', emoji: '📸' },
  { value: 'road', label: 'Belle route', short: 'Belle route', emoji: '🛣️' },
  { value: 'fuel', label: 'Station essence', short: 'Station', emoji: '⛽' },
  { value: 'garage', label: 'Garage / concession', short: 'Garage', emoji: '🔧' },
  { value: 'parking', label: 'Parking moto', short: 'Parking', emoji: '🅿️' },
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
  /** Route plaisir : tracé de la portion notée (null pour un spot simple) */
  line: LatLng[] | null;
  lengthM: number | null;
  /** Moyenne de chaque critère (routes) */
  criteria: RoadCriteria | null;
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
  /** Critères d'une route (null pour un spot ou un ancien avis) */
  criteria: RoadCriteria | null;
  /** Photos en plus (routes) */
  morePhotos: { path: string; url: string }[];
  createdAt: string;
};

type Criteria = { curves: number | null; surface: number | null; scenery: number | null; traffic: number | null };

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
  route_line: unknown;
  route_length_m: number | null;
  reviews: ({ rating: number } & Criteria)[];
};

const FIELDS =
  'id, kind, name, description, latitude, longitude, photo_path, created_by, route_line, route_length_m, creator:profiles!places_created_by_fkey(username), reviews:place_reviews(rating, curves, surface, scenery, traffic)';

const toCriteria = (r: Criteria): RoadCriteria | null =>
  r.curves !== null && r.surface !== null && r.scenery !== null && r.traffic !== null
    ? { curves: r.curves, surface: r.surface, scenery: r.scenery, traffic: r.traffic }
    : null;

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
    line: r.kind === 'road' ? decodeRoadLine(r.route_line) : null,
    lengthM: r.route_length_m,
    criteria: averageCriteria(r.reviews.map((x) => toCriteria(x) ?? {})),
  };
}

/** Lieux dans un rayon approximatif (carré) autour d'un point */
export async function fetchPlacesAround(center: LatLng, radiusKm = 80, kinds?: PlaceKind[]): Promise<CommunityPlace[]> {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((center.latitude * Math.PI) / 180));
  let query = supabase
    .from('places')
    .select(FIELDS)
    .gte('latitude', center.latitude - dLat)
    .lte('latitude', center.latitude + dLat)
    .gte('longitude', center.longitude - dLng)
    .lte('longitude', center.longitude + dLng);
  if (kinds) query = query.in('kind', kinds);
  const { data, error } = await query.limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as PlaceRow[]).map(toPlace);
}

/** Spots pratiques pour donner rendez-vous (départ d'une boucle, RDV d'une balade) */
export const MEETING_KINDS: PlaceKind[] = ['biker_cafe', 'viewpoint', 'fuel', 'parking'];

/**
 * Départs populaires : les spots les mieux notés à moins de radiusKm (puis les plus commentés,
 * puis les plus proches). Par défaut cafés motards et points de vue.
 */
export async function fetchPopularSpots(
  center: LatLng,
  { radiusKm = 20, limit = 4, kinds = ['biker_cafe', 'viewpoint'] }: { radiusKm?: number; limit?: number; kinds?: PlaceKind[] } = {},
): Promise<CommunityPlace[]> {
  const list = await fetchPlacesAround(center, radiusKm);
  const dist = (p: LatLng) => distanceM(center, p);
  return list
    .filter((p) => kinds.includes(p.kind) && dist(p) <= radiusKm * 1000)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewsCount - a.reviewsCount || dist(a) - dist(b))
    .slice(0, limit);
}

/** Spot → lieu choisi (départ, RDV) : « ☕ Nom du café » */
export const spotAsPlace = (p: CommunityPlace) => ({
  label: `${placeKindInfo(p.kind).emoji} ${p.name}`,
  latitude: p.latitude,
  longitude: p.longitude,
});

/** Lieux par identifiants (résultats de recherche), dans l'ordre donné */
export async function fetchPlacesByIds(ids: string[]): Promise<CommunityPlace[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('places').select(FIELDS).in('id', ids);
  if (error) throw error;
  const places = ((data ?? []) as unknown as PlaceRow[]).map(toPlace);
  return ids.map((id) => places.find((p) => p.id === id)).filter((p): p is CommunityPlace => !!p);
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
  more_photos: string[] | null;
  created_at: string;
  author: { username: string; avatar_path: string } | null;
} & Criteria;

export async function fetchReviews(placeId: string): Promise<PlaceReview[]> {
  const { data, error } = await supabase
    .from('place_reviews')
    .select('id, author_id, rating, body, photo_path, more_photos, curves, surface, scenery, traffic, created_at, author:profiles(username, avatar_path)')
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
    criteria: toCriteria(r),
    morePhotos: (r.more_photos ?? []).map((path) => ({ path, url: photoUrl(path) })),
    createdAt: r.created_at,
  }));
}

export type PlaceDraft = LatLng & { kind: PlaceKind; name: string; description: string; photo: PhotoValue; rating: number };

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
  // Ma note du spot (premier avis)
  const { error: reviewError } = await supabase.from('place_reviews').insert({ place_id: data.id, author_id: userId, rating: d.rating });
  if (reviewError) console.warn('Note du spot non enregistrée', reviewError);
  return data.id;
}

export async function deletePlace(place: CommunityPlace, reviews: PlaceReview[]) {
  const { error } = await supabase.from('places').delete().eq('id', place.id);
  if (error) throw error;
  // Photos du lieu et des avis (les miennes seulement : le stockage n'autorise que mon dossier)
  const paths = [place.photoPath, ...reviews.flatMap((r) => reviewPhotos(r).map((p) => p.path))].filter(
    (p): p is string => !!p && p.startsWith(`${place.createdBy}/`),
  );
  if (paths.length) await supabase.storage.from('photos').remove(paths);
}

/** Mon avis (créé ou remplacé). Routes : critères (la note devient leur moyenne) et jusqu'à 4 photos. */
export async function saveReview(
  userId: string,
  placeId: string,
  r: { rating: number; body: string; photos: PhotoValue[]; previousPhotoPaths: string[]; criteria?: RoadCriteria | null },
) {
  // Photos gardées (déjà envoyées) ou nouvelles, dans l'ordre affiché
  const paths: string[] = [];
  for (const p of r.photos.slice(0, 4)) {
    if (p.localUri) paths.push(await uploadPhoto(userId, 'review', p));
    else if (p.path) paths.push(p.path);
  }
  const { error } = await supabase.from('place_reviews').upsert(
    {
      place_id: placeId,
      author_id: userId,
      rating: r.rating,
      body: r.body.trim() || null,
      photo_path: paths[0] ?? null,
      more_photos: paths.slice(1),
      curves: r.criteria?.curves ?? null,
      surface: r.criteria?.surface ?? null,
      scenery: r.criteria?.scenery ?? null,
      traffic: r.criteria?.traffic ?? null,
    },
    { onConflict: 'place_id,author_id' },
  );
  if (error) throw new Error(error.message);
  const removed = r.previousPhotoPaths.filter((p) => !paths.includes(p));
  if (removed.length) await supabase.storage.from('photos').remove(removed);
}

/** Toutes les photos d'un avis (la première d'abord) */
export const reviewPhotos = (r: PlaceReview) => [
  ...(r.photoPath && r.photoUrl ? [{ path: r.photoPath, url: r.photoUrl }] : []),
  ...r.morePhotos,
];

// ---------- Routes plaisir ----------

export type RoadDraft = {
  name: string;
  description: string;
  line: LatLng[];
  criteria: RoadCriteria;
  body: string;
  photos: PhotoValue[];
};

/** Nouvelle route plaisir : la portion (tracé simplifié) + mon avis noté */
export async function createRoad(userId: string, d: RoadDraft): Promise<string> {
  const mid = midpoint(d.line);
  const { data, error } = await supabase
    .from('places')
    .insert({
      created_by: userId,
      kind: 'road',
      name: d.name.trim(),
      description: d.description.trim() || null,
      latitude: mid.latitude,
      longitude: mid.longitude,
      route_line: encodeRoadLine(d.line),
      route_length_m: Math.round(trackLengthM(d.line)),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  await saveReview(userId, data.id, { rating: 3, body: d.body, photos: d.photos, previousPhotoPaths: [], criteria: d.criteria });
  return data.id;
}

export type RoadNearby = CommunityPlace & { line: LatLng[]; distanceM: number };

/** Top routes plaisir près d'un point (distance au point le plus proche du tracé) */
export async function fetchTopRoads(center: LatLng, radiusKm: number): Promise<RoadNearby[]> {
  const list = await fetchPlacesAround(center, radiusKm, ['road']);
  const roads = list
    .filter((p): p is CommunityPlace & { line: LatLng[] } => !!p.line)
    .map((p) => ({ ...p, distanceM: Math.min(...p.line.map((q) => distanceM(center, q))) }))
    .filter((p) => p.distanceM <= radiusKm * 1000);
  return rankRoads(roads);
}

// Tracé à noter, passé d'un écran à l'autre (boucle, sortie, trajet)
type PendingRoad = { line: LatLng[]; name?: string; description?: string };
let pendingRoad: PendingRoad | null = null;

export function setPendingRoad(data: PendingRoad | null) {
  pendingRoad = data;
}

/** Récupère (et retire) le tracé en attente */
export function takePendingRoad() {
  const data = pendingRoad;
  pendingRoad = null;
  return data;
}

export async function deleteReview(review: PlaceReview, userId: string) {
  const { error } = await supabase.from('place_reviews').delete().eq('id', review.id);
  if (error) throw error;
  const paths = reviewPhotos(review).map((p) => p.path);
  if (paths.length && review.authorId === userId) await supabase.storage.from('photos').remove(paths);
}

export function stars(rating: number) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
