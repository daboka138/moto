import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

export const RIDING_STYLES = [
  { value: 'balade', label: 'Balade' },
  { value: 'sportive', label: 'Sportive' },
  { value: 'road_trip', label: 'Road trip' },
  { value: 'piste', label: 'Piste' },
  { value: 'off_road', label: 'Off-road' },
] as const;

export type RidingStyle = (typeof RIDING_STYLES)[number]['value'];

export const INTEREST_SUGGESTIONS = [
  'Mécanique',
  'Customisation',
  'Voyage',
  'Photo',
  'Circuit',
  'Rassemblements',
  'Vintage',
  'Enduro',
];

export type Motorcycle = {
  id: string;
  owner_id: string;
  brand: string;
  model: string;
  year: number | null;
  displacement_cc: number | null;
  color: string | null;
  photo_path: string | null;
  created_at: string;
};

/** Profil public : visible par tous les membres. Jamais de prénom ni de nom ici. */
export type Profile = {
  id: string;
  username: string;
  avatar_path: string;
  cover_path: string | null;
  bio: string | null;
  riding_styles: RidingStyle[];
  license_year: number | null;
  city: string | null;
  interests: string[];
  motorcycles: Motorcycle[];
};

/** Photo déjà stockée (path) ou fraîchement choisie sur le téléphone (localUri). */
export type PhotoValue = { path: string | null; localUri: string | null; mimeType?: string };

export type MotorcycleDraft = {
  key: string;
  id?: string;
  brand: string;
  model: string;
  year: string;
  displacement: string;
  color: string;
  photo: PhotoValue;
};

export type ProfileDraft = {
  firstName: string;
  lastName: string;
  username: string;
  avatar: PhotoValue;
  bio: string;
  ridingStyles: RidingStyle[];
  licenseYear: string;
  city: string;
  interests: string[];
  motorcycles: MotorcycleDraft[];
};

/** Identité privée (table profile_private) : lisible uniquement par son propriétaire. */
export type PrivateIdentity = { firstName: string; lastName: string };

const BUCKET = 'photos';

export async function fetchIdentity(userId: string): Promise<PrivateIdentity | null> {
  const { data, error } = await supabase
    .from('profile_private')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { firstName: data.first_name, lastName: data.last_name } : null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, motorcycles(*)')
    .eq('id', userId)
    .order('created_at', { referencedTable: 'motorcycles' })
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function photoUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function emptyMotorcycleDraft(): MotorcycleDraft {
  return {
    key: `new-${Date.now()}-${Math.random()}`,
    brand: '',
    model: '',
    year: '',
    displacement: '',
    color: '',
    photo: { path: null, localUri: null },
  };
}

export function profileToDraft(profile: Profile | null, identity: PrivateIdentity | null): ProfileDraft {
  return {
    firstName: identity?.firstName ?? '',
    lastName: identity?.lastName ?? '',
    username: profile?.username ?? '',
    avatar: { path: profile?.avatar_path ?? null, localUri: null },
    bio: profile?.bio ?? '',
    ridingStyles: profile?.riding_styles ?? [],
    licenseYear: profile?.license_year?.toString() ?? '',
    city: profile?.city ?? '',
    interests: profile?.interests ?? [],
    motorcycles: (profile?.motorcycles ?? []).map((m) => ({
      key: m.id,
      id: m.id,
      brand: m.brand,
      model: m.model,
      year: m.year?.toString() ?? '',
      displacement: m.displacement_cc?.toString() ?? '',
      color: m.color ?? '',
      photo: { path: m.photo_path, localUri: null },
    })),
  };
}

/** Retourne la liste des erreurs de saisie (vide si tout est bon). */
export function validateDraft(draft: ProfileDraft): string[] {
  const errors: string[] = [];
  const currentYear = new Date().getFullYear();
  if (!draft.firstName.trim()) errors.push('Le prénom est obligatoire.');
  if (!draft.lastName.trim()) errors.push('Le nom est obligatoire.');
  if (!/^[A-Za-z0-9_.]{3,20}$/.test(draft.username.trim()))
    errors.push('Pseudo : 3 à 20 caractères, lettres, chiffres, point ou tiret bas.');
  if (!draft.avatar.path && !draft.avatar.localUri) errors.push('La photo de profil est obligatoire.');
  if (draft.licenseYear && !isIntBetween(draft.licenseYear, 1950, currentYear))
    errors.push(`Année du permis : entre 1950 et ${currentYear}.`);
  draft.motorcycles.forEach((m, i) => {
    const label = `Moto ${i + 1}`;
    if (!m.brand.trim() || !m.model.trim()) errors.push(`${label} : marque et modèle obligatoires.`);
    if (m.year && !isIntBetween(m.year, 1900, currentYear + 1)) errors.push(`${label} : année invalide.`);
    if (m.displacement && !isIntBetween(m.displacement, 1, 3000)) errors.push(`${label} : cylindrée invalide.`);
  });
  return errors;
}

export async function saveProfile(userId: string, draft: ProfileDraft, previous: Profile | null) {
  const oldPaths: string[] = [];

  let avatarPath = draft.avatar.path;
  if (draft.avatar.localUri) {
    avatarPath = await uploadPhoto(userId, 'avatar', draft.avatar);
    if (previous?.avatar_path) oldPaths.push(previous.avatar_path);
  }

  // Identité privée d'abord (table séparée, lisible par moi seul)
  const { error: identityError } = await supabase.from('profile_private').upsert({
    user_id: userId,
    first_name: draft.firstName.trim(),
    last_name: draft.lastName.trim(),
  });
  if (identityError) throw identityError;

  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    username: draft.username.trim(),
    avatar_path: avatarPath,
    bio: draft.bio.trim() || null,
    riding_styles: draft.ridingStyles,
    license_year: toIntOrNull(draft.licenseYear),
    city: draft.city.trim() || null,
    interests: draft.interests,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Ce pseudo est déjà pris.');
    throw error;
  }

  const previousMotos = previous?.motorcycles ?? [];
  const keptIds = new Set(draft.motorcycles.map((m) => m.id).filter(Boolean));

  for (const moto of draft.motorcycles) {
    let photoPath = moto.photo.path;
    if (moto.photo.localUri) {
      photoPath = await uploadPhoto(userId, 'moto', moto.photo);
      const old = previousMotos.find((p) => p.id === moto.id)?.photo_path;
      if (old) oldPaths.push(old);
    }
    const row = {
      owner_id: userId,
      brand: moto.brand.trim(),
      model: moto.model.trim(),
      year: toIntOrNull(moto.year),
      displacement_cc: toIntOrNull(moto.displacement),
      color: moto.color.trim() || null,
      photo_path: photoPath,
    };
    const { error: motoError } = moto.id
      ? await supabase.from('motorcycles').update(row).eq('id', moto.id)
      : await supabase.from('motorcycles').insert(row);
    if (motoError) throw motoError;
  }

  const removed = previousMotos.filter((m) => !keptIds.has(m.id));
  if (removed.length) {
    const { error: deleteError } = await supabase
      .from('motorcycles')
      .delete()
      .in(
        'id',
        removed.map((m) => m.id),
      );
    if (deleteError) throw deleteError;
    removed.forEach((m) => m.photo_path && oldPaths.push(m.photo_path));
  }

  // Nettoyage des anciennes photos : pas bloquant si ça échoue
  if (oldPaths.length) await supabase.storage.from(BUCKET).remove(oldPaths);
}

export async function uploadPhoto(
  userId: string,
  kind: 'avatar' | 'moto' | 'wall' | 'cover',
  photo: PhotoValue,
): Promise<string> {
  const contentType = photo.mimeType ?? 'image/jpeg';
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${userId}/${kind}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const bytes = await new File(photo.localUri!).arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType });
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  return path;
}

function isIntBetween(value: string, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

function toIntOrNull(value: string) {
  return value.trim() ? Number(value) : null;
}
