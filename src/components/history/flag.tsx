import type { ReactNode } from 'react';
import { Text } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { FlagColors as F, Fonts, useColors } from '@/constants/theme';

/**
 * Drapeau dessiné (les émojis drapeaux ne s'affichent pas sous Windows : « FR » en lettres).
 * Pays inconnu : code en toutes lettres.
 */
export function Flag({ country, width = 24 }: { country: string; width?: number }) {
  const Colors = useColors();
  const h = (width * 2) / 3;
  const vertical = (a: string, b: string, c: string) => (
    <>
      <Rect x={0} y={0} width={10} height={20} fill={a} />
      <Rect x={10} y={0} width={10} height={20} fill={b} />
      <Rect x={20} y={0} width={10} height={20} fill={c} />
    </>
  );
  const horizontal = (a: string, b: string, c: string) => (
    <>
      <Rect x={0} y={0} width={30} height={6.67} fill={a} />
      <Rect x={0} y={6.67} width={30} height={6.67} fill={b} />
      <Rect x={0} y={13.33} width={30} height={6.67} fill={c} />
    </>
  );
  let body: ReactNode;
  switch (country) {
    case 'FR':
      body = vertical(F.frBlue, F.white, F.frRed);
      break;
    case 'IT':
      body = vertical(F.itGreen, F.white, F.itRed);
      break;
    case 'DE':
      body = horizontal(F.deBlack, F.deRed, F.deGold);
      break;
    case 'AT':
      body = horizontal(F.atRed, F.white, F.atRed);
      break;
    case 'IN':
      body = (
        <>
          {horizontal(F.inSaffron, F.white, F.inGreen)}
          <Circle cx={15} cy={10} r={2.4} stroke={F.inNavy} strokeWidth={0.8} fill="none" />
        </>
      );
      break;
    case 'SE':
      body = (
        <>
          <Rect x={0} y={0} width={30} height={20} fill={F.seBlue} />
          <Rect x={9} y={0} width={4} height={20} fill={F.seYellow} />
          <Rect x={0} y={8} width={30} height={4} fill={F.seYellow} />
        </>
      );
      break;
    case 'JP':
      body = (
        <>
          <Rect x={0} y={0} width={30} height={20} fill={F.white} />
          <Circle cx={15} cy={10} r={6} fill={F.jpRed} />
        </>
      );
      break;
    case 'GB':
      body = (
        <>
          <Rect x={0} y={0} width={30} height={20} fill={F.gbBlue} />
          <Line x1={0} y1={0} x2={30} y2={20} stroke={F.white} strokeWidth={4} />
          <Line x1={30} y1={0} x2={0} y2={20} stroke={F.white} strokeWidth={4} />
          <Line x1={0} y1={0} x2={30} y2={20} stroke={F.gbRed} strokeWidth={1.4} />
          <Line x1={30} y1={0} x2={0} y2={20} stroke={F.gbRed} strokeWidth={1.4} />
          <Rect x={12} y={0} width={6} height={20} fill={F.white} />
          <Rect x={0} y={7} width={30} height={6} fill={F.white} />
          <Rect x={13.2} y={0} width={3.6} height={20} fill={F.gbRed} />
          <Rect x={0} y={8.2} width={30} height={3.6} fill={F.gbRed} />
        </>
      );
      break;
    case 'US':
      body = (
        <>
          <Rect x={0} y={0} width={30} height={20} fill={F.white} />
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <Rect key={i} x={0} y={(i * 20) / 13} width={30} height={20 / 13} fill={F.usRed} />
          ))}
          <Rect x={0} y={0} width={12} height={(7 * 20) / 13} fill={F.usBlue} />
        </>
      );
      break;
    default:
      return <Text style={{ fontSize: width * 0.45, fontFamily: Fonts.bold, color: Colors.textMuted }}>{country}</Text>;
  }
  return (
    <Svg width={width} height={h} viewBox="0 0 30 20" accessibilityLabel={country}>
      {body}
      <Path d="M0.25 0.25 H29.75 V19.75 H0.25 Z" stroke={F.border} strokeWidth={0.5} fill="none" />
    </Svg>
  );
}
