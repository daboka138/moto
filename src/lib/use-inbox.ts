import type { Conversation } from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';

/** Toutes mes conversations, la plus récente d'abord, et le total de non-lus. */
export function useInbox(): { conversations: Conversation[]; unreadTotal: number } {
  const { conversations, unreadTotal } = useMessages();
  return {
    conversations: [...conversations].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    unreadTotal,
  };
}
