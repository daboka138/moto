import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { showActionSheet, type SheetOption } from '@/components/action-sheet';
import { ChatView, type ChatPerson, type MessageStatus, type ReactionSummary } from '@/components/chat-view';
import { MessageMenu, type MessageAction } from '@/components/message-menu';
import { errorMessage } from '@/lib/errors';
import {
  DELETE_FOR_ALL_WINDOW_MS,
  deleteMessageForAll,
  EDIT_WINDOW_MS,
  editMessage,
  fetchMembers,
  fetchMessages,
  fetchReactions,
  fetchReadReceipts,
  hideMessage,
  isMuted,
  markConversationRead,
  reactToMessage,
  sendMessage,
  setConversationMute,
  signChatImages,
  toMessage,
  toReaction,
  type Member,
  type Message,
  type Reaction,
} from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
import { askBlock, askReport } from '@/lib/moderation';
import type { PickedImage } from '@/lib/pick-image';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Une conversation (privée, de balade ou de groupe). */
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

/** Ajoute ou remplace des messages sans doublon, du plus récent au plus ancien */
function merge(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function RealChat({ id }: { id: string }) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { conversations, refresh } = useMessages();
  const conv = conversations.find((c) => c.id === id);
  const [messages, setMessages] = useState<{ id: string; list: Message[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // Réactions : message → (membre → emoji)
  const [reactions, setReactions] = useState<Map<string, Map<string, string>>>(new Map());
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [editing, setEditing] = useState<Message | null>(null);
  // Menu d'un message : actions calculées à l'appui long (délais de 15 min / 1 h)
  const [menuFor, setMenuFor] = useState<{ message: Message; actions: MessageAction[] } | null>(null);
  // Mes accusés de lecture : coupés, je ne vois pas non plus ceux des autres
  const [receipts, setReceipts] = useState(true);

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

  const applyReactions = useCallback((list: Reaction[]) => {
    setReactions((cur) => {
      const next = new Map(cur);
      for (const r of list) {
        const byUser = new Map(next.get(r.messageId) ?? []);
        if (r.emoji) byUser.set(r.userId, r.emoji);
        else byUser.delete(r.userId);
        next.set(r.messageId, byUser);
      }
      return next;
    });
  }, []);

  const markRead = useCallback(async () => {
    await markConversationRead(userId, id);
    refresh();
  }, [userId, id, refresh]);

  const reloadMembers = useCallback(() => {
    fetchMembers(id)
      .then(setMembers)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([fetchMessages(id), fetchMembers(id), fetchReactions(id).catch(() => [])])
      .then(([list, mem, reacts]) => {
        if (cancelled) return;
        setMessages({ id, list });
        setMembers(mem);
        setReactions(new Map());
        applyReactions(reacts);
        signNew(list);
      })
      .catch((e) => {
        console.warn('Chargement de la conversation impossible', e);
        if (!cancelled) setMessages({ id, list: [] });
      });
    fetchReadReceipts(userId)
      .then((on) => !cancelled && setReceipts(on))
      .catch(() => {});
    markRead();
    // La conversation peut être toute neuve : on recharge la liste pour avoir son titre
    if (!conv) refresh();

    // Temps réel : messages (nouveaux, modifiés, supprimés), réactions, lectures et « reçu »
    const filter = `conversation_id=eq.${id}`;
    const channel = supabase
      .channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload) => {
        const m = toMessage(payload.new as Parameters<typeof toMessage>[0]);
        setMessages((cur) => ({ id, list: merge(cur?.id === id ? cur.list : [], [m]) }));
        signNew([m]);
        if (m.kind === 'system') {
          // Membres ajoutés / partis, renommage : on relit les membres et le nom
          reloadMembers();
          refresh();
        }
        if (m.senderId !== userId) markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (payload) => {
        const m = toMessage(payload.new as Parameters<typeof toMessage>[0]);
        setMessages((cur) => ({ id, list: merge(cur?.id === id ? cur.list : [], [m]) }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter }, (payload) => {
        if (payload.new && 'message_id' in payload.new) applyReactions([toReaction(payload.new as Parameters<typeof toReaction>[0])]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter }, (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string; delivered_at: string | null; role: Member['role'] };
        setMembers((cur) =>
          cur.map((m) =>
            m.id === row.user_id ? { ...m, lastReadAt: row.last_read_at, deliveredAt: row.delivered_at, role: row.role ?? m.role } : m,
          ),
        );
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // conv volontairement absent : on ne s'abonne qu'une fois par conversation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId, signNew, markRead, applyReactions, reloadMembers]);

  const latest = async () => {
    // Filet de sécurité si le temps réel a raté quelque chose
    const list = await fetchMessages(id, 20);
    setMessages((cur) => ({ id, list: merge(cur?.id === id ? cur.list : [], list) }));
    signNew(list);
  };

  const send = async (text: string, image?: PickedImage) => {
    try {
      await sendMessage(userId, id, text, image);
      await latest();
    } catch (e) {
      Alert.alert('Envoi impossible', errorMessage(e));
      throw e;
    }
  };

  const edit = async (m: Message, text: string) => {
    try {
      await editMessage(m.id, text);
      setEditing(null);
      await latest();
    } catch (e) {
      Alert.alert('Modification impossible', errorMessage(e));
      throw e;
    }
  };

  const react = async (m: Message, emoji: string) => {
    try {
      const mine = await reactToMessage(m.id, emoji);
      applyReactions([{ messageId: m.id, userId, emoji: mine }]);
    } catch (e) {
      Alert.alert('Réaction impossible', errorMessage(e));
    }
  };

  const others = members.filter((m) => m.id !== userId);
  const isGroup = conv?.kind === 'group' || conv?.kind === 'ride';

  const statusOf = (m: Message): MessageStatus => {
    if (!others.length) return null;
    const seenBy = receipts ? others.filter((o) => o.lastReadAt >= m.createdAt) : [];
    const delivered = others.every((o) => (o.deliveredAt && o.deliveredAt >= m.createdAt) || o.lastReadAt >= m.createdAt);
    return { delivered, seen: seenBy.length === others.length, seenCount: seenBy.length };
  };

  const reactionsOf = (m: Message): ReactionSummary => {
    const byUser = reactions.get(m.id);
    if (!byUser?.size) return [];
    const counts = new Map<string, { count: number; mine: boolean }>();
    for (const [uid, emoji] of byUser) {
      const c = counts.get(emoji) ?? { count: 0, mine: false };
      counts.set(emoji, { count: c.count + 1, mine: c.mine || uid === userId });
    }
    return [...counts].map(([emoji, c]) => ({ emoji, ...c }));
  };

  const people = useMemo(
    () => new Map<string, ChatPerson>(members.map((m) => [m.id, { username: m.username, avatarUrl: m.avatarUrl }])),
    [members],
  );
  const other = conv?.otherId ? people.get(conv.otherId) : undefined;

  // Appui sur un de mes messages : « Vu à … » (privé) ou « Vu par … » (groupe)
  const showStatus = (m: Message) => {
    if (!receipts) {
      Alert.alert('Accusés de lecture coupés', 'Réactive-les dans Paramètres › Confidentialité pour voir qui a lu tes messages.');
      return;
    }
    if (!isGroup) {
      const o = others[0];
      if (!o) return;
      if (o.lastReadAt >= m.createdAt) Alert.alert('Vu', `Lu à ${timeOf(o.lastReadAt)}`);
      else Alert.alert(o.deliveredAt && o.deliveredAt >= m.createdAt ? 'Reçu' : 'Envoyé', 'Pas encore lu.');
      return;
    }
    const seen = others.filter((o) => o.lastReadAt >= m.createdAt);
    const notYet = others.filter((o) => o.lastReadAt < m.createdAt);
    Alert.alert(
      `Vu par ${seen.length}`,
      [
        seen.length ? seen.map((o) => `@${o.username} · ${timeOf(o.lastReadAt)}`).join('\n') : 'Personne pour l’instant.',
        notYet.length ? `\nPas encore : ${notYet.map((o) => `@${o.username}`).join(', ')}` : '',
      ].join(''),
    );
  };

  const messageActions = (m: Message): MessageAction[] => {
    const mine = m.senderId === userId;
    const age = Date.now() - new Date(m.createdAt).getTime();
    const actions: MessageAction[] = [];
    if (mine && m.body && !m.tripShareId && age < EDIT_WINDOW_MS) actions.push({ label: 'Modifier', onPress: () => setEditing(m) });
    actions.push({
      label: 'Supprimer pour moi',
      destructive: true,
      onPress: () =>
        hideMessage(m.id)
          .then(() => setMessages((cur) => (cur ? { id: cur.id, list: cur.list.filter((x) => x.id !== m.id) } : cur)))
          .catch((e) => Alert.alert('Suppression impossible', errorMessage(e))),
    });
    if (mine && age < DELETE_FOR_ALL_WINDOW_MS) {
      actions.push({
        label: 'Supprimer pour tout le monde',
        destructive: true,
        onPress: () =>
          Alert.alert('Supprimer pour tout le monde ?', 'Le message sera effacé chez tous les membres.', [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () =>
                deleteMessageForAll(m.id)
                  .then(latest)
                  .catch((e) => Alert.alert('Suppression impossible', errorMessage(e))),
            },
          ]),
      });
    }
    if (!mine) actions.push({ label: 'Signaler ce message', destructive: true, onPress: () => askReport('message', m.id) });
    return actions;
  };

  const openTitle = () => {
    if (conv?.kind === 'direct' && conv.otherId) router.push({ pathname: '/user/[id]', params: { id: conv.otherId } });
    if (conv?.kind === 'ride' && conv.rideId) router.push({ pathname: '/ride/[id]', params: { id: conv.rideId } });
    if (conv?.kind === 'group') router.push({ pathname: '/group/[id]', params: { id: conv.id } });
  };

  // Sourdine : 1 h / 8 h / toujours, ou réactiver
  const muteOptions = (): SheetOption[] => {
    if (!conv) return [];
    const set = (until: Date | 'infinity' | null) =>
      setConversationMute(conv.id, until)
        .then(refresh)
        .catch((e) => Alert.alert('Sourdine impossible', errorMessage(e)));
    if (isMuted(conv)) return [{ label: '🔔 Réactiver les notifications', onPress: () => set(null) }];
    const inH = (h: number) => new Date(Date.now() + h * 3600_000);
    return [
      { label: '🔕 Sourdine 1 heure', onPress: () => set(inH(1)) },
      { label: '🔕 Sourdine 8 heures', onPress: () => set(inH(8)) },
      { label: '🔕 Sourdine toujours', onPress: () => set('infinity') },
    ];
  };

  const menu = () => {
    if (!conv) return;
    if (conv.kind === 'ride') {
      showActionSheet({ options: [{ label: 'Voir la balade', onPress: openTitle }, ...muteOptions()] });
      return;
    }
    if (conv.kind === 'group') {
      showActionSheet({ options: [{ label: 'Infos du groupe', onPress: openTitle }, ...muteOptions()] });
      return;
    }
    const otherId = conv.otherId;
    if (!otherId) return;
    const username = conv.title.replace(/^@/, '');
    showActionSheet({
      options: [
        { label: 'Voir le profil', onPress: openTitle },
        ...muteOptions(),
        { label: 'Signaler ce motard', onPress: () => askReport('user', otherId) },
        ...(conv.blocked
          ? []
          : [{ label: `Bloquer @${username}`, destructive: true, onPress: () => askBlock(userId, { id: otherId, username }, refresh) }]),
      ],
    });
  };

  const subtitle = conv
    ? [conv.kind === 'group' ? `${conv.membersCount} membres` : null, isMuted(conv) ? '🔕 en sourdine' : null].filter(Boolean).join(' · ')
    : null;

  return (
    <>
      <ChatView
        title={conv?.title ?? ''}
        avatarUrl={conv?.kind === 'ride' ? null : (conv?.avatarUrl ?? other?.avatarUrl ?? null)}
        avatarIcon={conv?.kind === 'group' ? 'people' : 'flag'}
        isGroup={isGroup}
        subtitle={subtitle}
        onTitlePress={conv ? openTitle : undefined}
        onMenu={conv ? menu : undefined}
        messages={messages?.id === id ? messages.list : null}
        meId={userId}
        people={people}
        imageUrl={(path) => images.get(path)}
        statusOf={statusOf}
        reactionsOf={reactionsOf}
        onReact={react}
        onSend={send}
        onMessageLongPress={(m) => setMenuFor({ message: m, actions: messageActions(m) })}
        onMyMessagePress={showStatus}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onEdit={edit}
        disabledReason={conv?.blocked ? 'Tu ne peux plus écrire dans cette conversation (motard bloqué).' : null}
      />
      <MessageMenu
        visible={!!menuFor}
        myReaction={menuFor ? (reactions.get(menuFor.message.id)?.get(userId) ?? null) : null}
        onReact={menuFor && !menuFor.message.deletedAt ? (emoji) => menuFor && react(menuFor.message, emoji) : null}
        actions={menuFor?.actions ?? []}
        onClose={() => setMenuFor(null)}
      />
    </>
  );
}
