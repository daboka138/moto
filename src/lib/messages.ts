import { photoUrl } from '@/lib/profile';
import { readFileBytes } from '@/lib/read-file';
import { supabase } from '@/lib/supabase';

// Messages privés, de balade et de groupe. Seuls les membres d'une conversation lisent ses
// messages (RLS) ; les photos sont dans un bucket privé (URL signées). Réactions, modification,
// suppression et groupes passent par des fonctions serveur (vérifications côté serveur).

export type ConversationKind = 'direct' | 'ride' | 'group';

export type Conversation = {
  id: string;
  kind: ConversationKind;
  rideId: string | null;
  title: string;
  avatarUrl: string | null;
  otherId: string | null;
  /** Date de lecture de l'autre (null si mes accusés de lecture sont coupés) */
  otherLastReadAt: string | null;
  blocked: boolean;
  lastBody: string | null;
  lastHasImage: boolean;
  lastSenderId: string | null;
  lastAt: string;
  lastKind: 'user' | 'system';
  lastDeleted: boolean;
  unread: number;
  membersCount: number;
  /** Sourdine jusqu'à cette date (privée) */
  mutedUntil: string | null;
  myRole: 'member' | 'admin';
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  imagePath: string | null;
  /** Message vocal (bucket privé chat) et sa durée */
  audioPath: string | null;
  audioDurationMs: number | null;
  createdAt: string;
  /** Fiche « trajet partagé en direct » (lib/trip-share.ts) */
  tripShareId?: string | null;
  /** system : « X a ajouté Y » (groupes) */
  kind: 'user' | 'system';
  editedAt: string | null;
  deletedAt: string | null;
  /** Réponse à ce message (même conversation) */
  replyToId: string | null;
};

export type Member = {
  id: string;
  username: string;
  avatarUrl: string;
  /** Date de lecture montrée (figée si ses accusés de lecture sont coupés) */
  lastReadAt: string;
  /** ✓✓ reçu */
  deliveredAt: string | null;
  role: 'member' | 'admin';
};

/** Réaction d'un membre à un message (emoji null = retirée) */
export type Reaction = { messageId: string; userId: string; emoji: string | null };

export const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥', '🏍️'] as const;

/** Délais (serveur) : modifier 1 h, supprimer pour tout le monde 1 h */
export { DELETE_FOR_ALL_WINDOW_MS, EDIT_WINDOW_MS } from '@/lib/message-rules';
export const GROUP_MAX_MEMBERS = 50;

const BUCKET = 'chat';

type ConvRow = {
  id: string;
  kind: ConversationKind;
  ride_id: string | null;
  ride_title: string | null;
  other_id: string | null;
  other_username: string | null;
  other_avatar_path: string | null;
  other_last_read_at: string | null;
  blocked: boolean;
  last_body: string | null;
  last_has_image: boolean;
  last_sender_id: string | null;
  last_at: string;
  unread: number;
  title: string | null;
  photo_path: string | null;
  members_count: number;
  muted_until: string | null;
  my_role: 'member' | 'admin';
  last_kind: 'user' | 'system' | null;
  last_deleted: boolean | null;
};

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return ((data ?? []) as ConvRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    rideId: r.ride_id,
    title:
      r.kind === 'ride' ? (r.ride_title ?? 'Balade') : r.kind === 'group' ? (r.title ?? 'Groupe') : `@${r.other_username ?? '?'}`,
    avatarUrl:
      r.kind === 'group' ? (r.photo_path ? photoUrl(r.photo_path) : null) : r.other_avatar_path ? photoUrl(r.other_avatar_path) : null,
    otherId: r.other_id,
    otherLastReadAt: r.other_last_read_at,
    blocked: r.blocked,
    lastBody: r.last_body,
    lastHasImage: r.last_has_image,
    lastSenderId: r.last_sender_id,
    lastAt: r.last_at,
    lastKind: r.last_kind ?? 'user',
    lastDeleted: !!r.last_deleted,
    unread: r.unread,
    membersCount: r.members_count ?? 2,
    mutedUntil: r.muted_until,
    myRole: r.my_role ?? 'member',
  }));
}

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_path: string | null;
  audio_path?: string | null;
  audio_duration_ms?: number | null;
  created_at: string;
  trip_share_id?: string | null;
  kind?: 'user' | 'system';
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
};

export function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    imagePath: r.image_path,
    audioPath: r.audio_path ?? null,
    audioDurationMs: r.audio_duration_ms ?? null,
    createdAt: r.created_at,
    tripShareId: r.trip_share_id ?? null,
    kind: r.kind ?? 'user',
    editedAt: r.edited_at ?? null,
    deletedAt: r.deleted_at ?? null,
    replyToId: r.reply_to_id ?? null,
  };
}

const MESSAGE_FIELDS = 'id, conversation_id, sender_id, body, image_path, audio_path, audio_duration_ms, created_at, trip_share_id, kind, edited_at, deleted_at, reply_to_id';

export async function fetchMessages(conversationId: string, limit = 100): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_FIELDS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).map(toMessage);
}

export async function fetchMembers(conversationId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('user_id, last_read_at, delivered_at, role, profile:profiles(username, avatar_path)')
    .eq('conversation_id', conversationId);
  if (error) throw error;
  type M = {
    user_id: string;
    last_read_at: string;
    delivered_at: string | null;
    role: 'member' | 'admin';
    profile: { username: string; avatar_path: string } | null;
  };
  return ((data ?? []) as unknown as M[]).map((m) => ({
    id: m.user_id,
    username: m.profile?.username ?? '?',
    avatarUrl: m.profile ? photoUrl(m.profile.avatar_path) : '',
    lastReadAt: m.last_read_at,
    deliveredAt: m.delivered_at,
    role: m.role ?? 'member',
  }));
}

export async function fetchReactions(conversationId: string): Promise<Reaction[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .eq('conversation_id', conversationId)
    .not('emoji', 'is', null);
  if (error) throw error;
  return ((data ?? []) as { message_id: string; user_id: string; emoji: string | null }[]).map(toReaction);
}

export const toReaction = (r: { message_id: string; user_id: string; emoji: string | null }): Reaction => ({
  messageId: r.message_id,
  userId: r.user_id,
  emoji: r.emoji,
});

export async function sendMessage(
  userId: string,
  conversationId: string,
  body: string,
  image?: { uri: string; mimeType?: string },
  replyToId?: string | null,
) {
  let imagePath: string | null = null;
  if (image) {
    const contentType = image.mimeType ?? 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    imagePath = `${userId}/msg-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const bytes = await readFileBytes(image.uri);
    const { error } = await supabase.storage.from(BUCKET).upload(imagePath, bytes, { contentType });
    if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  }
  const { error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: body.trim() || null,
      image_path: imagePath,
      reply_to_id: replyToId ?? null,
    });
  if (error) {
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    throw new Error(error.message.includes('row-level security') ? 'Tu ne peux pas écrire dans cette conversation.' : error.message);
  }
}

/** « 0:12 » */
export function formatVoiceDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Durée max d'un message vocal */
export const VOICE_MAX_MS = 120_000;

/**
 * Message vocal : fichier dans chat/<moi>/voice-…, texte « 🎤 Message vocal (0:12) » (aperçus, push,
 * anciennes versions de l'app).
 */
export async function sendVoiceMessage(
  userId: string,
  conversationId: string,
  audio: { data: Blob | ArrayBuffer; mimeType: string; durationMs: number },
  replyToId?: string | null,
) {
  const contentType = audio.mimeType.split(';')[0];
  const ext = contentType.includes('webm') ? 'webm' : contentType.includes('ogg') ? 'ogg' : contentType.includes('mpeg') ? 'mp3' : 'm4a';
  const path = `${userId}/voice-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, audio.data, { contentType });
  if (upErr) throw new Error(`Envoi du message vocal impossible : ${upErr.message}`);
  const durationMs = Math.min(VOICE_MAX_MS, Math.round(audio.durationMs));
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    body: `🎤 Message vocal (${formatVoiceDuration(durationMs)})`,
    audio_path: path,
    audio_duration_ms: durationMs,
    reply_to_id: replyToId ?? null,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message.includes('row-level security') ? 'Tu ne peux pas écrire dans cette conversation.' : error.message);
  }
}

const rpc = async <T = void>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
};

/** Réagir (même emoji = retirer). Renvoie ma réaction après coup. */
export const reactToMessage = (messageId: string, emoji: string) =>
  rpc<string | null>('react_message', { p_id: messageId, p_emoji: emoji });

export const editMessage = (messageId: string, body: string) => rpc('edit_message', { p_id: messageId, p_body: body });

/** Supprimer pour tout le monde : contenu effacé en base, puis la photo du stockage */
export async function deleteMessageForAll(messageId: string) {
  const path = await rpc<string | null>('delete_message_for_all', { p_id: messageId });
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

export const hideMessage = (messageId: string) => rpc('hide_message', { p_id: messageId });

/** Messages arrivés : ✓✓ « reçu » pour leurs auteurs */
export async function markDelivered() {
  await supabase.rpc('mark_delivered');
}

export async function markConversationRead(userId: string, conversationId: string) {
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
}

/** Sourdine : jusqu'à until (null = réactiver, 'infinity' = toujours) */
export const setConversationMute = (conversationId: string, until: Date | 'infinity' | null) =>
  rpc('set_conversation_mute', {
    p_conv: conversationId,
    p_until: until === null ? null : until === 'infinity' ? 'infinity' : until.toISOString(),
  });

export const isMuted = (c: Pick<Conversation, 'mutedUntil'>) =>
  !!c.mutedUntil && (c.mutedUntil === 'infinity' || new Date(c.mutedUntil).getTime() > Date.now());

// ---------- Groupes ----------

export const createGroup = (title: string, photoPath: string | null, memberIds: string[]) =>
  rpc<string>('create_group', { p_title: title, p_photo_path: photoPath, p_members: memberIds });

export const addGroupMembers = (conversationId: string, memberIds: string[]) =>
  rpc('add_group_members', { p_conv: conversationId, p_members: memberIds });

export const removeGroupMember = (conversationId: string, userId: string) =>
  rpc('remove_group_member', { p_conv: conversationId, p_user: userId });

export const setGroupAdmin = (conversationId: string, userId: string, admin: boolean) =>
  rpc('set_group_admin', { p_conv: conversationId, p_user: userId, p_admin: admin });

export const updateGroup = (conversationId: string, title: string, photoPath: string | null) =>
  rpc('update_group', { p_conv: conversationId, p_title: title, p_photo_path: photoPath });

export const leaveGroup = (conversationId: string) => rpc('leave_group', { p_conv: conversationId });

// ---------- Accusés de lecture (Paramètres › Confidentialité) ----------

export async function fetchReadReceipts(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('profile_private').select('read_receipts').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data?.read_receipts ?? true;
}

export async function setReadReceipts(userId: string, enabled: boolean) {
  const { error } = await supabase.from('profile_private').update({ read_receipts: enabled }).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function openDirectConversation(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other: otherId });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function openRideConversation(rideId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_ride_conversation', { ride: rideId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** URL signées des photos et vocaux de messages (bucket privé) */
export async function signChatImages(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const pairs: [string, string][] = [];
  for (const d of data ?? []) if (d.path && d.signedUrl) pairs.push([d.path, d.signedUrl]);
  return new Map(pairs);
}

export function messagePreview(c: Pick<Conversation, 'lastBody' | 'lastHasImage' | 'lastDeleted'>) {
  if (c.lastDeleted) return '🚫 Message supprimé';
  if (c.lastBody) return c.lastBody;
  if (c.lastHasImage) return '📷 Photo';
  return 'Nouvelle conversation';
}

export function messageTime(iso: string) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  return today
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
