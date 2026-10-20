import { useEffect, useRef } from 'react';

import { dangerAnnounceDistance, type DangerAhead } from '@/lib/danger';
import { spokenDistance } from '@/lib/navigation';
import { reportInfo } from '@/lib/reports';
import { speak } from '@/lib/voice';

export { dangerAhead, type DangerAhead } from '@/lib/danger';

/**
 * Alerte vocale « Attention, gravillons signalés dans 400 mètres » UNE seule fois par signalement,
 * ~20 s avant à ma vitesse (250 à 600 m) : jamais répétée, même si la position saute.
 */
export function useDangerAnnouncements(danger: DangerAhead | null, speedKmh: number) {
  const announced = useRef(new Set<string>());

  useEffect(() => {
    if (!danger) return;
    const { id, type } = danger.report;
    if (announced.current.has(id) || danger.distanceM > dangerAnnounceDistance(speedKmh)) return;
    announced.current.add(id);
    speak(`Attention, ${reportInfo(type).spoken.toLowerCase()} dans ${spokenDistance(danger.distanceM)}.`, true, 'danger');
    // speedKmh : seulement pour la distance d'annonce, pas une raison de réévaluer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [danger]);
}

