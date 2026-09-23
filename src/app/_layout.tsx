import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { DemoProvider } from '@/demo/demo-context'; // DEMO
import { signOut } from '@/lib/auth';
import { PrivacyProvider } from '@/lib/privacy-context';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <PrivacyProvider>
        <DemoProvider /* DEMO */>
          <StatusBar style="dark" />
          <RootNavigator />
        </DemoProvider>
      </PrivacyProvider>
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, profile, profileError, refreshProfile } = useSession();

  useEffect(() => {
    if (session !== undefined) SplashScreen.hideAsync();
  }, [session]);

  if (session === undefined) return null;

  if (session && profileError) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Impossible de charger ton profil. Vérifie ta connexion.</Text>
        <Button title="Réessayer" onPress={refreshProfile} />
        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </View>
    );
  }

  if (session && profile === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !profile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !!profile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile-edit" options={{ headerShown: true, title: 'Modifier mon profil' }} />
        <Stack.Screen name="friends" options={{ headerShown: true, title: 'Amis' }} />
        <Stack.Screen name="privacy" options={{ headerShown: true, title: 'Confidentialité de ma position' }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="ride/new" options={{ headerShown: true, title: 'Nouvelle balade' }} />
        <Stack.Screen name="ride/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="ride/invite" options={{ headerShown: true, title: 'Inviter des amis' }} />
        <Stack.Screen name="pick-place" options={{ headerShown: true, title: 'Choisir un lieu' }} />
        <Stack.Screen name="photo/new" options={{ headerShown: true, title: 'Nouvelle photo' }} />
        <Stack.Screen name="demo-rider/[id]" options={{ headerShown: true, title: '' }} /* DEMO */ />
        <Stack.Screen name="demo-ride/[id]" options={{ headerShown: true, title: '' }} /* DEMO */ />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: Colors.background,
  },
  message: { fontSize: 16, textAlign: 'center', color: Colors.text },
});
