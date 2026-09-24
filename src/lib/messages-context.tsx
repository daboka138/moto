import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { fetchConversations, type Conversation } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export type Toast = { id: number; title: string; body: string; conversationId: string; isDemo?: boolean };

type MessagesState = {
  conversations: Conversation[];
  unreadTotal: number;
  refresh: () => Promise<void>;
  /** Conversation ouverte à l'écran : pas de notification pour elle */
  setActiveConversation: (id: string | null) => void;
  toast: Toast | null;
  notify: (t: Omit<Toast, 'id'>) => void;
  dismissToast: () => void;
};

const MessagesContext = createContext<MessagesState | null>(null);

/**
 * Conversations, non-lus et notifications. Temps réel via Supabase Realtime :
 * le serveur n'envoie que les messages des conversations dont je suis membre (RLS).
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession();
  const userId = profile ? session?.user.id : undefined;
  const [loaded, setLoaded] = useState<{ userId: string; conversations: Conversation[] } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const active = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const conversations = await fetchConversations();
      conversationsRef.current = conversations;
      setLoaded({ userId, conversations });
    } catch (e) {
      console.warn('Chargement des conversations impossible', e);
    }
  }, [userId]);

  const notify = useCallback((t: Omit<Toast, 'id'>) => {
    if (t.conversationId === active.current) return;
    const id = Date.now();
    setToast({ ...t, id });
    setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 4000);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => !cancelled && refresh();
    load();
    const channel = supabase
      .channel(`messages:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as { conversation_id: string; sender_id: string; body: string | null; image_path: string | null };
        refresh().then(() => {
          if (m.sender_id === userId) return;
          const conv = conversationsRef.current.find((c) => c.id === m.conversation_id);
          notify({
            title: conv?.title ?? 'Nouveau message',
            body: m.body ?? (m.image_path ? '📷 Photo' : ''),
            conversationId: m.conversation_id,
          });
        });
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, notify]);

  const conversations = loaded && loaded.userId === userId ? loaded.conversations : [];
  const unreadTotal = conversations.reduce((n, c) => n + (c.blocked ? 0 : c.unread), 0);

  return (
    <MessagesContext.Provider
      value={{
        conversations,
        unreadTotal,
        refresh,
        setActiveConversation: (id) => {
          active.current = id;
        },
        toast,
        notify,
        dismissToast: () => setToast(null),
      }}>
      {children}
    </MessagesContext.Provider>
  );
}

export function useMessages() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages doit être utilisé dans <MessagesProvider>');
  return ctx;
}
