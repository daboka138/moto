import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { initialCompass, stepCompass } from '@/lib/compass-filter';

/**
 * Faisceau de la boussole (où pointe le téléphone), active seulement quand l'écran est affiché et
 * `enabled` (à l'arrêt). Très lissé, null si la boussole est peu fiable ou absente
 * (lib/compass-filter.ts). Ne tourne jamais la flèche ni la carte : la flèche garde le cap de
 * déplacement (lib/heading-filter.ts).
 */
export function useCompassBeam(enabled: boolean): number | null {
  const [beam, setBeam] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let subscription: Location.LocationSubscription | undefined;
      let cancelled = false;
      let state = initialCompass();
      Location.watchHeadingAsync((h) => {
        const value = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (value < 0) return;
        const prev = state.shown;
        state = stepCompass(state, { value, accuracy: h.accuracy, time: Date.now() });
        if (state.shown !== prev) setBeam(state.shown);
      })
        .then((s) => {
          if (cancelled) s.remove();
          else subscription = s;
        })
        .catch(() => {
          // Pas de boussole sur ce téléphone : pas de faisceau
        });
      return () => {
        cancelled = true;
        subscription?.remove();
        setBeam(null);
      };
    }, [enabled]),
  );

  return enabled ? beam : null;
}
