import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Notifications push (Expo Push → FCM). Les envois partent du serveur (fonction SQL send_push,
// migration 20261003000000_safety_push.sql) ; ici : canaux Android, permission, jeton.

export type PushCategory = 'messages' | 'rides' | 'friends' | 'dangers' | 'garage' | 'sos';

/** Un canal Android par type : chacun réglable aussi dans les réglages du téléphone */
const CHANNELS: { id: PushCategory; name: string; importance: Notifications.AndroidImportance }[] = [
  { id: 'sos', name: 'SOS et sécurité', importance: Notifications.AndroidImportance.MAX },
  { id: 'messages', name: 'Messages', importance: Notifications.AndroidImportance.HIGH },
  { id: 'rides', name: 'Balades (invitations et rappels)', importance: Notifications.AndroidImportance.HIGH },
  { id: 'friends', name: 'Amis et commentaires', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'dangers', name: 'Dangers signalés près de moi', importance: Notifications.AndroidImportance.HIGH },
  { id: 'garage', name: 'Rappels d’entretien', importance: Notifications.AndroidImportance.DEFAULT },
];

// Version web : pas de notifications push (elles arrivent sur l'app Android)
const PUSH_SUPPORTED = Platform.OS !== 'web';

// App ouverte : messages et dangers ont déjà leur affichage dans l'app (bandeau, carte)
if (PUSH_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const type = (n.request.content.data as { type?: PushCategory } | null)?.type;
      const show = type !== 'messages' && type !== 'dangers';
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

let registeredToken: string | null = null;

async function createChannels() {
  if (Platform.OS !== 'android') return;
  for (const c of CHANNELS) {
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      importance: c.importance,
      vibrationPattern: c.id === 'sos' ? [0, 600, 300, 600, 300, 600] : [0, 250, 250, 250],
      lightColor: '#0EA5E9',
    });
  }
}

export type PushStatus = 'granted' | 'denied' | 'unavailable';

/**
 * Demande la permission (Android 13+) puis enregistre le jeton du téléphone sur le serveur.
 * ask = false : n'affiche pas la demande, enregistre seulement si déjà autorisé.
 */
export async function registerForPush(ask = true): Promise<PushStatus> {
  if (!PUSH_SUPPORTED || !Device.isDevice) return 'unavailable';
  await createChannels();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_token', { push_token: token });
    if (error) throw error;
    registeredToken = token;
    return 'granted';
  } catch (e) {
    // Expo Go, ou build sans configuration Firebase
    console.warn('Notifications push indisponibles', e);
    return 'unavailable';
  }
}

/** À la déconnexion : ce téléphone ne reçoit plus les notifications du compte */
export async function unregisterPush() {
  if (!registeredToken) return;
  await supabase.rpc('unregister_push_token', { push_token: registeredToken });
  registeredToken = null;
}

export async function pushPermission(): Promise<PushStatus> {
  if (!PUSH_SUPPORTED || !Device.isDevice) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

// ---------- Préférences par type (côté serveur : c'est lui qui envoie) ----------

export type NotificationPrefs = { messages: boolean; rides: boolean; friends: boolean; dangers: boolean; garage: boolean };

export const DEFAULT_PREFS: NotificationPrefs = { messages: true, rides: true, friends: true, dangers: true, garage: true };

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('messages, rides, friends, dangers, garage')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as NotificationPrefs | null) ?? DEFAULT_PREFS;
}

export async function saveNotificationPrefs(userId: string, prefs: NotificationPrefs) {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() });
  if (error) throw error;
}
