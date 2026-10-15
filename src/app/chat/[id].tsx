import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { ChatView, type ChatPerson } from '@/components/chat-view';
import {
  fetchMembers,
  fetchMessages,
  markConversationRead,
  sendMessage,
  signChatImages,
  toMessage,
  type Member,
  type Message,
} from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
import { askBlock, askReport } from '@/lib/moderation';
import type { PickedImage } from '@/lib/pick-image';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Une conversation (privée ou de balade). */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { setActiveConversation } = useMessages();

  // Pas de notification pour la conversation affichée
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(id);
      return () => setActiveConversation(null);
    }, [id, setActiveConversation]),
  );

  return <RealChat id={id} />;
}

/** Ajoute des messages sans doublon, du plus récent au plus ancien */
function merge(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function RealChat({ id }: { id: string }) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { conversations, refresh } = useMessages();
  const conv = conversations.find((c) => c.id === id);
  const [messages, setMessages] = useState<{ id: string; list: Message[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());

  const signNew = useCallback(async (list: Message[]) => {
    const paths = list.map((m) => m.imagePath).filter((p): p is string => !!p);
    if (!paths.length) return;
    try {
      const signed = await signChatImages(paths);
      setImages((cur) => new Map([...cur, ...signed]));
    } catch (e) {
      console.warn('Photos indisponibles', e);
    }
  }, []);

  const markRead = useCallback(async () => {
    await markConversationRead(userId, id);
    refresh();
  }, [userId, id, refresh]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([fetchMessages(id), fetchMembers(id)])
      .then(([list, mem]) => {
        if (cancelled) return;
        setMessages({ id, list });
        setMembers(mem);
        signNew(list);
      })
      .catch((e) => {
        console.warn('Chargement de la conversation impossible', e);
        if (!cancelled) setMessages({ id, list: [] });
      });
    markRead();
    // La conversation peut être toute neuve : on recharge la liste pour avoir son titre
    if (!conv) refresh();

    // Temps réel : nouveaux messages et accusés de lecture de cette conversation
    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = toMessage(payload.new as Parameters<typeof toMessage>[0]);
          setMessages((cur) => ({ id, list: merge(cur?.id === id ? cur.list : [], [m]) }));
          signNew([m]);
          if (m.senderId !== userId) markRead();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string };
          setMembers((cur) => cur.map((m) => (m.id === row.user_id ? { ...m, lastReadAt: row.last_read_at } : m)));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // conv volontairement absent : on ne s'abonne qu'une fois par conversation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId, signNew, markRead]);

  const send = async (text: string, image?: PickedImage) => {
    try {
      await sendMessage(userId, id, text, image);
      // Filet de sécurité si le temps réel a raté le message
      const latest = await fetchMessages(id, 20);
      setMessages((cur) => ({ id, list: merge(cur?.id === id ? cur.list : [], latest) }));
      signNew(latest);
    } catch (e) {
      Alert.alert('Envoi impossible', e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const people = new Map<string, ChatPerson>(members.map((m) => [m.id, { username: m.username, avatarUrl: m.avatarUrl }]));
  const other = conv?.otherId ? people.get(conv.otherId) : undefined;

  const openTitle = () => {
    if (conv?.kind === 'direct' && conv.otherId) router.push({ pathname: '/user/[id]', params: { id: conv.otherId } });
    if (conv?.kind === 'ride' && conv.rideId) router.push({ pathname: '/ride/[id]', params: { id: conv.rideId } });
  };

  const menu = () => {
    if (!conv) return;
    if (conv.kind === 'ride') {
      showActionSheet({ options: [{ label: 'Voir la balade', onPress: openTitle }] });
      return;
    }
    const otherId = conv.otherId;
    if (!otherId) return;
    const username = conv.title.replace(/^@/, '');
    showActionSheet({
      options: [
        { label: 'Voir le profil', onPress: openTitle },
        { label: 'Signaler ce motard', onPress: () => askReport('user', otherId) },
        ...(conv.blocked
          ? []
          : [{ label: `Bloquer @${username}`, destructive: true, onPress: () => askBlock(userId, { id: otherId, username }, refresh) }]),
      ],
    });
  };

  return (
    <ChatView
      title={conv?.title ?? ''}
      avatarUrl={conv?.kind === 'ride' ? null : (conv?.avatarUrl ?? other?.avatarUrl ?? null)}
      isGroup={conv?.kind === 'ride'}
      onTitlePress={conv ? openTitle : undefined}
      onMenu={conv ? menu : undefined}
      messages={messages?.id === id ? messages.list : null}
      meId={userId}
      people={people}
      readers={members.filter((m) => m.id !== userId)}
      imageUrl={(path) => images.get(path)}
      onSend={send}
      onMessageLongPress={(m) =>
        showActionSheet({ options: [{ label: 'Signaler ce message', destructive: true, onPress: () => askReport('message', m.id) }] })
      }
      disabledReason={conv?.blocked ? 'Tu ne peux plus écrire dans cette conversation (motard bloqué).' : null}
    />
  );
}
