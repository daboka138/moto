import { createContext, useContext, useState, type ReactNode } from 'react';

import { findDemoRider, findDemoRiderByUsername } from '@/demo/riders';
import { DEMO_LIVE_RIDE_ID, DEMO_RIDE_TITLE } from '@/demo/social';
import type { Conversation, Message } from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';

// Conversations de démo avec les faux motards (en mémoire). Quand j'écris,
// le faux motard répond au bout de quelques secondes (notification comprise).

export const DEMO_ME = 'me';

type DemoConv = {
  id: string;
  kind: 'direct' | 'ride';
  rideId: string | null;
  title: string;
  avatarUrl: string | null;
  riderIds: string[];
  messages: Message[];
  lastReadAt: string;
  /** Réponses automatiques, dans l'ordre */
  replies: string[];
};

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

function msg(conv: string, sender: string, body: string, minAgo: number, i: number): Message {
  return { id: `${conv}-m${i}`, conversationId: conv, senderId: sender, body, imagePath: null, createdAt: ago(minAgo) };
}

function initial(): DemoConv[] {
  const julie = findDemoRiderByUsername('julie_cb650r')!;
  const lucas = findDemoRiderByUsername('lucas_mt07')!;
  const noah = findDemoRiderByUsername('noah_mt125')!;
  const antoine = findDemoRiderByUsername('antoine_monster')!;
  const max = findDemoRiderByUsername('max_sportster')!;
  return [
    {
      id: 'demo-conv-ride',
      kind: 'ride',
      rideId: DEMO_LIVE_RIDE_ID,
      title: DEMO_RIDE_TITLE,
      avatarUrl: null,
      riderIds: [julie.id, antoine.id, max.id],
      messages: [
        msg('demo-conv-ride', julie.id, 'On se retrouve au port de Cassis, je suis déjà là ☕', 70, 1),
        msg('demo-conv-ride', antoine.id, 'J’arrive dans 10 min', 62, 2),
        msg('demo-conv-ride', max.id, 'Plein fait, je vous rejoins', 55, 3),
        msg('demo-conv-ride', julie.id, 'Pause photo au Cap Canaille, attention gravillons dans le 2e virage !', 12, 4),
      ],
      lastReadAt: ago(60),
      replies: ['Bien reçu 👍', 'On t’attend au prochain arrêt', 'Top, à tout de suite'],
    },
    {
      id: 'demo-conv-julie',
      kind: 'direct',
      rideId: null,
      title: `@${julie.username}`,
      avatarUrl: julie.avatar_path,
      riderIds: [julie.id],
      messages: [
        msg('demo-conv-julie', DEMO_ME, 'Tu fais la route des Crêtes ce week-end ?', 300, 1),
        msg('demo-conv-julie', julie.id, 'Oui samedi matin, tu viens ?', 290, 2),
        msg('demo-conv-julie', julie.id, 'Je t’ai ajouté à la balade 😉', 20, 3),
      ],
      lastReadAt: ago(295),
      replies: ['Génial ! RDV 9h au port', 'Pense à prendre de quoi grignoter', '🏍️🔥'],
    },
    {
      id: 'demo-conv-lucas',
      kind: 'direct',
      rideId: null,
      title: `@${lucas.username}`,
      avatarUrl: lucas.avatar_path,
      riderIds: [lucas.id],
      messages: [
        msg('demo-conv-lucas', lucas.id, 'Ça te dit un café au Garlaban dimanche ?', 1500, 1),
        msg('demo-conv-lucas', DEMO_ME, 'Carrément, 10h ?', 1490, 2),
        msg('demo-conv-lucas', lucas.id, 'Parfait 👌', 1480, 3),
      ],
      lastReadAt: ago(1470),
      replies: ['Ça marche !', 'Je te préviens si je suis en retard'],
    },
    {
      id: 'demo-conv-noah',
      kind: 'direct',
      rideId: null,
      title: `@${noah.username}`,
      avatarUrl: noah.avatar_path,
      riderIds: [noah.id],
      messages: [msg('demo-conv-noah', noah.id, 'Salut ! Tu as des conseils pour une première balade en 125 ?', 45, 1)],
      lastReadAt: ago(3000),
      replies: ['Merci pour les conseils !', 'Je viens à l’initiation Sainte-Baume du coup'],
    },
  ];
}

type DemoMessagesState = {
  conversations: Conversation[];
  unreadTotal: number;
  messagesOf: (id: string) => Message[];
  riderIdsOf: (id: string) => string[];
  send: (id: string, body: string, imageUri?: string) => void;
  markRead: (id: string) => void;
  /** Conversation privée avec un faux motard (créée si besoin) */
  openDirect: (riderId: string) => string;
  /** Discussion d'une balade de démo (créée si besoin) */
  openRide: (rideId: string, title: string, riderIds: string[]) => string;
};

const DemoMessagesContext = createContext<DemoMessagesState | null>(null);

export function DemoMessagesProvider({ children }: { children: ReactNode }) {
  const [convs, setConvs] = useState<DemoConv[]>(initial);
  const { notify } = useMessages();

  const toConversation = (c: DemoConv): Conversation => {
    const last = c.messages[c.messages.length - 1];
    return {
      id: c.id,
      kind: c.kind,
      rideId: c.rideId,
      title: c.title,
      avatarUrl: c.avatarUrl,
      otherId: c.kind === 'direct' ? c.riderIds[0] : null,
      // Les faux motards lisent tout de suite
      otherLastReadAt: new Date().toISOString(),
      blocked: false,
      lastBody: last?.body ?? null,
      lastHasImage: !!last?.imagePath,
      lastSenderId: last?.senderId ?? null,
      lastAt: last?.createdAt ?? ago(0),
      unread: c.messages.filter((m) => m.senderId !== DEMO_ME && m.createdAt > c.lastReadAt).length,
      isDemo: true,
    };
  };

  const send = (id: string, body: string, imageUri?: string) => {
    const conv = convs.find((c) => c.id === id);
    if (!conv) return;
    const now = new Date().toISOString();
    const mine: Message = {
      id: `${id}-${Date.now()}`,
      conversationId: id,
      senderId: DEMO_ME,
      body: body.trim() || null,
      imagePath: imageUri ?? null,
      createdAt: now,
    };
    const sentBefore = conv.messages.filter((m) => m.senderId === DEMO_ME).length;
    const text = conv.replies[sentBefore % conv.replies.length];
    const from = conv.riderIds[Math.floor(Math.random() * conv.riderIds.length)];
    setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, messages: [...c.messages, mine], lastReadAt: now } : c)));
    // Réponse automatique du faux motard
    setTimeout(() => {
      const reply: Message = {
        id: `${id}-r${Date.now()}`,
        conversationId: id,
        senderId: from,
        body: text,
        imagePath: null,
        createdAt: new Date().toISOString(),
      };
      setConvs((cs) => cs.map((c) => (c.id === id ? { ...c, messages: [...c.messages, reply] } : c)));
      notify({ title: conv.title, body: text, conversationId: id, isDemo: true });
    }, 2500 + Math.random() * 2000);
  };

  const openDirect = (riderId: string) => {
    const existing = convs.find((c) => c.kind === 'direct' && c.riderIds[0] === riderId);
    if (existing) return existing.id;
    const rider = findDemoRider(riderId);
    const id = `demo-conv-dm-${riderId}`;
    setConvs((cs) => [
      ...cs,
      {
        id,
        kind: 'direct',
        rideId: null,
        title: `@${rider?.username ?? '?'}`,
        avatarUrl: rider?.avatar_path ?? null,
        riderIds: [riderId],
        messages: [],
        lastReadAt: new Date().toISOString(),
        replies: ['Salut ! 👋', 'Avec plaisir, on se fait une sortie bientôt ?', 'Carrément 🏍️'],
      },
    ]);
    return id;
  };

  const openRide = (rideId: string, title: string, riderIds: string[]) => {
    const existing = convs.find((c) => c.kind === 'ride' && c.rideId === rideId);
    if (existing) return existing.id;
    const id = `demo-conv-ride-${rideId}`;
    setConvs((cs) => [
      ...cs,
      {
        id,
        kind: 'ride',
        rideId,
        title,
        avatarUrl: null,
        riderIds: riderIds.length ? riderIds : [findDemoRiderByUsername('julie_cb650r')!.id],
        messages: [],
        lastReadAt: new Date().toISOString(),
        replies: ['Hâte d’y être !', 'Quelqu’un a une idée de resto pour la pause ?', 'Pensez au plein avant le départ'],
      },
    ]);
    return id;
  };

  const conversations = convs.map(toConversation);
  return (
    <DemoMessagesContext.Provider
      value={{
        conversations,
        unreadTotal: conversations.reduce((n, c) => n + c.unread, 0),
        messagesOf: (id) => [...(convs.find((c) => c.id === id)?.messages ?? [])].reverse(),
        riderIdsOf: (id) => convs.find((c) => c.id === id)?.riderIds ?? [],
        send,
        openDirect,
        openRide,
        // Ne change l'état que s'il y a vraiment du non-lu (évite les rendus en boucle)
        markRead: (id) =>
          setConvs((cs) =>
            cs.some((c) => c.id === id && c.messages.some((m) => m.senderId !== DEMO_ME && m.createdAt > c.lastReadAt))
              ? cs.map((c) => (c.id === id ? { ...c, lastReadAt: new Date().toISOString() } : c))
              : cs,
          ),
      }}>
      {children}
    </DemoMessagesContext.Provider>
  );
}

export function useDemoMessages() {
  const ctx = useContext(DemoMessagesContext);
  if (!ctx) throw new Error('useDemoMessages doit être utilisé dans <DemoMessagesProvider>');
  return ctx;
}
