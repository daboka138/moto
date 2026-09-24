import { File } from 'expo-file-system';

import { photoUrl } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Messages privés et de balade. Seuls les membres d'une conversation lisent
// ses messages (RLS) ; les photos sont dans un bucket privé (URL signées).

export type Conversation = {
  id: string;
  kind: 'direct' | 'ride';
  rideId: string | null;
  title: string;
  avatarUrl: string | null;
  otherId: string | null;
  otherLastReadAt: string | null;
  blocked: boolean;
  lastBody: string | null;
  lastHasImage: boolean;
  lastSenderId: string | null;
  lastAt: string;
  unread: number;
  isDemo?: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  imagePath: string | null;
  createdAt: string;
};

export type Member = { id: string; username: string; avatarUrl: string; lastReadAt: string };

const BUCKET = 'chat';

type ConvRow = {
  id: string;
  kind: 'direct' | 'ride';
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
};

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return ((data ?? []) as ConvRow[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    rideId: r.ride_id,
    title: r.kind === 'ride' ? (r.ride_title ?? 'Balade') : `@${r.other_username ?? '?'}`,
    avatarUrl: r.other_avatar_path ? photoUrl(r.other_avatar_path) : null,
    otherId: r.other_id,
    otherLastReadAt: r.other_last_read_at,
    blocked: r.blocked,
    lastBody: r.last_body,
    lastHasImage: r.last_has_image,
    lastSenderId: r.last_sender_id,
    lastAt: r.last_at,
    unread: r.unread,
  }));
}

export function toMessage(r: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
}): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    imagePath: r.image_path,
    createdAt: r.created_at,
  };
}

export async function fetchMessages(conversationId: string, limit = 100): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, image_path, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toMessage);
}

export async function fetchMembers(conversationId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('user_id, last_read_at, profile:profiles(username, avatar_path)')
    .eq('conversation_id', conversationId);
  if (error) throw error;
  type M = { user_id: string; last_read_at: string; profile: { username: string; avatar_path: string } | null };
  return ((data ?? []) as unknown as M[]).map((m) => ({
    id: m.user_id,
    username: m.profile?.username ?? '?',
    avatarUrl: m.profile ? photoUrl(m.profile.avatar_path) : '',
    lastReadAt: m.last_read_at,
  }));
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  body: string,
  image?: { uri: string; mimeType?: string },
) {
  let imagePath: string | null = null;
  if (image) {
    const contentType = image.mimeType ?? 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    imagePath = `${userId}/msg-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
    const bytes = await new File(image.uri).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(imagePath, bytes, { contentType });
    if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  }
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: userId, body: body.trim() || null, image_path: imagePath });
  if (error) {
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    throw new Error(error.message.includes('row-level security') ? 'Tu ne peux pas écrire dans cette conversation.' : error.message);
  }
}

export async function markConversationRead(userId: string, conversationId: string) {
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
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

/** URL signées des photos de messages (bucket privé) */
export async function signChatImages(paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const pairs: [string, string][] = [];
  for (const d of data ?? []) if (d.path && d.signedUrl) pairs.push([d.path, d.signedUrl]);
  return new Map(pairs);
}

export function messagePreview(c: Pick<Conversation, 'lastBody' | 'lastHasImage'>) {
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
