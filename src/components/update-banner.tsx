import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { UpdateBannerView } from '@/components/update-banner-view';
import { useAppBusy } from '@/lib/app-busy';
import { useHomecoming } from '@/lib/homecoming';

/** Une vérification au plus toutes les 30 min quand l'app revient au premier plan */
const CHECK_EVERY_MS = 30 * 60_000;

/**
 * Avis de mise à jour (EAS Update) : vérifie au lancement et au retour au premier plan,
 * télécharge sans bloquer, puis propose « Redémarrer ». Jamais affiché (donc jamais de
 * redémarrage) pendant une navigation, un convoi, un SOS ou un « Je rentre » : on attend la fin.
 * Sans redémarrage, la mise à jour s'applique toute seule au prochain lancement.
 */
export function UpdateBanner() {
  const { isUpdatePending, isDownloading, downloadedUpdate } = Updates.useUpdates();
  const busy = useAppBusy();
  const homecoming = useHomecoming();
  const [fetching, setFetching] = useState(false);
  const [later, setLater] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (!Updates.isEnabled || __DEV__) return;
    lastCheck.current = Date.now();
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) return;
      setFetching(true);
      await Updates.fetchUpdateAsync();
    } catch (e) {
      console.warn('Mise à jour indisponible', e);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    // Au lancement (juste après le premier affichage), puis au retour au premier plan
    const first = setTimeout(check, 0);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheck.current >= CHECK_EVERY_MS) check();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [check]);

  if (busy.size > 0 || homecoming) return null;
  if (isUpdatePending) {
    if (later) return null;
    const manifest = downloadedUpdate?.manifest as { extra?: { expoClient?: { extra?: { whatsNew?: unknown } } } } | undefined;
    const whatsNew = manifest?.extra?.expoClient?.extra?.whatsNew;
    return (
      <UpdateBannerView
        title="✅ Mise à jour prête"
        details={typeof whatsNew === 'string' && whatsNew ? `Nouveautés : ${whatsNew}` : null}
        actionLabel="Redémarrer"
        onAction={() => Updates.reloadAsync().catch((e) => console.warn('Redémarrage impossible', e))}
        onLater={() => setLater(true)}
      />
    );
  }
  if (fetching || isDownloading) return <UpdateBannerView title="⬇️ Nouvelle mise à jour en cours de téléchargement…" />;
  return null;
}
