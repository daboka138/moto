// =====================================================================
// Toutes les couleurs de l'app sont ici, pour le thème clair et le thème
// sombre. Pour changer le style de l'app, il suffit de modifier ce fichier
// (la carte Leaflet l'utilise aussi).
//
// Dans un composant :
//   const Colors = useColors();          // couleurs du thème actif
//   const styles = useStyles();          // styles créés avec makeStyles
//   const useStyles = makeStyles((Colors) => ({ ... }));
// =====================================================================

import { createContext, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

/** Couleur principale, identique dans les deux thèmes : bleu ciel */
const ACCENT = '#0EA5E9';
const ACCENT_DARK = '#0284C7';

export const LightColors = {
  accent: ACCENT,
  accentDark: ACCENT_DARK,
  accentSoft: '#E0F2FE',

  // Fonds et textes
  background: '#F4F4F5',
  surface: '#FFFFFF',
  /** Texte ou icône posé sur une couleur vive (bouton bleu, bandeau rouge…) */
  white: '#FFFFFF',
  text: '#18181B',
  textMuted: '#71717A',
  textFaint: '#A1A1AA',
  border: '#E4E4E7',
  /** Fonds sombres fixes (couverture de profil, visionneuse photo) */
  dark: '#18181B',
  darkSoft: '#27272A',
  neutral: '#52525B',

  // États
  danger: '#DC2626',
  dangerHalo: 'rgba(220,38,38,.35)',
  success: '#16A34A',
  successDark: '#166534',
  successSoft: '#DCFCE7',
  warning: '#F59E0B',
  ghost: '#7C3AED',

  // Navigation
  /** Bandeau d'instruction pendant le guidage */
  guidance: '#15803D',
  guidanceSoft: '#DCFCE7',
  /** Ma position (point / flèche) */
  me: '#2563EB',
  /** Tracé de l'itinéraire */
  route: '#2563EB',
  /** Fond de carte pendant le chargement des tuiles */
  mapBackground: '#E5E3DF',

  // Voiles et ombres
  shadow: '#000000',
  overlay: 'rgba(0,0,0,0.75)',
  overlayLight: 'rgba(0,0,0,0.55)',
  overlayStrong: 'rgba(0,0,0,0.85)',
  backdrop: 'rgba(0,0,0,0.45)',
  viewerBackdrop: 'rgba(0,0,0,0.95)',
  markerShadow: 'rgba(0,0,0,.35)',
  coverIcon: 'rgba(255,255,255,0.08)',
};

export type Palette = typeof LightColors;

export const DarkColors: Palette = {
  ...LightColors,
  accentSoft: '#0C2D40',

  background: '#0B0F14',
  surface: '#161B22',
  text: '#F4F4F5',
  textMuted: '#A1A1AA',
  textFaint: '#71717A',
  border: '#2A313C',
  dark: '#05070A',
  darkSoft: '#1F2630',
  neutral: '#71717A',

  danger: '#EF4444',
  dangerHalo: 'rgba(239,68,68,.4)',
  success: '#22C55E',
  successDark: '#86EFAC',
  successSoft: '#0F2E1C',
  ghost: '#8B5CF6',

  guidanceSoft: '#BBF7D0',
  me: '#3B82F6',
  route: '#60A5FA',
  mapBackground: '#1B1E23',

  backdrop: 'rgba(0,0,0,0.6)',
};

/** Couleur par niveau de balade (identique dans les deux thèmes) */
export const LevelColors = {
  tranquille: LightColors.success,
  dynamique: LightColors.warning,
  sportif: LightColors.danger,
};

/**
 * Panneaux de signalement, façon signalisation routière :
 * rouge = accident / danger, jaune = chaussée (gravillons, huile, travaux),
 * orange = obstacle, losange = circulation (bouchon, véhicule arrêté).
 */
export const ReportSigns = {
  accident: { shape: 'triangle', fill: '#DC2626', stroke: '#FFFFFF', glyph: '💥' },
  danger: { shape: 'triangle', fill: '#FFFFFF', stroke: '#DC2626', glyph: '!' },
  gravel: { shape: 'triangle', fill: '#FACC15', stroke: '#DC2626', glyph: '🪨' },
  oil: { shape: 'triangle', fill: '#FACC15', stroke: '#DC2626', glyph: '🛢️' },
  roadworks: { shape: 'triangle', fill: '#FACC15', stroke: '#DC2626', glyph: '🚧' },
  object: { shape: 'triangle', fill: '#FB923C', stroke: '#FFFFFF', glyph: '📦' },
  animal: { shape: 'triangle', fill: '#FFFFFF', stroke: '#DC2626', glyph: '🦌' },
  traffic_jam: { shape: 'diamond', fill: '#F97316', stroke: '#FFFFFF', glyph: '🚗' },
  stopped_vehicle: { shape: 'diamond', fill: '#FACC15', stroke: '#18181B', glyph: '🚙' },
} as const;

export type SignStyle = (typeof ReportSigns)[keyof typeof ReportSigns];

/** Couleur du pictogramme dans les panneaux */
export const SIGN_INK = '#18181B';

// ---------- Thème actif ----------

export type ThemePreference = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';

const STORAGE_KEY = 'moto.theme';

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

type ThemeState = {
  scheme: Scheme;
  colors: Palette;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeState>({
  scheme: 'light',
  colors: LightColors,
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const system = useColorScheme();
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // pas grave : le choix ne sera pas mémorisé
    }
  };

  return (
    <ThemeContext.Provider
      value={{ scheme, colors: scheme === 'dark' ? DarkColors : LightColors, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Couleurs du thème actif */
export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}

/** Crée un hook qui renvoie les styles du thème actif (calculés une fois par thème). */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (colors: Palette) => T): () => T {
  const light = StyleSheet.create(factory(LightColors));
  const dark = StyleSheet.create(factory(DarkColors));
  return function useStyles() {
    return useContext(ThemeContext).scheme === 'dark' ? dark : light;
  };
}
