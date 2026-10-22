import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { decideMember } from '@/lib/clubs';
import { setAttendance, declineEventInvite } from '@/lib/events';
import { acceptFriendRequest, removeFriendship } from '@/lib/friends';
import { photoUrl } from '@/lib/profile';
import { joinRide, leaveRide } from '@/lib/rides';
import { useSession } from '@/lib/session';
import { useStartupDone } from '@/lib/startup';
import { supabase } from '@/lib/supabase';

// Centre de notifications : likes, commentaires, amis, invitations, messages, spots, convoi, SOS…
// Les notifications sont créées par le serveur (triggers Postgres), en même temps que les push ;
// chacun ne lit que les siennes (RLS). Pastille de non-lus en temps réel (Supabase Realtime).
// Purge automatique après 60 jours.

export type NotificationType =
  | 'like'
  | 'comment'
  | 'friend_request'
  | 'friend_accepted'
  | 'ride_invite'
  | 'event_invite'
  | 'event_response'
  | 'event_reminder'
  | 'message'
  | 'place_new'
  | 'place_review'
  | 'convoy'
  | 'regroup'
  | 'sos'
  | 'referral'
  | 'club_request'
  | 'club_accepted'
  | 'reaction'
  | 'group_added'
  | 'passenger'
  | 'store_launch'
  | 'weather'
  | 'badge'
  | 'event_review';

export type AppNotification = {
  id: string;
  type: NotificationType;
  actor: { id: string; username: string; avatarUrl: string } | null;
  targetType: string;
  targetId: string | null;
  body: string;
  url: string;
  readAt: string | null;
  createdAt: string;
};

/** Icône quand il n'y a pas d'acteur (rappel d'événement…) ou en petit badge sur l'avatar */
export const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  like: '❤️',
  comment: '💬',
  friend_request: '👋',
  friend_accepted: '🤝',
  ride_invite: '🏍️',
  event_invite: '📅',
  event_response: '📅',
  event_reminder: '⏰',
  message: '✉️',
  place_new: '📍',
  place_review: '⭐',
  convoy: '⚠️',
  regroup: '🚩',
  sos: '🆘',
  referral: '📨',
  club_request: '🏁',
  club_accepted: '🏁',
  reaction: '😊',
  group_added: '👥',
  passenger: '🏍️',
  store_launch: '📱',
  weather: '🌦️',
  badge: '🏅',
  event_review: '📅',
};

type Row = {
  id: string;
  type: NotificationType;
  target_type: string;
  target_id: string | null;
  body: string;
  url: string;
  read_at: string | null;
  created_at: string;
  actor: { id: string; username: string; avatar_path: string } | null;
};

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, target_type, target_id, body, url, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, username, avatar_path)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    actor: r.actor ? { id: r.actor.id, username: r.actor.username, avatarUrl: photoUrl(r.actor.avatar_path) } : null,
    targetType: r.target_type,
    targetId: r.target_id,
    body: r.body,
    url: r.url,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export async function markNotificationsRead(ids?: string[]) {
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null });
  if (error) throw error;
}

/** Notification push touchée : les notifications du même écran sont lues */
export async function markNotificationsReadByUrl(url: string) {
  const { error } = await supabase.rpc('mark_notifications_read_by_url', { p_url: url });
  if (error) console.warn('Notifications non marquées comme lues', error);
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

/** Notifications avec boutons Accepter / Refuser */
export const hasActions = (n: AppNotification) =>
  n.type === 'friend_request' || n.type === 'ride_invite' || n.type === 'event_invite' || n.type === 'club_request';

/** Accepter ou refuser directement depuis la notification (le serveur retire ensuite la notification) */
export async function answerNotification(n: AppNotification, userId: string, accept: boolean) {
  const target = n.targetId;
  if (!target) return;
  switch (n.type) {
    case 'friend_request':
      return accept ? acceptFriendRequest(userId, target) : removeFriendship(userId, target);
    case 'ride_invite':
      return accept ? joinRide(target, userId, true) : leaveRide(target, userId);
    case 'event_invite':
      return accept ? setAttendance(target, userId, 'going') : declineEventInvite(target, userId);
    case 'club_request':
      // Demande d'adhésion : la cible est le club, le demandeur est l'acteur
      if (n.actor) await decideMember(target, n.actor.id, accept);
      return;
  }
}

/** « à l'instant », « il y a 5 min », « il y a 2 h », « hier », « il y a 3 j », sinon la date */
export function relativeTime(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 2 * 86400) return 'hier';
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Aujourd'hui / Cette semaine / Plus ancien */
export function groupNotifications(list: AppNotification[], now: number) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const today = startOfDay.getTime();
  const week = today - 6 * 86400_000;
  const sections = [
    { title: 'Aujourd’hui', data: [] as AppNotification[] },
    { title: 'Cette semaine', data: [] as AppNotification[] },
    { title: 'Plus ancien', data: [] as AppNotification[] },
  ];
  for (const n of list) {
    const t = new Date(n.createdAt).getTime();
    sections[t >= today ? 0 : t >= week ? 1 : 2].data.push(n);
  }
  return sections.filter((s) => s.data.length);
}

// ---------- Pastille de non-lus, partagée par toutes les cloches ----------

type NotificationsState = { unread: number; refresh: () => Promise<void> };

const NotificationsContext = createContext<NotificationsState>({ unread: 0, refresh: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession();
  const userId = profile ? session?.user.id : undefined;
  const [count, setCount] = useState<{ userId: string; unread: number } | null>(null);
  // Compteur chargé après l'ouverture de la carte (démarrage plus fluide)
  const startupDone = useStartupDone();

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { count: unread, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    if (error) console.warn('Notifications indisponibles', error);
    else setCount({ userId, unread: unread ?? 0 });
  }, [userId]);

  useEffect(() => {
    if (!userId || !startupDone) return;
    let cancelled = false;
    const load = () => !cancelled && refresh();
    load();
    // Nouvelle notification, lue ou supprimée : on recompte (RLS : seulement les miennes)
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, startupDone]);

  const unread = count && count.userId === userId ? count.unread : 0;
  return <NotificationsContext.Provider value={{ unread, refresh }}>{children}</NotificationsContext.Provider>;
}

export const useNotificationsBadge = () => useContext(NotificationsContext);
