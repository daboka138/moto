import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { DemoToggle } from '@/demo/demo-toggle'; // DEMO
import { signOut } from '@/lib/auth';
import { useSession } from '@/lib/session';

export default function ProfileScreen() {
  const { profile } = useSession();

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

  return (
    <ProfileView
      profile={profile}
      actions={<Button title="Modifier mon profil" variant="secondary" onPress={() => router.push('/profile-edit')} />}
      footer={
        <>
          <DemoToggle /* DEMO */ />
          <Button title="Se déconnecter" variant="ghost" onPress={confirmSignOut} />
        </>
      }
    />
  );
}
