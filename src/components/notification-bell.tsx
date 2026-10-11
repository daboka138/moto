import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { useNotificationsBadge } from '@/lib/notifications';

/** Cloche en haut des onglets : pastille rouge = nombre de notifications non lues. */
export function NotificationBell({ floating, light }: { floating?: boolean; light?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  const { unread } = useNotificationsBadge();
  return (
    <Pressable
      style={({ pressed }) => [styles.bell, floating && styles.floating, pressed && { opacity: 0.6 }]}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      accessibilityLabel={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}>
      <Ionicons
        name={unread ? 'notifications' : 'notifications-outline'}
        size={floating || light ? 22 : 26}
        color={light ? Colors.white : floating ? Colors.accent : Colors.text}
      />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Sur la carte : bouton rond comme les calques
  floating: {
    borderRadius: 22,
    backgroundColor: Colors.surface,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  badgeText: { color: Colors.white, fontSize: 11, fontWeight: '900' },
}));
