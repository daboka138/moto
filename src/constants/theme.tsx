// =====================================================================
// Toutes les couleurs de l'app sont ici, pour le thème clair et le thème
// sombre. Pour changer le style de l'app, il suffit de modifier ce fichier
// (la carte Leaflet l'utilise aussi).
//
// Dans un composant :
//   const Colors = useColors();          // couleurs du thème actif
//   const styles = useStyles();          // styles créés avec makeStyles
//   const useStyles = makeStyles((Colors) => ({ ... }));
//
// Règles (note 24) :
// - couleurs : 1 principale (bleu du logo), danger (alerte / SOS), succès, des gris.
//   Le reste (épingles de carte, panneaux, drapeaux) sert à reconnaître un repère.
// - texte : 3 tailles (Type.small / body / large) + 1 titre (Type.title) ;
//   au-delà de 36 px = affichage (compteur de vitesse, gros chiffres).
// - espacements : 4 / 8 / 12 / 16 / 24 / 32 uniquement.
// - coins : Radius.sm (badges), Radius.md (boutons, champs, cartes), Radius.lg (panneaux), pill.
// - polices : makeStyles pose la bonne police (Barlow / Barlow Condensed) selon
//   fontWeight et fontSize : rien à écrire dans les composants.
// =====================================================================

import { createContext, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

/** Couleur principale (celle du logo), identique dans les deux thèmes : bleu ciel */
const ACCENT = '#0EA5E9';
const ACCENT_DARK = '#0284C7';

export const LightColors = {
  accent: ACCENT,
  accentDark: ACCENT_DARK,
  accentSoft: '#E0F2FE',
  /** Texte / icône posés sur accentSoft (badges) */
  accentOnSoft: '#0369A1',
  /** Messages : « Vu » sous la bulle (✓✓ bleu) */
  seenTick: '#1D4ED8',
  /** Messages : ✓✓ vu, sur ma bulle (bleu ciel dans les deux thèmes) */
  seenTickOnBubble: '#0B3B8C',

  // Fonds et textes
  background: '#F4F4F5',
  surface: '#FFFFFF',
  /** Texte ou icône posé sur une couleur vive (bouton bleu, bandeau rouge…) */
  white: '#FFFFFF',
  /** QR code (toujours noir sur blanc) */
  black: '#000000',
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
  /** Mode fantôme : gris (caché, pas une couleur de plus) */
  ghost: '#52525B',
  /** Repères de la carte : lieux motards et événements */
  placePin: '#EA580C',
  eventPin: '#DB2777',
  /** Parkings moto OpenStreetMap (bleu des panneaux de parking) */
  parkingPin: '#1D4ED8',

  // Navigation
  /** Bandeau d'instruction pendant le guidage */
  guidance: '#16A34A',
  guidanceSoft: '#DCFCE7',
  /** Ma position (point / flèche) */
  me: ACCENT_DARK,
  /** Tracé de l'itinéraire */
  route: ACCENT,
  /** Fond de carte pendant le chargement des tuiles (proche du fond MapTiler Streets) */
  mapBackground: '#F2EFE9',

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
  accentOnSoft: '#7DD3FC',
  seenTick: '#93C5FD',
  seenTickOnBubble: '#0B3B8C',

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
  ghost: '#71717A',

  guidanceSoft: '#BBF7D0',
  me: ACCENT,
  route: '#38BDF8',
  mapBackground: '#1B1E23',

  backdrop: 'rgba(0,0,0,0.6)',
};

/**
 * Fonds d'écran des conversations (lib/wallpapers.ts, components/chat-wallpaper.tsx) :
 * dégradé (2-3 couleurs, haut → bas) + motif discret dessiné par-dessus (couleur `ink`).
 */
export type WallpaperMotif = 'none' | 'road' | 'mountains' | 'curves' | 'wheels' | 'stars';
export const WallpaperPresets: Record<
  string,
  { label: string; dark: boolean; stops: string[]; motif: WallpaperMotif; ink: string }
> = {
  ciel: { label: 'Ciel', dark: false, stops: ['#E0F2FE', '#F8FAFC'], motif: 'none', ink: 'transparent' },
  nuit: { label: 'Nuit', dark: true, stops: ['#0B0F14', '#111827'], motif: 'none', ink: 'transparent' },
  aube: { label: 'Aube', dark: false, stops: ['#FAFAF9', '#F5F5F4'], motif: 'none', ink: 'transparent' },
  crepuscule: { label: 'Crépuscule', dark: true, stops: ['#1C1917', '#292524'], motif: 'none', ink: 'transparent' },
  route: { label: 'Route', dark: true, stops: ['#1F2937', '#111827'], motif: 'road', ink: 'rgba(250,204,21,0.16)' },
  'route-claire': { label: 'Route claire', dark: false, stops: ['#F4F4F5', '#E4E4E7'], motif: 'road', ink: 'rgba(14,165,233,0.14)' },
  montagne: { label: 'Montagne', dark: false, stops: ['#E0F2FE', '#F0F9FF'], motif: 'mountains', ink: 'rgba(2,132,199,0.12)' },
  'montagne-nuit': { label: 'Montagne de nuit', dark: true, stops: ['#0B0F14', '#161B22'], motif: 'mountains', ink: 'rgba(125,211,252,0.12)' },
  virages: { label: 'Virages', dark: false, stops: ['#F0F9FF', '#E0F2FE'], motif: 'curves', ink: 'rgba(14,165,233,0.16)' },
  'virages-nuit': { label: 'Virages de nuit', dark: true, stops: ['#0B0F14', '#161B22'], motif: 'curves', ink: 'rgba(14,165,233,0.2)' },
  roues: { label: 'Roues', dark: true, stops: ['#0F172A', '#1E293B'], motif: 'wheels', ink: 'rgba(148,163,184,0.12)' },
  etoiles: { label: 'Étoiles', dark: true, stops: ['#0B0F14', '#18181B'], motif: 'stars', ink: 'rgba(255,255,255,0.5)' },
};

/** Collines sombres du fond « Étoiles » */
export const WALLPAPER_HILLS = 'rgba(0,0,0,0.35)';

/** Couleurs unies proposées pour le fond d'une conversation */
export const WallpaperColors = [
  '#F4F4F5',
  '#E0F2FE',
  '#DCFCE7',
  '#FEF3C7',
  '#FCE7F3',
  '#0EA5E9',
  '#0F766E',
  '#7C2D12',
  '#27272A',
  '#18181B',
  '#0B0F14',
];

/** Couleur par niveau de balade (identique dans les deux thèmes) */
export const LevelColors = {
  pepere: '#0D9488',
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

// ---------- Typographie, espacements, coins ----------

/** Polices (assets/fonts, licence OFL, chargées par useAppFonts dans _layout) */
export const Fonts = {
  regular: 'Barlow-Regular',
  medium: 'Barlow-Medium',
  semibold: 'Barlow-SemiBold',
  bold: 'Barlow-Bold',
  /** Titres : condensée, style plaque / panneau */
  title: 'BarlowCondensed-Bold',
  titleSemi: 'BarlowCondensed-SemiBold',
};

export const FontFiles = {
  [Fonts.regular]: require('../../assets/fonts/Barlow-Regular.ttf'),
  [Fonts.medium]: require('../../assets/fonts/Barlow-Medium.ttf'),
  [Fonts.semibold]: require('../../assets/fonts/Barlow-SemiBold.ttf'),
  [Fonts.bold]: require('../../assets/fonts/Barlow-Bold.ttf'),
  [Fonts.title]: require('../../assets/fonts/BarlowCondensed-Bold.ttf'),
  [Fonts.titleSemi]: require('../../assets/fonts/BarlowCondensed-SemiBold.ttf'),
};

/** 3 tailles de texte + 1 taille de titre */
export const Type = { small: 12, body: 15, large: 17, title: 24 };

/** Échelle d'espacement : 4 / 8 / 12 / 16 / 24 / 32 */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Coins arrondis */
export const Radius = { sm: 8, md: 12, lg: 16, pill: 999 };

type TextLike = { fontFamily?: string; fontWeight?: unknown; fontSize?: number };

/** Police à utiliser pour un style de texte (poids + taille) */
export function fontFor(weight: unknown, size?: number): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400;
  // Titres : gras et grand (titres d'écran, de section, gros chiffres)
  if (w >= 800 && (size ?? 0) >= Type.large) return Fonts.title;
  if (w >= 700 && (size ?? 0) >= Type.title) return Fonts.title;
  if (w >= 700) return Fonts.bold;
  if (w >= 600) return Fonts.semibold;
  if (w >= 500) return Fonts.medium;
  return Fonts.regular;
}

/** Ajoute la police aux styles de texte (ceux qui ont une taille ou un poids) */
function withFonts<T>(styles: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(styles as Record<string, unknown>)) {
    const st = value as TextLike;
    if (st && typeof st === 'object' && !st.fontFamily && (st.fontSize != null || st.fontWeight != null)) {
      const { fontWeight, ...rest } = st;
      out[key] = { ...rest, fontFamily: fontFor(fontWeight, st.fontSize) };
    } else out[key] = value;
  }
  return out as T;
}

// ---------- Thème actif ----------

/** Drapeaux des pays (Histoire de la moto, components/history/flag.tsx) : couleurs officielles simplifiées */
export const FlagColors = {
  white: '#FFFFFF',
  frBlue: '#0055A4',
  frRed: '#EF4135',
  itGreen: '#009246',
  itRed: '#CE2B37',
  deBlack: '#000000',
  deRed: '#DD0000',
  deGold: '#FFCE00',
  atRed: '#C8102E',
  seBlue: '#006AA7',
  seYellow: '#FECC02',
  jpRed: '#BC002D',
  gbBlue: '#012169',
  gbRed: '#C8102E',
  usBlue: '#3C3B6E',
  usRed: '#B22234',
  inSaffron: '#FF9933',
  inGreen: '#138808',
  inNavy: '#000080',
  border: 'rgba(0,0,0,0.15)',
};

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
  const light = StyleSheet.create(withFonts(factory(LightColors)));
  const dark = StyleSheet.create(withFonts(factory(DarkColors)));
  return function useStyles() {
    return useContext(ThemeContext).scheme === 'dark' ? dark : light;
  };
}
