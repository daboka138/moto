import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/constants/theme';
import { useGuideState } from '@/guide/state';
import { useNotificationsBadge } from '@/lib/notifications';
import { useInbox } from '@/lib/use-inbox';
import { CONTENT_MAX_WIDTH, useWideLayout } from '@/lib/use-wide-layout';

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône pleine quand l'onglet est actif, contour sinon */
function icon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} size={26} color={color} />;
  };
}

export default function TabsLayout() {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { unreadTotal } = useInbox();
  const { unread: unreadNotifs } = useNotificationsBadge();
  const badgeStyle = { backgroundColor: Colors.danger, color: Colors.white, fontSize: 11, fontWeight: '800' as const };
  const badge = (n: number) => (n > 0 ? (n > 99 ? '99+' : n) : undefined);
  // Web sur grand écran : onglets en colonne à gauche, contenu centré (sauf la carte, plein écran)
  const wide = useWideLayout();
  // Premier lancement : présentation de l'app (une seule fois, relançable dans Paramètres › Aide)
  const { welcomeDone } = useGuideState();
  if (!welcomeDone) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...(wide && {
          tabBarPosition: 'left',
          tabBarVariant: 'material',
          tabBarLabelPosition: 'below-icon',
          sceneStyle: {
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: Colors.border,
          },
        }),
        // Barre toujours visible, y compris clavier ouvert
        tabBarHideOnKeyboard: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        // 6 onglets : libellés courts en 11 px, sans agrandissement par la taille de police du système
        // (sinon « Messages » est coupé sur un écran de 360 dp)
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarAllowFontScaling: false,
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarStyle: wide
          ? { backgroundColor: Colors.surface, borderRightColor: Colors.border, width: 100, paddingTop: 16 }
          : {
              backgroundColor: Colors.surface,
              borderTopColor: Colors.border,
              // Web : libellés un peu plus hauts (interligne du navigateur)
              height: (Platform.OS === 'web' ? 70 : 62) + insets.bottom,
              paddingTop: 6,
              paddingBottom: insets.bottom + 6,
            },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Carte', tabBarIcon: icon('map', 'map-outline'), ...(wide && { sceneStyle: { flex: 1 } }) }}
      />
      <Tabs.Screen name="feed" options={{ title: 'Mur', tabBarIcon: icon('newspaper', 'newspaper-outline') }} />
      <Tabs.Screen name="rides" options={{ title: 'Sorties', tabBarIcon: icon('flag', 'flag-outline') }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifs',
          tabBarIcon: icon('notifications', 'notifications-outline'),
          tabBarBadge: badge(unreadNotifs),
          tabBarBadgeStyle: badgeStyle,
          tabBarAccessibilityLabel: unreadNotifs ? `Notifications, ${unreadNotifs} non lues` : 'Notifications',
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: icon('chatbubbles', 'chatbubbles-outline'),
          tabBarBadge: badge(unreadTotal),
          tabBarBadgeStyle: badgeStyle,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}
