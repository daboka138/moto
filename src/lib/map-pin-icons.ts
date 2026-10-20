import type { MapPinIcon } from '@/components/map-types';
import { fuelStationIconSvg, parkingIconSvg, placeIconSvg, reportIconSvg, signalIconSvg, zoneIconSvg } from '@/constants/map-icons';
import { MapIconColors } from '@/constants/theme';
import type { PlaceKind } from '@/lib/places';
import type { ReportType } from '@/lib/reports';

// Icônes des repères de la carte (note 32), mêmes dessins que les grilles et les fiches.
// Taille sur la carte : ~34 px (lisible sans masquer la route), feux et zones plus petits.

const cache = new Map<string, MapPinIcon>();
const memo = (key: string, make: () => MapPinIcon) => {
  let icon = cache.get(key);
  if (!icon) cache.set(key, (icon = make()));
  return icon;
};

/** Signalement : triangle, pointe posée sur le lieu */
export const reportPinIcon = (type: ReportType) =>
  memo(`report:${type}`, () => ({ svg: reportIconSvg(type, MapIconColors), width: 34, height: 34, anchor: 'bottom' }));

export const placePinIcon = (kind: PlaceKind) =>
  memo(`place:${kind}`, () => ({ svg: placeIconSvg(kind, MapIconColors), width: 32, height: 32 }));

export const parkingPinIcon = () => memo('parking', () => ({ svg: parkingIconSvg(MapIconColors), width: 28, height: 28 }));

/** Station-service (prix officiels) ; big = la moins chère du trajet */
export const fuelPinIcon = (big = false) =>
  memo(`fuel:${big}`, () => ({ svg: fuelStationIconSvg(MapIconColors), width: big ? 38 : 28, height: big ? 38 : 28 }));

export const signalPinIcon = () => memo('signal', () => ({ svg: signalIconSvg(MapIconColors), width: 14, height: 26 }));

/** Zone de danger : petit triangle plein */
export const zonePinIcon = () => memo('zone', () => ({ svg: zoneIconSvg(MapIconColors), width: 26, height: 26, anchor: 'bottom' }));
