import type { MapRoute } from '@/components/map-types';
import { RoadRatingColors } from '@/constants/theme';
import type { CommunityPlace } from '@/lib/places';
import { roadTier } from '@/lib/road-rules';

/**
 * Calque « Routes plaisir » : tracé de chaque route notée, coloré selon sa note, fin et sous les
 * autres tracés ; la route sélectionnée (son repère touché) est dessinée en plein.
 */
export function roadMapRoutes(places: CommunityPlace[] | null, selectedPlaceId: string | null): MapRoute[] {
  return (places ?? [])
    .filter((p) => p.line)
    .map((p) => ({
      id: `road:${p.id}`,
      points: p.line!.map((q) => [q.latitude, q.longitude] as [number, number]),
      color: RoadRatingColors[roadTier(p.rating)],
      muted: p.id !== selectedPlaceId,
    }));
}
