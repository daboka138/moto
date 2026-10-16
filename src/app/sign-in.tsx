import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsCheckbox } from '@/components/terms-checkbox';
import { Button, Field } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import {
  AuthFailure,
  PASSWORD_MAX,
  PASSWORD_MIN,
  requestPasswordReset,
  resendConfirmation,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { cleanInviteCode, clearPendingInvite, fetchInviter, INVITE_PATTERN, pendingInviteCode } from '@/lib/invite';

type Mode = 'signIn' | 'signUp' | 'forgot';

// Connexion par email pour l'instant. Pour passer au téléphone : voir src/lib/auth.ts
export default function SignInScreen() {
  const styles = useStyles();
  // Lien d'invitation (passeryder.fr/i/CODE › version web : /sign-in?invite=CODE) : inscription pré-remplie
  const { invite: inviteParam } = useLocalSearchParams<{ invite?: string }>();
  const [mode, setMode] = useState<Mode>(() => (inviteParam ? 'signUp' : 'signIn'));
  const [invite, setInvite] = useState(() => cleanInviteCode(inviteParam ?? '') || pendingInviteCode());
  const inviter = useInviter(invite);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Email pas encore confirmé (connexion refusée, ou inscription qui attend la confirmation)
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  // « Mot de passe oublié » : lien demandé (message neutre affiché)
  const [resetSent, setResetSent] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setResetSent(false);
  };

  const submit = async () => {
    if (mode === 'forgot') return sendReset();
    if (!email.trim() || !password) {
      Alert.alert('Connexion', 'Renseigne ton email et ton mot de passe.');
      return;
    }
    if (mode === 'signUp' && !termsAccepted) {
      Alert.alert('Inscription', "Coche la case pour accepter les conditions d'utilisation et la politique de confidentialité.");
      return;
    }
    if (mode === 'signUp' && (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX)) {
      Alert.alert('Inscription', `Choisis un mot de passe de ${PASSWORD_MIN} à ${PASSWORD_MAX} caractères.`);
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmail(email, password);
      } else {
        const code = cleanInviteCode(invite);
        const needsConfirmation = await signUpWithEmail(email, password, INVITE_PATTERN.test(code) ? code : undefined);
        clearPendingInvite();
        if (needsConfirmation) {
          Alert.alert('Vérifie tes emails', 'Clique sur le lien de confirmation reçu, puis connecte-toi.');
          setUnconfirmed(true);
          setMode('signIn');
        }
      }
      // Si une session s'ouvre, la navigation bascule toute seule (voir _layout.tsx)
    } catch (e) {
      if (e instanceof AuthFailure && e.code === 'email_not_confirmed') setUnconfirmed(true);
      Alert.alert(mode === 'signIn' ? 'Connexion' : 'Inscription', errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    if (!email.trim()) {
      Alert.alert('Mot de passe oublié', 'Renseigne l’email de ton compte.');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setResetSent(true);
    } catch (e) {
      Alert.alert('Mot de passe oublié', errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email.trim()) {
      Alert.alert('Confirmation', 'Renseigne ton email.');
      return;
    }
    setResending(true);
    try {
      await resendConfirmation(email);
      Alert.alert('Email renvoyé', 'Si ton adresse attend une confirmation, tu vas recevoir un nouvel email. Pense à regarder dans les spams.');
    } catch (e) {
      Alert.alert('Confirmation', errorMessage(e));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.logo}>PasseRyder</Text>
            <Text style={styles.tagline}>
              {mode === 'forgot' ? 'Mot de passe oublié' : 'Roule avec ta communauté.'}
            </Text>
          </View>

          {mode === 'forgot' && (
            <Text style={styles.info}>
              {resetSent
                ? 'Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour choisir un nouveau mot de passe. Pense à regarder dans les spams.'
                : 'Indique l’email de ton compte : on t’envoie un lien pour choisir un nouveau mot de passe.'}
            </Text>
          )}

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="toi@exemple.fr"
            onSubmitEditing={mode === 'forgot' ? submit : undefined}
          />
          {mode !== 'forgot' && (
            <Field
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signUp' ? `${PASSWORD_MIN} caractères minimum` : undefined}
              maxLength={PASSWORD_MAX}
              onSubmitEditing={submit}
            />
          )}

          {mode === 'signUp' && (
            <>
              <Field
                label="Code d’invitation (facultatif)"
                value={invite}
                onChangeText={(v) => setInvite(cleanInviteCode(v))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                placeholder="ex. K7M2QXA"
              />
              {inviter && <Text style={styles.inviter}>Invité par @{inviter} : vous serez amis dès ton inscription.</Text>}
              <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} />
            </>
          )}

          {!(mode === 'forgot' && resetSent) && (
            <Button
              title={mode === 'signIn' ? 'Se connecter' : mode === 'signUp' ? 'Créer mon compte' : 'Envoyer le lien'}
              onPress={submit}
              loading={loading}
              disabled={mode === 'signUp' && !termsAccepted}
            />
          )}

          {mode === 'signIn' && unconfirmed && (
            <Button variant="secondary" title="Renvoyer l’email de confirmation" onPress={resend} loading={resending} />
          )}

          {mode === 'signIn' && (
            <Button variant="ghost" title="Mot de passe oublié ?" onPress={() => switchMode('forgot')} />
          )}
          {mode === 'forgot' ? (
            <Button variant="ghost" title="Retour à la connexion" onPress={() => switchMode('signIn')} />
          ) : (
            <Button
              variant="ghost"
              title={mode === 'signIn' ? 'Pas encore de compte ? Inscris-toi' : 'Déjà un compte ? Connecte-toi'}
              onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  hero: { alignItems: 'center', marginBottom: 24, gap: 6 },
  logo: { fontSize: 40, fontWeight: '900', letterSpacing: 1, color: Colors.accent },
  tagline: { fontSize: 16, color: Colors.textMuted },
  info: { fontSize: 15, lineHeight: 21, color: Colors.text, textAlign: 'center' },
  inviter: { fontSize: 14, fontWeight: '700', color: Colors.accent },
}));

/** Pseudo du parrain si le code est valable */
function useInviter(code: string) {
  const [found, setFound] = useState<{ code: string; username: string | null } | null>(null);
  useEffect(() => {
    if (!INVITE_PATTERN.test(code)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetchInviter(code).then((r) => !cancelled && setFound({ code, username: r?.username ?? null }));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code]);
  return found && found.code === code ? found.username : null;
}
