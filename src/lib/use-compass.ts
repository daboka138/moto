import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** En dessous de cet écart (degrés), on ne rafraîchit pas l'écran */
const MIN_CHANGE_DEG = 3;

/**
 * Boussole du téléphone (cap vrai si disponible, sinon magnétique), active seulement quand l'écran
 * est affiché. Sert à orienter ma flèche à l'arrêt, quand le cap GPS n'est pas fiable.
 */
export function useCompass(): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let subscription: Location.LocationSubscription | undefined;
      let cancelled = false;
      Location.watchHeadingAsync((h) => {
        const value = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (value < 0) return;
        setHeading((prev) => {
          if (prev === null) return value;
          const delta = Math.abs(((value - prev + 540) % 360) - 180);
          return delta < MIN_CHANGE_DEG ? prev : value;
        });
      })
        .then((s) => {
          if (cancelled) s.remove();
          else subscription = s;
        })
        .catch(() => {
          // Pas de boussole sur ce téléphone : la flèche suit le cap GPS seulement
        });
      return () => {
        cancelled = true;
        subscription?.remove();
      };
    }, []),
  );

  return heading;
}
