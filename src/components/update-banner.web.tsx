import { useCallback, useEffect, useRef, useState } from 'react';

import { UpdateBannerView } from '@/components/update-banner-view';

/** Une vérification au plus toutes les 30 min (et au retour sur l'onglet) */
const CHECK_EVERY_MS = 30 * 60_000;
/** Identifiant de cette version, écrit par scripts/web-build.mjs (aussi dans /version.json) */
const MY_BUILD = process.env.EXPO_PUBLIC_WEB_BUILD ?? '';

/**
 * Version web : compare /version.json (déployé avec l'app web) à la version chargée.
 * Nouvelle version → bandeau « Nouvelle version disponible » + « Recharger ».
 */
export function UpdateBanner() {
  const [next, setNext] = useState<{ build: string; message: string | null } | null>(null);
  const [later, setLater] = useState<string | null>(null);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (!MY_BUILD) return;
    lastCheck.current = Date.now();
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()) as { build?: string; message?: string };
      if (v.build && v.build !== MY_BUILD) setNext({ build: v.build, message: v.message?.trim() || null });
    } catch {
      // hors connexion : on réessaiera
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(check, 0);
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current >= CHECK_EVERY_MS) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  if (!next || later === next.build) return null;
  return (
    <UpdateBannerView
      title="✨ Nouvelle version disponible"
      details={next.message ? `Nouveautés : ${next.message}` : null}
      actionLabel="Recharger"
      onAction={() => window.location.reload()}
      onLater={() => setLater(next.build)}
    />
  );
}
