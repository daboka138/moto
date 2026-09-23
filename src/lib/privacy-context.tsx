import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { fetchPrivacy, savePrivacy, toggledGhost, type PrivacySettings } from '@/lib/privacy';
import { useSession } from '@/lib/session';

type PrivacyState = {
  /** null tant que les réglages ne sont pas chargés */
  settings: PrivacySettings | null;
  update: (next: PrivacySettings) => Promise<void>;
  toggleGhost: () => Promise<void>;
};

const PrivacyContext = createContext<PrivacyState | null>(null);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useSession();
  const userId = profile ? session?.user.id : undefined;
  const [loaded, setLoaded] = useState<{ userId: string; settings: PrivacySettings } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchPrivacy(userId)
      .then((settings) => !cancelled && setLoaded({ userId, settings }))
      .catch((e) => console.warn('Chargement de la confidentialité impossible', e));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const settings = loaded && loaded.userId === userId ? loaded.settings : null;

  const update = useCallback(
    async (next: PrivacySettings) => {
      if (!userId || !settings) return;
      setLoaded({ userId, settings: next });
      try {
        await savePrivacy(userId, next, settings);
      } catch (e) {
        setLoaded({ userId, settings });
        throw e;
      }
    },
    [userId, settings],
  );

  const toggleGhost = useCallback(async () => {
    if (settings) await update(toggledGhost(settings));
  }, [settings, update]);

  return <PrivacyContext.Provider value={{ settings, update, toggleGhost }}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy doit être utilisé dans <PrivacyProvider>');
  return ctx;
}
