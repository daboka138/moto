import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Alert, Linking } from 'react-native';

import { SUPPORT_EMAIL } from '@/guide/contenu';
import { IS_WEB, webDevice } from '@/lib/app-link';

// « Contacter le support » : mail prérempli avec la version de l'app et le modèle du téléphone.
// Jamais de position ni de donnée personnelle en dehors du pseudo.

function deviceLabel() {
  if (IS_WEB) {
    const kind = { android: 'Android', ios: 'iPhone', desktop: 'ordinateur' }[webDevice()];
    return `Version web (${kind})`;
  }
  const model = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'Modèle inconnu';
  return `${model} · ${Device.osName ?? 'Android'} ${Device.osVersion ?? ''}`.trim();
}

function appVersion() {
  const version = Constants.expoConfig?.version ?? '?';
  if (IS_WEB) return `${version} (web)`;
  const parts = [Updates.channel && `canal ${Updates.channel}`];
  if (!Updates.isEmbeddedLaunch && Updates.createdAt) {
    parts.push(`mise à jour du ${Updates.createdAt.toLocaleDateString('fr-FR')}`);
  }
  const extra = parts.filter(Boolean).join(', ');
  return extra ? `${version} (${extra})` : version;
}

export function supportMailUrl(username?: string | null, subject = 'Aide PasseRyder') {
  const body = [
    'Bonjour,',
    '',
    'Mon souci (ce que je faisais, ce qui s’est passé) :',
    '',
    '',
    '—',
    `Version de l’app : ${appVersion()}`,
    `Appareil : ${deviceLabel()}`,
    ...(username ? [`Pseudo : @${username}`] : []),
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function contactSupport(username?: string | null) {
  try {
    await Linking.openURL(supportMailUrl(username));
  } catch {
    Alert.alert('Contacter le support', `Aucune appli mail trouvée. Écris-nous à ${SUPPORT_EMAIL}.`);
  }
}
