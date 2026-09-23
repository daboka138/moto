import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/profile-form';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { useSession } from '@/lib/session';

export default function OnboardingScreen() {
  const { session, refreshProfile } = useSession();
  if (!session) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ProfileForm
        userId={session.user.id}
        profile={null}
        identity={null}
        submitLabel="Créer mon profil"
        // Une fois le profil chargé, _layout.tsx bascule vers les onglets
        onSaved={refreshProfile}
        header={
          <View style={styles.header}>
            <Text style={styles.title}>Crée ton profil</Text>
            <Text style={styles.subtitle}>Les champs marqués * sont obligatoires.</Text>
            <View style={styles.signOut}>
              <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { gap: 4 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text },
  subtitle: { fontSize: 15, color: Colors.textMuted },
  signOut: { alignSelf: 'flex-start', marginLeft: -20 },
});
