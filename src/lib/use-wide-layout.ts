import { Platform, useWindowDimensions } from 'react-native';

/** Largeur à partir de laquelle la version web passe en mise en page « ordinateur ». */
export const WIDE_MIN_WIDTH = 900;
/** Largeur max des écrans de contenu (profil, messages, balades…) sur grand écran */
export const CONTENT_MAX_WIDTH = 760;

/** Version web sur grand écran : onglets sur le côté, contenu en colonne centrée. */
export function useWideLayout() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN_WIDTH;
}
