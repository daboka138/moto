import { useEffect, useRef } from 'react';

import { ANNOUNCE_M, type DangerAhead } from '@/lib/danger';
import { spokenDistance } from '@/lib/navigation';
import { reportInfo } from '@/lib/reports';
import { speak } from '@/lib/voice';

export { dangerAhead, type DangerAhead } from '@/lib/danger';

/** Alerte vocale une seule fois par signalement : « Gravillons signalés dans 500 mètres ». */
export function useDangerAnnouncements(danger: DangerAhead | null) {
  const announced = useRef(new Set<string>());

  useEffect(() => {
    if (!danger || danger.distanceM > ANNOUNCE_M) return;
    if (announced.current.has(danger.report.id)) return;
    announced.current.add(danger.report.id);
    speak(`Attention, ${reportInfo(danger.report.type).spoken.toLowerCase()} dans ${spokenDistance(danger.distanceM)}`, true);
  }, [danger]);
}
