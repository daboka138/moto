import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { ensureHomecomingLoaded } from '@/lib/homecoming';
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
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    Notifications.clearLastNotificationResponse();
  }, [ready, response]);

  return null;
}
