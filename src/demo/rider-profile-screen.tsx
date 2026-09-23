import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { Colors } from '@/constants/theme';
import { findDemoRider } from '@/demo/riders';

/** Fiche complète d'un faux motard (les chemins de photo sont déjà des URL). */
export default function DemoRiderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rider = findDemoRider(id);

  if (!rider) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Motard introuvable.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `@${rider.username}` }} />
      <ProfileView
        profile={rider}
        resolvePhoto={(path) => path}
        actions={
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Profil de démonstration</Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.textMuted },
  badge: {
    alignSelf: 'center',
    backgroundColor: Colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { color: Colors.accent, fontWeight: '700', fontSize: 13 },
});
