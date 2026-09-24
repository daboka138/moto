import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/constants/theme';
import { useInbox } from '@/lib/use-inbox';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Barre toujours visible, y compris clavier ouvert
        tabBarHideOnKeyboard: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Carte', tabBarIcon: icon('map', 'map-outline') }} />
      <Tabs.Screen name="feed" options={{ title: 'Mur', tabBarIcon: icon('newspaper', 'newspaper-outline') }} />
      <Tabs.Screen name="rides" options={{ title: 'Balades', tabBarIcon: icon('flag', 'flag-outline') }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: icon('chatbubbles', 'chatbubbles-outline'),
          tabBarBadge: unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : unreadTotal) : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.danger, color: Colors.white, fontSize: 11, fontWeight: '800' },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}
