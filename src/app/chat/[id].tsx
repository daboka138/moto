import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { showActionSheet, type SheetOption } from '@/components/action-sheet';
import { ChatView, type ChatPerson, type MessageStatus, type ReactionSummary } from '@/components/chat-view';
import { MessageMenu, type MessageAction } from '@/components/message-menu';
import { WallpaperViewer } from '@/components/wallpaper-viewer';
import { copyText } from '@/lib/clipboard';
import { fetchGroupInfo, moderateGroupMessage, pinGroupMessage, type GroupInfo } from '@/lib/community';
import { CREATOR_BADGE, useCreatorId } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import {
  deleteMessageForAll,
  editMessage,
  fetchMembers,
  fetchMessages,
  fetchReactions,
  fetchReadReceipts,
  hideMessage,
  isMuted,
  markConversationRead,
  reactToMessage,
  fetchMessage,
  sendMessage,
  sendVoiceMessage,
  setConversationMute,
  signChatImages,
  toMessage,
  toReaction,
  type Member,
  type Message,
  type Reaction,
} from '@/lib/messages';
import { canDeleteForAll, canEditMessage } from '@/lib/message-rules';
import { useMessages } from '@/lib/messages-context';
import { askBlock, askReport } from '@/lib/moderation';
import type { PickedImage } from '@/lib/pick-image';
import type { RecordedVoice } from '@/lib/voice-recorder';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useChatWallpaper, useWallpaperPhotoUrl } from '@/lib/wallpapers';

/** Une conversation (privée, de balade ou de groupe). */
export default function ChatScreen() {
  // draft : texte pré-rempli (demande de place passager…)
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { setActiveConversation } = useMessages();

  // Pas de notification pour la conversation affichée
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(id);
      return () => setActiveConversation(null);
    }, [id, setActiveConversation]),
  );

  return <RealChat id={id} draft={draft} />;
}

/** Ajoute ou remplace des messages sans doublon, du plus récent au plus ancien */
function merge(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function RealChat({ id, draft }: { id: string; draft?: string }) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const { conversations, refresh } = useMessages();
  const conv = conversations.find((c) => c.id === id);
  const creatorId = useCreatorId();
  const [messages, setMessages] = useState<{ id: string; list: Message[] } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // Réactions : message → (membre → emoji)
  const [reactions, setReactions] = useState<Map<string, Map<string, string>>>(new Map());
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [editing, setEditing] = useState<Message | null>(null);
  const [replying, setReplying] = useState<Message | null>(null);
  // Petit message passager (« Copié »)
  const [flash, setFlash] = useState<string | null>(null);
  // Menu d'un message (par id : il suit la version à jour du message, temps réel compris)
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [viewingWallpaper, setViewingWallpaper] = useState(false);
  // Fond d'écran personnel (l'autre ne le voit pas)
  const { wallpaper } = useChatWallpaper(userId, id);
  const wallpaperPhotoUrl = useWallpaperPhotoUrl(wallpaper?.kind === 'photo' ? wallpaper.value : null);
  // Mes accusés de lecture : coupés, je ne vois pas non plus ceux des autres
  const [receipts, setReceipts] = useState(true);

  const signNew = useCallback(async (list: Message[]) => {
    const paths = list.flatMap((m) => [m.imagePath, m.audioPath]).filter((p): p is string => !!p);
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

  const sendVoice = async (audio: RecordedVoice) => {
    try {
      await sendVoiceMessage(userId, id, audio, replying?.id);
      setReplying(null);
      await latest();
    } catch (e) {
      Alert.alert('Envoi impossible', errorMessage(e));
    }
  };

  const send = async (text: string, image?: PickedImage) => {
    try {
      await sendMessage(userId, id, text, image, replying?.id);
      setReplying(null);
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

  const removeForMe = (m: Message) =>
    hideMessage(m.id)
      .then(() => setMessages((cur) => (cur ? { id: cur.id, list: cur.list.filter((x) => x.id !== m.id) } : cur)))
      .catch((e) => Alert.alert('Suppression impossible', errorMessage(e)));

  // Groupes : public / officiel, message épinglé (règles du groupe de la commu)
  const [groupInfo, setGroupInfo] = useState<{ id: string; info: GroupInfo } | null>(null);
  const [pinnedFetched, setPinnedFetched] = useState<Message | null>(null);
  const isGroupConv = conv?.kind === 'group';
  const loadGroupInfo = useCallback(() => {
    fetchGroupInfo(id)
      .then((info) => info && setGroupInfo({ id, info }))
      .catch((e) => console.warn('Infos du groupe indisponibles', e));
  }, [id]);
  useEffect(() => {
    if (isGroupConv) loadGroupInfo();
  }, [isGroupConv, loadGroupInfo]);
  const info = groupInfo?.id === id ? groupInfo.info : null;
  const pinnedId = info?.pinnedMessageId ?? null;
  const pinnedLoaded = messages?.id === id ? messages.list.find((m) => m.id === pinnedId) : undefined;
  useEffect(() => {
    if (!pinnedId || pinnedLoaded) return;
    fetchMessage(pinnedId)
      .then(setPinnedFetched)
      .catch(() => {});
  }, [pinnedId, pinnedLoaded]);
  const pinned = pinnedLoaded ?? (pinnedFetched?.id === pinnedId ? pinnedFetched : null);
  const isGroupAdmin = isGroupConv && conv?.myRole === 'admin';

  const togglePin = (m: Message) =>
    pinGroupMessage(id, pinnedId === m.id ? null : m.id)
      .then(loadGroupInfo)
      .catch((e) => Alert.alert('Épingler', errorMessage(e)));

  const moderate = (m: Message) =>
    Alert.alert('Supprimer ce message ?', 'Modération : il est effacé pour tous les membres du groupe.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          moderateGroupMessage(m.id)
            .then(() => {
              latest();
              loadGroupInfo();
            })
            .catch((e) => Alert.alert('Modération', errorMessage(e))),
      },
    ]);

  const removeForAll = (m: Message) =>
    deleteMessageForAll(m.id)
      .then(latest)
      .catch((e) => Alert.alert('Suppression impossible', errorMessage(e)));

  // Menu d'un message : ✏️ Modifier (le mien, 1 h) en premier, puis Copier, Répondre, Supprimer
  // (Modifier ne dépend que de l'auteur et de l'heure d'envoi, jamais du statut envoyé / reçu / vu)
  const messageActions = (m: Message): MessageAction[] => {
    const mine = m.senderId === userId;
    const actions: MessageAction[] = [];
    if (canEditMessage(m, userId))
      actions.push({
        label: '✏️ Modifier',
        onPress: () => {
          setReplying(null);
          setEditing(m);
        },
      });
    if (m.body && !m.tripShareId && !m.audioPath)
      actions.push({
        label: '📋 Copier',
        onPress: () =>
          copyText(m.body ?? '')
            .then(() => {
              setFlash('Message copié');
              setTimeout(() => setFlash(null), 1800);
            })
            .catch((e) => Alert.alert('Copie impossible', errorMessage(e))),
      });
    if (!conv?.blocked)
      actions.push({
        label: '↩️ Répondre',
        onPress: () => {
          setEditing(null);
          setReplying(m);
        },
      });
    actions.push({
      label: '🗑️ Supprimer',
      destructive: true,
      onPress: () =>
        canDeleteForAll(m, userId)
          ? Alert.alert('Supprimer ce message ?', 'Pour tout le monde, il est effacé chez tous les membres.', [
              { text: 'Pour moi', onPress: () => removeForMe(m) },
              { text: 'Pour tout le monde', style: 'destructive', onPress: () => removeForAll(m) },
              { text: 'Annuler', style: 'cancel' },
            ])
          : Alert.alert('Supprimer ce message ?', 'Il disparaît seulement chez toi.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: () => removeForMe(m) },
            ]),
    });
    if (isGroupAdmin && m.kind === 'user' && !m.deletedAt) {
      actions.push({ label: pinnedId === m.id ? '📌 Désépingler' : '📌 Épingler', onPress: () => togglePin(m) });
      if (!mine) actions.push({ label: '🛡️ Supprimer (modération)', destructive: true, onPress: () => moderate(m) });
    }
    if (!mine) actions.push({ label: '🚩 Signaler ce message', destructive: true, onPress: () => askReport('message', m.id) });
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

  const chooseWallpaper = () => router.push({ pathname: '/chat/wallpaper', params: { id } });
  const wallpaperOption: SheetOption = { label: '🖼️ Fond d’écran', onPress: chooseWallpaper };
  // Icône 👁 de la barre du haut : le fond en grand, ou directement le choix s'il n'y en a pas
  const showWallpaper = () => (wallpaper ? setViewingWallpaper(true) : chooseWallpaper());

  const shownList = messages?.id === id ? messages.list : null;
  const menuMessage = menuForId ? (shownList?.find((m) => m.id === menuForId) ?? null) : null;

  const menu = () => {
    if (!conv) return;
    if (conv.kind === 'ride') {
      showActionSheet({ options: [{ label: 'Voir la balade', onPress: openTitle }, wallpaperOption, ...muteOptions()] });
      return;
    }
    if (conv.kind === 'group') {
      showActionSheet({ options: [{ label: 'Infos du groupe', onPress: openTitle }, wallpaperOption, ...muteOptions()] });
      return;
    }
    const otherId = conv.otherId;
    if (!otherId) return;
    const username = conv.title.replace(/^@/, '');
    showActionSheet({
      options: [
        { label: 'Voir le profil', onPress: openTitle },
        wallpaperOption,
        ...muteOptions(),
        { label: 'Signaler ce motard', onPress: () => askReport('user', otherId) },
        ...(conv.blocked
          ? []
          : [{ label: `Bloquer @${username}`, destructive: true, onPress: () => askBlock(userId, { id: otherId, username }, refresh) }]),
      ],
    });
  };

  const subtitle = conv
    ? [
        info?.isPublic ? '🌍 Groupe public' : null,
        conv.kind === 'group' ? `${conv.membersCount} membres` : null,
        isMuted(conv) ? '🔕 en sourdine' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <>
      <ChatView
        title={conv?.title ?? ''}
        avatarUrl={conv?.kind === 'ride' ? null : (conv?.avatarUrl ?? other?.avatarUrl ?? null)}
        avatarIcon={conv?.kind === 'group' ? 'people' : 'flag'}
        isGroup={isGroup}
        subtitle={subtitle}
        titleBadge={conv?.kind === 'direct' && !!creatorId && conv.otherId === creatorId ? CREATOR_BADGE : null}
        onTitlePress={conv ? openTitle : undefined}
        onMenu={conv ? menu : undefined}
        onWallpaper={showWallpaper}
        messages={shownList}
        meId={userId}
        people={people}
        imageUrl={(path) => images.get(path)}
        statusOf={statusOf}
        reactionsOf={reactionsOf}
        onReact={react}
        onSend={send}
        onSendVoice={sendVoice}
        initialText={draft}
        pinned={pinned && !pinned.deletedAt ? pinned.body : null}
        onMessageLongPress={(m) => setMenuForId(m.id)}
        onMyMessagePress={showStatus}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onEdit={edit}
        replying={replying}
        onCancelReply={() => setReplying(null)}
        flash={flash}
        wallpaper={wallpaper}
        wallpaperPhotoUrl={wallpaperPhotoUrl}
        disabledReason={conv?.blocked ? 'Tu ne peux plus écrire dans cette conversation (motard bloqué).' : null}
      />
      <MessageMenu
        visible={!!menuMessage}
        myReaction={menuMessage ? (reactions.get(menuMessage.id)?.get(userId) ?? null) : null}
        onReact={menuMessage && !menuMessage.deletedAt ? (emoji) => react(menuMessage, emoji) : null}
        actions={menuMessage ? messageActions(menuMessage) : []}
        onClose={() => setMenuForId(null)}
      />
      {wallpaper && (
        <WallpaperViewer
          visible={viewingWallpaper}
          wallpaper={wallpaper}
          photoUrl={wallpaperPhotoUrl}
          onClose={() => setViewingWallpaper(false)}
          onChange={() => {
            setViewingWallpaper(false);
            chooseWallpaper();
          }}
        />
      )}
    </>
  );
}
