import { Alert, Platform, Share } from 'react-native';

import { uploadPhoto, photoUrl, type PhotoValue } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Clubs : fondateur / admins / membres, adhésion libre ou sur demande, mur réservé aux membres,
// balades et événements « au nom du club » (membres invités automatiquement par le serveur).
// Écritures sensibles par RPC (join_club, club_decide, club_remove_member, club_set_role) :
// les droits sont vérifiés côté serveur. Page publique https://passeryder.fr/c/SLUG.

export type JoinPolicy = 'open' | 'request';
export type ClubRole = 'founder' | 'admin' | 'member';
export type MemberStatus = 'member' | 'pending';

export const JOIN_POLICIES: { value: JoinPolicy; label: string; description: string }[] = [
  { value: 'open', label: 'Public', description: 'Tout le monde peut rejoindre' },
  { value: 'request', label: 'Sur demande', description: 'Les admins acceptent les demandes' },
];

export const ROLE_LABELS: Record<ClubRole, string> = { founder: 'Fondateur', admin: 'Admin', member: 'Membre' };

export const clubShareUrl = (slug: string) => `https://passeryder.fr/c/${slug}`;

export type ClubSummary = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  city: string | null;
  joinPolicy: JoinPolicy;
  members: number;
  distanceKm: number | null;
  myStatus: MemberStatus | null;
  myRole: ClubRole | null;
};

const logoUrl = (path: string | null) => (path ? photoUrl(path) : null);

export async function searchClubs(query: string, near: { latitude: number; longitude: number } | null): Promise<ClubSummary[]> {
  const { data, error } = await supabase.rpc('search_clubs', {
    p_query: query.trim() || null,
    p_lat: near?.latitude ?? null,
    p_lng: near?.longitude ?? null,
  });
  if (error) throw new Error(error.message);
  type Row = {
    id: string;
    slug: string;
    name: string;
    logo_path: string | null;
    city: string | null;
    join_policy: JoinPolicy;
    members: number;
    distance_km: number | null;
    my_status: MemberStatus | null;
    my_role: ClubRole | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    logoUrl: logoUrl(r.logo_path),
    city: r.city,
    joinPolicy: r.join_policy,
    members: Number(r.members),
    distanceKm: r.distance_km,
    myStatus: r.my_status,
    myRole: r.my_role,
  }));
}

export type ClubMember = { userId: string; username: string; avatarUrl: string; role: ClubRole; status: MemberStatus };

export type Club = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoPath: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  joinPolicy: JoinPolicy;
  createdBy: string;
  hidden: boolean;
  members: ClubMember[];
  pending: ClubMember[];
  myStatus: MemberStatus | null;
  myRole: ClubRole | null;
};

export async function fetchClub(id: string, userId: string): Promise<Club | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select(
      'id, slug, name, description, logo_path, city, latitude, longitude, join_policy, created_by, hidden_at, club_members(user_id, role, status, created_at, profile:profiles(username, avatar_path))',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  type M = { user_id: string; role: ClubRole; status: MemberStatus; profile: { username: string; avatar_path: string } | null };
  const all = ((data.club_members ?? []) as unknown as M[])
    .filter((m) => m.profile)
    .map((m) => ({
      userId: m.user_id,
      username: m.profile!.username,
      avatarUrl: photoUrl(m.profile!.avatar_path),
      role: m.role,
      status: m.status,
    }));
  const order: Record<ClubRole, number> = { founder: 0, admin: 1, member: 2 };
  const mine = all.find((m) => m.userId === userId);
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    logoPath: data.logo_path,
    city: data.city,
    latitude: data.latitude,
    longitude: data.longitude,
    joinPolicy: data.join_policy,
    createdBy: data.created_by,
    hidden: !!data.hidden_at,
    members: all.filter((m) => m.status === 'member').sort((a, b) => order[a.role] - order[b.role] || a.username.localeCompare(b.username)),
    pending: all.filter((m) => m.status === 'pending'),
    myStatus: mine?.status ?? null,
    myRole: mine?.status === 'member' ? mine.role : null,
  };
}

export const isClubAdmin = (c: Pick<Club, 'myRole'>) => c.myRole === 'founder' || c.myRole === 'admin';

export type ClubDraft = {
  name: string;
  description: string;
  city: string;
  zone: { latitude: number; longitude: number } | null;
  joinPolicy: JoinPolicy;
  logo: PhotoValue;
};

export async function saveClub(userId: string, d: ClubDraft, id?: string): Promise<string> {
  const logoPath = d.logo.localUri ? await uploadPhoto(userId, 'club', d.logo) : d.logo.path;
  const row = {
    name: d.name.trim(),
    description: d.description.trim() || null,
    city: d.city.trim() || null,
    latitude: d.zone?.latitude ?? null,
    longitude: d.zone?.longitude ?? null,
    join_policy: d.joinPolicy,
    logo_path: logoPath,
  };
  const { data, error } = id
    ? await supabase.from('clubs').update(row).eq('id', id).select('id').single()
    : await supabase.from('clubs').insert({ ...row, created_by: userId }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteClub(id: string) {
  const { error } = await supabase.from('clubs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

/** Rejoindre : 'member' (club public) ou 'pending' (demande envoyée aux admins) */
export const joinClub = async (clubId: string) => (await rpc('join_club', { p_club: clubId })) as MemberStatus;
export const leaveClub = (clubId: string) => rpc('leave_club', { p_club: clubId });
export const decideMember = (clubId: string, userId: string, accept: boolean) =>
  rpc('club_decide', { p_club: clubId, p_user: userId, p_accept: accept });
export const removeMember = (clubId: string, userId: string) => rpc('club_remove_member', { p_club: clubId, p_user: userId });
export const setMemberRole = (clubId: string, userId: string, role: 'admin' | 'member') =>
  rpc('club_set_role', { p_club: clubId, p_user: userId, p_role: role });

/** Clubs dont je suis fondateur ou admin (pour publier une balade / un événement en leur nom) */
export async function fetchMyAdminClubs(userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select('club:clubs(id, name)')
    .eq('user_id', userId)
    .eq('status', 'member')
    .in('role', ['founder', 'admin']);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { club: { id: string; name: string } | null }[]).filter((r) => r.club).map((r) => r.club!);
}

// ---------- Mur du club ----------

export type ClubPost = { id: string; authorId: string; username: string; avatarUrl: string; body: string | null; photoUrl: string | null; createdAt: string };

export async function fetchClubPosts(clubId: string): Promise<ClubPost[]> {
  const { data, error } = await supabase
    .from('club_posts')
    .select('id, author_id, body, photo_path, created_at, author:profiles(username, avatar_path)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  type Row = { id: string; author_id: string; body: string | null; photo_path: string | null; created_at: string; author: { username: string; avatar_path: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    authorId: r.author_id,
    username: r.author?.username ?? '?',
    avatarUrl: photoUrl(r.author?.avatar_path ?? ''),
    body: r.body,
    photoUrl: r.photo_path ? photoUrl(r.photo_path) : null,
    createdAt: r.created_at,
  }));
}

export async function addClubPost(userId: string, clubId: string, body: string, photo: PhotoValue | null) {
  const photoPath = photo?.localUri ? await uploadPhoto(userId, 'club', photo) : null;
  const { error } = await supabase.from('club_posts').insert({ club_id: clubId, author_id: userId, body: body.trim() || null, photo_path: photoPath });
  if (error) throw new Error(error.message);
}

export async function deleteClubPost(id: string) {
  const { error } = await supabase.from('club_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- Balades et événements du club ----------

export type ClubActivity = { kind: 'ride' | 'event'; id: string; title: string; at: string };

export async function fetchClubActivities(clubId: string): Promise<ClubActivity[]> {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const [rides, events] = await Promise.all([
    supabase.from('group_rides').select('id, title, meeting_at').eq('club_id', clubId).gte('meeting_at', since).order('meeting_at').limit(20),
    supabase.from('events').select('id, title, starts_at').eq('club_id', clubId).gte('starts_at', since).order('starts_at').limit(20),
  ]);
  if (rides.error) throw new Error(rides.error.message);
  if (events.error) throw new Error(events.error.message);
  return [
    ...(rides.data ?? []).map((r) => ({ kind: 'ride' as const, id: r.id as string, title: r.title as string, at: r.meeting_at as string })),
    ...(events.data ?? []).map((e) => ({ kind: 'event' as const, id: e.id as string, title: e.title as string, at: e.starts_at as string })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}

export async function shareClub(c: Pick<Club, 'name' | 'slug'>) {
  const url = clubShareUrl(c.slug);
  const message = `Rejoins le club « ${c.name} » sur PasseRyder : ${url}`;
  try {
    if (Platform.OS === 'web' && !navigator.share) {
      await navigator.clipboard.writeText(url);
      Alert.alert('Lien copié', url);
      return;
    }
    await Share.share(Platform.OS === 'web' ? { title: c.name, message, url } : { title: c.name, message });
  } catch (e) {
    console.warn('Partage impossible', e);
  }
}
