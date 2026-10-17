import { useCallback, useEffect, useRef, useState } from 'react';

import { UpdateBannerView } from '@/components/update-banner-view';
import { WEB_BUILD } from '@/constants/web-build';

/** Une vérification au plus toutes les 30 min (et au retour sur l'onglet) */
const CHECK_EVERY_MS = 30 * 60_000;
/** Identifiant de la version intégrée au bundle chargé (écrit par scripts/web-build.mjs) */
const MY_BUILD = WEB_BUILD === 'dev' ? '' : WEB_BUILD;
/** Version pour laquelle on a déjà rechargé (sessionStorage) : jamais de boucle de rechargement */
const RELOADED_KEY = 'moto.webReloadedFor';

function readReloadedFor(): string | null {
  try {
    return sessionStorage.getItem(RELOADED_KEY);
  } catch {
    return null;
  }
}

/**
 * Recharge vraiment la dernière version : service worker mis à jour puis désinscrit, caches vidés,
 * page rechargée avec un paramètre anti-cache (retiré au chargement suivant par history.replaceState).
 */
async function hardReload(build: string) {
  try {
    sessionStorage.setItem(RELOADED_KEY, build);
  } catch {
    // stockage indisponible : rechargement quand même
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // pas de service worker
  }
  try {
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // pas de Cache Storage
  }
  try {
    await fetch('/', { cache: 'reload' });
  } catch {
    // hors connexion : le rechargement dira la même chose
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_v', build);
  window.location.replace(url.toString());
}

/** Retire le paramètre anti-cache ?_v= de l'adresse affichée */
function cleanUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('_v')) return;
    url.searchParams.delete('_v');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // rien
  }
}

/**
 * Version web : compare /version.json (déployé avec l'app web) à la version intégrée au bundle.
 * Versions différentes → bandeau « Nouvelle version disponible » + « Recharger » ; identiques → jamais.
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
      if (!v.build || v.build === MY_BUILD) {
        setNext(null);
        return;
      }
      // Déjà rechargé pour cette version et toujours l'ancien bundle (cache réseau tiers) : on n'insiste pas
      if (readReloadedFor() === v.build) return;
      setNext({ build: v.build, message: v.message?.trim() || null });
    } catch {
      // hors connexion : on réessaiera
    }
  }, []);

  useEffect(() => {
    cleanUrl();
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
      onAction={() => hardReload(next.build)}
      onLater={() => setLater(next.build)}
    />
  );
}
