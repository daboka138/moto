import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { ReportSigns, SIGN_INK } from '@/constants/theme';
import type { ReportType } from '@/lib/reports';

/** Panneau de signalement (même dessin que sur la carte) : triangle ou losange avec pictogramme. */
export function ReportSign({ type, size = 44 }: { type: ReportType; size?: number }) {
  const sign = ReportSigns[type];
  const diamond = sign.shape === 'diamond';
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46">
      <Path
        d={diamond ? 'M23 2 L44 23 L23 44 L2 23 Z' : 'M23 3 L44 41 L2 41 Z'}
        fill={sign.fill}
        stroke={sign.stroke}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <SvgText
        x={23}
        y={diamond ? 30 : 35}
        fontSize={sign.glyph === '!' ? 24 : 17}
        fontWeight="900"
        textAnchor="middle"
        fill={SIGN_INK}>
        {sign.glyph}
      </SvgText>
    </Svg>
  );
}
