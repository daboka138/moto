import { Platform, useWindowDimensions } from 'react-native';

/** Largeur à partir de laquelle la version web passe en mise en page « ordinateur ». */
export const WIDE_MIN_WIDTH = 900;
/** Largeur max du contenu (profil, messages, balades…) sur grand écran : au-delà, marges du même fond */
export const CONTENT_MAX_WIDTH = 960;
/** Largeur de la colonne d'onglets à gauche sur grand écran */
export const TAB_RAIL_WIDTH = 100;

/** Version web sur grand écran : onglets sur le côté, contenu en colonne centrée. */
export function useWideLayout() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN_WIDTH;
}

/**
 * Style d'un écran de contenu sur le web : il occupe TOUTE la page (fond opaque, la carte n'est jamais
 * visible derrière) ; sur grand écran, le contenu est centré par des marges intérieures du même fond.
 * `rail` : largeur déjà prise à gauche (colonne des onglets).
 */
export function usePageStyle(background: string, rail = 0) {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === 'web' && width >= WIDE_MIN_WIDTH;
  return {
    flex: 1,
    backgroundColor: background,
    ...(wide && { paddingHorizontal: Math.max(0, Math.floor((width - rail - CONTENT_MAX_WIDTH) / 2)) }),
  };
}
