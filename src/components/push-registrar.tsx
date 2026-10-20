import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import { ensureHomecomingLoaded } from '@/lib/homecoming';
import { markNotificationsReadByUrl, useNotificationsBadge } from '@/lib/notifications';
import { registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

/**
 * Une fois connecté (profil créé) : enregistre le téléphone pour les notifications push,
 * charge le « Je rentre » en cours, et ouvre le bon écran quand on touche une notification.
 */
export function PushRegistrar() {
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const ready = !!userId && !!profile;
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const { refresh: refreshBadge } = useNotificationsBadge();

  useEffect(() => {
    if (!ready || !userId) return;
    registerForPush(true).catch((e) => console.warn('Notifications indisponibles', e));
    ensureHomecomingLoaded(userId);
  }, [ready, userId]);

  useEffect(() => {
    if (!ready || !response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const url = (response.notification.request.content.data as { url?: unknown } | null)?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      router.push(url as Href);
      markNotificationsReadByUrl(url).then(() => refreshBadge());
    } else if (typeof url === 'string' && url.startsWith('https://')) {
      // Sortie sur un store (App Store / Google Play)
      Linking.openURL(url);
      markNotificationsReadByUrl(url).then(() => refreshBadge());
    }
    Notifications.clearLastNotificationResponse();
  }, [ready, response, refreshBadge]);

  return null;
}
