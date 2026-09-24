import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { useMapLayers } from '@/lib/map-layers';
import { isNight } from '@/lib/sun';

/** Centre de la France : sert si on ne connaît pas encore la position */
const FALLBACK: LatLng = { latitude: 46.6, longitude: 2.4 };
const CHECK_MS = 60_000;

/**
 * Tuiles sombres ou non, selon le réglage « Style de carte » (et non le thème de l'app).
 * En automatique : sombre entre le coucher et le lever du soleil, vérifié chaque minute.
 */
export function useMapDark(position: LatLng | null): boolean {
  const { mapStyle } = useMapLayers();
  const [lastKnown, setLastKnown] = useState<LatLng | null>(null);
  const [now, setNow] = useState(() => new Date());

  const auto = mapStyle === 'auto';
  const needsFix = auto && !position;

  useEffect(() => {
    if (!needsFix) return;
    let cancelled = false;
    Location.getLastKnownPositionAsync()
      .then((p) => {
        if (!cancelled && p) setLastKnown({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsFix]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => setNow(new Date()), CHECK_MS);
    return () => clearInterval(timer);
  }, [auto]);

  if (mapStyle === 'classic') return false;
  if (mapStyle === 'dark') return true;
  const where = position ?? lastKnown ?? FALLBACK;
  return isNight(now, where.latitude, where.longitude);
}
