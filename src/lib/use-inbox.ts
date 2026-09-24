import type { Conversation } from '@/lib/messages';
import { useMessages } from '@/lib/messages-context';
// DEMO
import { useDemoMode } from '@/demo/demo-context';
import { useDemoMessages } from '@/demo/messages';

/** Toutes mes conversations (vraies + démo), la plus récente d'abord, et le total de non-lus. */
export function useInbox(): { conversations: Conversation[]; unreadTotal: number } {
  const real = useMessages();
  const demo = useDemoMode();
  const demoMessages = useDemoMessages();
  const conversations = [...real.conversations, ...(demo.enabled ? demoMessages.conversations : [])].sort((a, b) =>
    b.lastAt.localeCompare(a.lastAt),
  );
  return {
    conversations,
    unreadTotal: real.unreadTotal + (demo.enabled ? demoMessages.unreadTotal : 0),
  };
}
