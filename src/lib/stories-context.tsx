import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from '@/lib/session';
// DEMO
import { useDemoMode } from '@/demo/demo-context';
import { demoStories } from '@/demo/stories';
import { fetchStories, fetchViewedIds, markStoryViewed, type Story } from '@/lib/stories';

type StoriesState = {
  stories: Story[];
  viewed: Set<string>;
  refresh: () => Promise<void>;
  markViewed: (story: Story) => void;
};

const StoriesContext = createContext<StoriesState | null>(null);

const REFRESH_MS = 60_000;

/** Stories actives visibles par moi (+ celles des faux motards en démo), et celles que j'ai déjà vues. */
export function StoriesProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession();
  const userId = profile ? session?.user.id : undefined;
  const [loaded, setLoaded] = useState<{ userId: string; stories: Story[] } | null>(null);
  const [viewed, setViewed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [stories, viewedIds] = await Promise.all([fetchStories(), fetchViewedIds(userId)]);
      setLoaded({ userId, stories });
      // On garde les vues locales (démo, ou pas encore renvoyées par le serveur)
      setViewed((v) => new Set([...v, ...viewedIds]));
    } catch (e) {
      console.warn('Chargement des stories impossible', e);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => !cancelled && refresh();
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId, refresh]);

  const markViewed = (story: Story) => {
    if (viewed.has(story.id)) return;
    setViewed((v) => new Set(v).add(story.id));
    if (!story.isDemo && userId && story.ownerId !== userId) {
      markStoryViewed(userId, story.id).catch((e) => console.warn('Vue non enregistrée', e));
    }
  };

  const demo = useDemoMode();
  const stories = [
    ...(loaded && loaded.userId === userId ? loaded.stories : []),
    ...(demo.enabled ? demoStories(demo.friendIds) : []),
  ];
  return <StoriesContext.Provider value={{ stories, viewed, refresh, markViewed }}>{children}</StoriesContext.Provider>;
}

export function useStories() {
  const ctx = useContext(StoriesContext);
  if (!ctx) throw new Error('useStories doit être utilisé dans <StoriesProvider>');
  return ctx;
}
