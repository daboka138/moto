import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { fetchProfile, type Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type SessionState = {
  /** undefined tant que la session stockée n'a pas été relue */
  session: Session | null | undefined;
  /** undefined tant que le profil n'est pas chargé, null si pas encore créé */
  profile: Profile | null | undefined;
  /** true si le chargement du profil a échoué (réseau...) */
  profileError: boolean;
  refreshProfile: () => Promise<void>;
};

/** Résultat du dernier chargement, rattaché à l'utilisateur concerné */
type ProfileResult = { userId: string; profile: Profile | null; error: boolean };

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [result, setResult] = useState<ProfileResult | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Pas d'appel Supabase dans ce callback (risque de blocage) : on stocke juste la session
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (id: string): Promise<ProfileResult> => {
    try {
      return { userId: id, profile: await fetchProfile(id), error: false };
    } catch (e) {
      console.warn('Chargement du profil impossible', e);
      return { userId: id, profile: null, error: true };
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    load(userId).then((r) => !cancelled && setResult(r));
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  const refreshProfile = useCallback(async () => {
    if (userId) setResult(await load(userId));
  }, [userId, load]);

  // Un résultat d'un autre utilisateur (après déconnexion/reconnexion) ne compte pas
  const current = result && result.userId === userId ? result : null;

  return (
    <SessionContext.Provider
      value={{
        session,
        profile: current && !current.error ? current.profile : undefined,
        profileError: current?.error ?? false,
        refreshProfile,
      }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return ctx;
}
