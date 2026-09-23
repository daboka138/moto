import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { DemoToggle } from '@/demo/demo-toggle'; // DEMO
import { signOut } from '@/lib/auth';
import { privacyLabel } from '@/lib/privacy';
import { usePrivacy } from '@/lib/privacy-context';
import { useSession } from '@/lib/session';
import { useFriends } from '@/lib/use-friends';

export default function ProfileScreen() {
  const { profile } = useSession();
  const { state: friends } = useFriends();
  const { settings } = usePrivacy();

  // En-tête sombre : barre d'état claire tant que l'onglet est affiché
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  if (!profile) return null;

  const confirmSignOut = () =>
    Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut() },
    ]);

  const pending = friends?.incoming.length ?? 0;

  return (
    <ProfileView
      profile={profile}
      actions={
        <>
          <Button title="Modifier mon profil" variant="secondary" onPress={() => router.push('/profile-edit')} />
          <View style={styles.links}>
            <LinkRow
              icon="people"
              label="Amis"
              value={friends ? `${friends.friends.length}` : '…'}
              badge={pending > 0 ? `${pending} demande${pending > 1 ? 's' : ''}` : undefined}
              href="/friends"
            />
            <View style={styles.separator} />
            <LinkRow
              icon={settings?.mode === 'ghost' ? 'eye-off' : 'location'}
              label="Ma position"
              value={settings ? privacyLabel(settings.mode) : '…'}
              href="/privacy"
            />
          </View>
        </>
      }
      footer={
        <>
          <DemoToggle /* DEMO */ />
          <Button title="Se déconnecter" variant="ghost" onPress={confirmSignOut} />
        </>
      }
    />
  );
}

function LinkRow({
  icon,
  label,
  value,
  badge,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  badge?: string;
  href: Href;
}) {
  return (
    <Pressable style={styles.link} onPress={() => router.push(href)}>
      <Ionicons name={icon} size={22} color={Colors.accent} />
      <Text style={styles.linkLabel}>{label}</Text>
      {badge && <Text style={styles.badge}>{badge}</Text>}
      <Text style={styles.linkValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  links: { backgroundColor: Colors.surface, borderRadius: 18, paddingHorizontal: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  linkLabel: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text },
  linkValue: { fontSize: 15, color: Colors.textMuted },
  badge: {
    backgroundColor: Colors.accent,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: Colors.border },
});
