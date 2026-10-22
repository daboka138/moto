import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { initialLimitState, stepLimits } from '@/lib/limit-change-rules';
import type { LimitRun } from '@/lib/speed-limit';
import { getVoiceSettings, speakWhenFree } from '@/lib/voice';

/**
 * Navigation : annonce des changements de limitation (règles dans limit-change-rules.ts).
 * pulseKey : animation du panneau en entrant sur la nouvelle limitation ; chimeKey : signal discret
 * (voix coupée) ; lastChangeAt() : pour retarder le bip de dépassement juste après un changement.
 * La voix passe après le guidage et les zones de danger (speakWhenFree).
 */
export function useLimitChangeAlerts(
  enabled: boolean,
  input: { runs: LimitRun[]; alongM: number | null; position: LatLng | null; kmh: number; live: number | null },
) {
  const state = useRef(initialLimitState());
  const changedAt = useRef(0);
  const [keys, setKeys] = useState({ pulse: 0, chime: 0 });
  const { runs, alongM, position, kmh, live } = input;

  useEffect(() => {
    if (!enabled) {
      state.current = initialLimitState();
      return;
    }
    const now = Date.now();
    const { state: next, event } = stepLimits(state.current, { runs, alongM, position, kmh, live, now });
    state.current = next;
    if (!event) return;
    if (event.type === 'enter') changedAt.current = now;
    const voice = getVoiceSettings();
    const pulse = event.type === 'enter' ? 1 : 0;
    const chime = event.speak && voice.muted && voice.limitChime ? 1 : 0;
    if (event.speak && !voice.muted) speakWhenFree(event.text);
    // Animation et signal envoyés à l'écran comme un événement (après cette étape)
    if (pulse || chime) queueMicrotask(() => setKeys((k) => ({ pulse: k.pulse + pulse, chime: k.chime + chime })));
    // Une étape par position GPS (ou par nouvelle limitation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, position?.latitude, position?.longitude, live, runs]);

  const lastChangeAt = useCallback(() => changedAt.current, []);
  return { pulseKey: keys.pulse, chimeKey: keys.chime, lastChangeAt };
}
