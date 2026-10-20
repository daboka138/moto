import { SvgXml } from 'react-native-svg';

import { MapIconColors } from '@/constants/theme';
import { fuelStationIconSvg, placeIconSvg, reportIconSvg, zoneIconSvg } from '@/constants/map-icons';
import type { PlaceKind } from '@/lib/places';
import type { ReportType } from '@/lib/reports';

// Mêmes icônes que sur la carte (constants/map-icons.ts) : grilles, fiches, réglages, bandeaux.

export function ReportIcon({ type, size = 24 }: { type: ReportType; size?: number }) {
  return <SvgXml xml={reportIconSvg(type, MapIconColors)} width={size} height={size} />;
}

export function PlaceIcon({ kind, size = 24 }: { kind: PlaceKind; size?: number }) {
  return <SvgXml xml={placeIconSvg(kind, MapIconColors)} width={size} height={size} />;
}

/** Station-service (prix officiels) */
export function FuelIcon({ size = 24 }: { size?: number }) {
  return <SvgXml xml={fuelStationIconSvg(MapIconColors)} width={size} height={size} />;
}

export function ZoneIcon({ size = 24 }: { size?: number }) {
  return <SvgXml xml={zoneIconSvg(MapIconColors)} width={size} height={size} />;
}
