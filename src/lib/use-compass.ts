import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { angleDelta } from '@/lib/heading-filter';

/** En dessous de cet écart (degrés), on ne rafraîchit pas l'écran (bruit du magnétomètre) */
const MIN_CHANGE_DEG = 8;
/** Au plus 4 rafraîchissements par seconde : chaque changement redessine tout l'écran de la carte */
const MIN_INTERVAL_MS = 250;
/** Part de chaque nouvelle mesure dans le cap lissé */
const SMOOTHING = 0.3;

/**
 * Boussole du téléphone (cap vrai si disponible, sinon magnétique), lissée, active seulement quand
 * l'écran est affiché et `enabled`. Sert à orienter ma flèche à l'arrêt quand aucun cap GPS fiable
 * n'est connu (hors navigation : dans une voiture, elle est faussée, lib/heading-filter.ts).
 */
export function useCompass(enabled = true): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let subscription: Location.LocationSubscription | undefined;
      let cancelled = false;
      let lastAt = 0;
      let smooth: number | null = null;
      Location.watchHeadingAsync((h) => {
        const value = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
        if (value < 0) return;
        smooth = smooth === null ? value : (smooth + angleDelta(smooth, value) * SMOOTHING + 360) % 360;
        const now = Date.now();
        if (now - lastAt < MIN_INTERVAL_MS) return;
        lastAt = now;
        const next = smooth;
        setHeading((prev) => (prev !== null && Math.abs(angleDelta(prev, next)) < MIN_CHANGE_DEG ? prev : next));
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
    }, [enabled]),
  );

  return enabled ? heading : null;
}
