import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { useColors, WALLPAPER_HILLS, WallpaperPresets, type WallpaperMotif } from '@/constants/theme';
import type { Wallpaper } from '@/lib/wallpapers';

/**
 * Fond d'une conversation, posé sous les bulles (position absolue) : dégradé + motif discret,
 * couleur unie ou photo, puis voile sombre (dim %) pour garder les bulles lisibles.
 */
export function ChatWallpaper({ wallpaper, photoUrl }: { wallpaper: Wallpaper; photoUrl?: string | null }) {
  const Colors = useColors();
  const preset = wallpaper.kind === 'preset' ? WallpaperPresets[wallpaper.value] : null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {wallpaper.kind === 'color' && <View style={[StyleSheet.absoluteFill, { backgroundColor: wallpaper.value }]} />}
      {wallpaper.kind === 'photo' && photoUrl && (
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      )}
      {preset && <PresetArt id={wallpaper.value} stops={preset.stops} motif={preset.motif} ink={preset.ink} />}
      {wallpaper.dim > 0 && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.shadow, opacity: wallpaper.dim / 100 }]} />
      )}
    </View>
  );
}

function PresetArt({ id, stops, motif, ink }: { id: string; stops: string[]; motif: WallpaperMotif; ink: string }) {
  const gid = `wp-g-${id}`;
  const pid = `wp-p-${id}`;
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          {stops.map((c, i) => (
            <Stop key={c + i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
        {motif === 'road' && (
          // Ligne médiane en pointillés, en biais
          <Pattern id={pid} width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
            <Rect x="36" y="0" width="8" height="40" rx="3" fill={ink} />
          </Pattern>
        )}
        {motif === 'wheels' && (
          <Pattern id={pid} width="110" height="110" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
            <Circle cx="55" cy="55" r="30" fill="none" stroke={ink} strokeWidth="7" />
            <Circle cx="55" cy="55" r="6" fill={ink} />
            <Path d="M55 25v60M25 55h60M34 34l42 42M76 34l-42 42" stroke={ink} strokeWidth="2" />
          </Pattern>
        )}
        {motif === 'curves' && (
          // Route sinueuse qui se répète
          <Pattern id={pid} width="200" height="160" patternUnits="userSpaceOnUse">
            <Path d="M-20 40 C 30 0, 70 80, 120 40 S 190 0, 220 40" fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" />
            <Path d="M-20 120 C 30 80, 70 160, 120 120 S 190 80, 220 120" fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round" />
          </Pattern>
        )}
      </Defs>
      <Rect x="0" y="0" width="400" height="800" fill={`url(#${gid})`} />
      {(motif === 'road' || motif === 'wheels' || motif === 'curves') && (
        <Rect x="-200" y="-200" width="800" height="1200" fill={`url(#${pid})`} />
      )}
      {motif === 'mountains' && (
        <G>
          <Path d="M0 640 L70 540 L120 590 L200 470 L270 560 L320 510 L400 600 L400 800 L0 800 Z" fill={ink} />
          <Path d="M0 700 L90 610 L160 670 L250 580 L330 650 L400 620 L400 800 L0 800 Z" fill={ink} />
          <Path d="M200 470 L222 498 L208 494 L200 504 L190 494 L180 498 Z" fill={ink} />
        </G>
      )}
      {motif === 'stars' && (
        <G>
          {STARS.map(([x, y, r], i) => (
            <Circle key={i} cx={x} cy={y} r={r} fill={ink} />
          ))}
          <Path d="M0 720 L80 650 L150 700 L240 620 L320 690 L400 650 L400 800 L0 800 Z" fill={WALLPAPER_HILLS} />
        </G>
      )}
    </Svg>
  );
}

// Étoiles fixes (pas de hasard : même dessin à chaque affichage)
const STARS: [number, number, number][] = [
  [30, 40, 1.5], [90, 120, 1], [150, 60, 2], [220, 30, 1], [300, 90, 1.5], [370, 50, 1], [60, 220, 1],
  [130, 180, 1.5], [200, 250, 1], [270, 170, 2], [340, 230, 1], [20, 330, 1.5], [110, 300, 1], [180, 360, 1.5],
  [250, 320, 1], [320, 380, 1.5], [390, 300, 1], [50, 450, 1], [140, 420, 2], [230, 480, 1], [300, 440, 1],
  [370, 500, 1.5], [80, 540, 1], [180, 560, 1], [280, 580, 1.5], [350, 600, 1],
];
