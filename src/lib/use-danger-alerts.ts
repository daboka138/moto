import { useEffect, useRef } from 'react';

import { announcementStage, type DangerAhead } from '@/lib/danger';
import { spokenDistance } from '@/lib/navigation';
import { reportInfo } from '@/lib/reports';
import { speak } from '@/lib/voice';

export { dangerAhead, type DangerAhead } from '@/lib/danger';

/**
 * Alerte vocale « Attention, gravillons signalés dans 500 mètres » dès que le danger est à moins de
 * 600 m sur mon trajet, puis un rappel à 200 m. Une seule fois par étape et par signalement.
 */
export function useDangerAnnouncements(danger: DangerAhead | null) {
  const announced = useRef(new Map<string, 'far' | 'near'>());

  useEffect(() => {
    if (!danger) return;
    const { id, type } = danger.report;
    const next = announcementStage(announced.current.get(id) ?? null, danger.distanceM);
    if (!next) return;
    announced.current.set(id, next);
    speak(`Attention, ${reportInfo(type).spoken.toLowerCase()} dans ${spokenDistance(danger.distanceM)}`, true, 'danger');
  }, [danger]);
}

