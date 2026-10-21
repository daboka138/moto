import { useEffect, useRef, useState } from 'react';

import { initialNavZoom, navZoomOf, stepNavZoom } from '@/lib/nav-view';

/** Zoom de navigation selon la vitesse (paliers avec marge et délai : pas de changements brusques) */
export function useNavZoom(navigating: boolean, kmh: number): number {
  const speed = useRef(kmh);
  useEffect(() => {
    speed.current = kmh;
  }, [kmh]);
  const [zoom, setZoom] = useState(() => navZoomOf(initialNavZoom()));
  useEffect(() => {
    let state = initialNavZoom();
    const tick = () => {
      state = navigating ? stepNavZoom(state, speed.current, Date.now()) : initialNavZoom();
      setZoom(navZoomOf(state));
    };
    // Tout de suite (zoom de départ), puis une mesure par seconde (vitesse lissée sur quelques secondes)
    const first = setTimeout(tick, 0);
    const timer = navigating ? setInterval(tick, 1000) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [navigating]);
  return zoom;
}
