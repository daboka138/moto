import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Compte du créateur de l'appli (app_settings.creator_user_id, public) : il envoie le message de
// bienvenue et porte le badge « Créateur de PasseRyder » dans la conversation.

export const CREATOR_BADGE = 'Créateur de PasseRyder';

let cached: string | null | undefined;
let pending: Promise<string | null> | null = null;

function load(): Promise<string | null> {
  pending ??= Promise.resolve(supabase.from('app_settings').select('value').eq('key', 'creator_user_id').maybeSingle())
    .then(({ data }) => {
      const value: string | null = data?.value ?? null;
      cached = value;
      return value;
    })
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

/** Id du créateur (null tant qu'il n'est pas connu) */
export function useCreatorId() {
  const [id, setId] = useState<string | null>(cached ?? null);
  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;
    load().then((v) => alive && setId(v));
    return () => {
      alive = false;
    };
  }, []);
  return id;
}
