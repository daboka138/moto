import { ReportIcon } from '@/components/map-icon';
import type { ReportType } from '@/lib/reports';

/** Panneau de signalement (même dessin que sur la carte, constants/map-icons.ts) */
export function ReportSign({ type, size = 44 }: { type: ReportType; size?: number }) {
  return <ReportIcon type={type} size={size} />;
}
