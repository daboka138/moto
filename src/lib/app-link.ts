import { Alert, Linking, Platform } from 'react-native';

// Version web : certaines fonctions (GPS en direct, navigation, SOS, chute, « Je rentre »,
// trajets) n'existent que dans l'app Android. Ici : sur quel appareil tourne la page, et
// comment ouvrir l'app au bon écran.

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.passeryder.app';
const ANDROID_PACKAGE = 'com.passeryder.app';
const APP_SCHEME = 'passeryder';

export const IS_WEB = Platform.OS === 'web';

export type WebDevice = 'android' | 'ios' | 'desktop';

/** Appareil du navigateur (version web uniquement ; dans l'app, toujours 'android'). */
export function webDevice(): WebDevice {
  if (!IS_WEB || typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS se présente comme un Mac, mais avec un écran tactile
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

/**
 * Ouvre l'app Android à l'écran `path` (ex. « /homecoming »). Lien intent:// : Chrome ouvre
 * l'app si elle est installée, sinon la page Google Play (browser_fallback_url).
 * iPhone : pas encore d'app. Ordinateur : page Google Play.
 */
export function openInApp(path: string) {
  const device = webDevice();
  if (device === 'ios') {
    Alert.alert('Bientôt disponible sur iPhone', 'Cette fonction est réservée à l’app Android pour le moment.');
    return;
  }
  if (device === 'desktop') {
    Linking.openURL(PLAY_STORE_URL);
    return;
  }
  // passeryder://<chemin> : l'app ouvre l'écran correspondant (Expo Router)
  const target = path.replace(/^\//, '');
  window.location.href =
    `intent://${target}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
}
