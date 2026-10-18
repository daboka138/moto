import makeQrCode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Radius, useColors } from '@/constants/theme';

/**
 * QR code dessiné en SVG (qrcode-generator = JavaScript pur, react-native-svg déjà dans l'app :
 * aucun nouveau module natif). Toujours noir sur blanc, avec une marge, pour être lisible par
 * n'importe quel téléphone, même en thème sombre.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const Colors = useColors();
  const { path, count } = useMemo(() => {
    const qr = makeQrCode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [value]);
  const margin = 2;
  const box = count + margin * 2;
  return (
    <View style={{ width: size, height: size, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.white }}>
      <Svg width={size} height={size} viewBox={`${-margin} ${-margin} ${box} ${box}`}>
        <Rect x={-margin} y={-margin} width={box} height={box} fill={Colors.white} />
        <Path d={path} fill={Colors.black} />
      </Svg>
    </View>
  );
}
