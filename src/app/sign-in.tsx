import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import { signInWithEmail, signUpWithEmail } from '@/lib/auth';

// Connexion par email pour l'instant. Pour passer au téléphone : voir src/lib/auth.ts
export default function SignInScreen() {
  const styles = useStyles();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Connexion', 'Renseigne ton email et ton mot de passe.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmail(email, password);
      } else {
        const needsConfirmation = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          Alert.alert('Vérifie tes emails', 'Clique sur le lien de confirmation reçu, puis connecte-toi.');
          setMode('signIn');
        }
      }
      // Si une session s'ouvre, la navigation bascule toute seule (voir _layout.tsx)
    } catch (e) {
      Alert.alert(mode === 'signIn' ? 'Connexion' : 'Inscription', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.logo}>MOTO</Text>
            <Text style={styles.tagline}>Roule avec ta communauté.</Text>
          </View>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="toi@exemple.fr"
          />
          <Field
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            placeholder="6 caractères minimum"
            onSubmitEditing={submit}
          />

          <Button title={mode === 'signIn' ? 'Se connecter' : 'Créer mon compte'} onPress={submit} loading={loading} />
          <Button
            variant="ghost"
            title={mode === 'signIn' ? 'Pas encore de compte ? Inscris-toi' : 'Déjà un compte ? Connecte-toi'}
            onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  hero: { alignItems: 'center', marginBottom: 24, gap: 6 },
  logo: { fontSize: 44, fontWeight: '900', letterSpacing: 6, color: Colors.accent },
  tagline: { fontSize: 16, color: Colors.textMuted },
}));
