import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import { openInApp, IS_WEB, webDevice } from '@/lib/app-link';
import { PASSWORD_MAX, PASSWORD_MIN, updatePassword, verifyEmailLink } from '@/lib/auth';
import { clearPendingAuthLink, getPendingAuthLink, setAuthNotice, type PendingAuthLink } from '@/lib/auth-link';
import { useSession } from '@/lib/session';

/**
 * Lien reçu par email (modèles supabase/templates) :
 *   /auth-callback?token_hash=…&type=recovery   → choisir un nouveau mot de passe, puis connecté
 *   /auth-callback?token_hash=…&type=magiclink  → connexion
 * Le même écran sert dans l'app (passeryder://auth-callback…) et sur app.passeryder.fr.
 * App : le lien arrive par src/app/+native-intent.tsx (lib/auth-link.ts), une seule fois par lien ;
 * sans lien valable, l'écran ne s'affiche jamais : retour direct à la connexion ou à la carte.
 * Le lien n'est utilisé (verifyOtp) qu'au moment où l'on valide : un aperçu automatique du lien
 * par la messagerie ne le grille pas. Écran accessible connecté ou non (voir _layout.tsx).
 */
export default function AuthCallbackScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ token_hash?: string; type?: string }>();
  const { session, profile } = useSession();
  // App : lien gardé en mémoire par +native-intent ; web : paramètres de l'adresse
  const [link] = useState<PendingAuthLink | null>(() => {
    const pending = getPendingAuthLink();
    if (pending) return pending;
    const t = params.type;
    return params.token_hash && (t === 'recovery' || t === 'magiclink') ? { tokenHash: params.token_hash, type: t } : null;
  });
  const tokenHash = link?.tokenHash;
  const linkType = link?.type ?? null;
  // Sortie de l'écran : Redirect (fiable même si l'écran est le seul de la pile)
  const [leaveTo, setLeaveTo] = useState<Href | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Une fois connecté et le profil chargé : vers l'app
  useEffect(() => {
    if (!done || !session || profile === undefined) return;
    const t = setTimeout(() => {
      clearPendingAuthLink();
      setLeaveTo('/');
    }, 1500);
    return () => clearTimeout(t);
  }, [done, session, profile]);

  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = linkType === 'magiclink' || (password.length >= PASSWORD_MIN && password === confirm);

  const submit = async () => {
    if (!tokenHash || !linkType || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // Mot de passe saisi d'abord, puis le lien est utilisé et le mot de passe changé d'un coup
      await verifyEmailLink(tokenHash, linkType);
      clearPendingAuthLink();
      if (linkType === 'recovery') await updatePassword(password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  function leave(to?: Href) {
    clearPendingAuthLink();
    setLeaveTo(to ?? (session ? '/' : '/sign-in'));
  }
  const backToApp = () => leave();
  // Navigateur sur Android : proposer de continuer dans l'app (même lien, ouvert par l'app)
  const offerApp = IS_WEB && webDevice() === 'android' && !!tokenHash && !!linkType && !done;

  if (leaveTo) return <Redirect href={leaveTo} />;

  // Pas de lien valable (déjà ouvert, incomplet, appli relancée) : jamais d'écran bloquant
  if (!tokenHash || !linkType) {
    setAuthNotice('Ce lien n’est plus valable. Si besoin, redemande un lien depuis « Mot de passe oublié ? ».');
    return <Redirect href={session ? '/' : '/sign-in'} />;
  }

  if (done) {
    return (
      <Screen>
        <Text style={styles.emoji}>✅</Text>
        <Text style={styles.title}>{linkType === 'recovery' ? 'Mot de passe changé' : 'Tu es connecté'}</Text>
        <Text style={styles.text}>
          {linkType === 'recovery' ? 'C’est fait, tu es connecté. ' : ''}Ouverture de PasseRyder…
        </Text>
        <Button title="Continuer" onPress={() => leave('/')} disabled={profile === undefined} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.emoji}>{linkType === 'recovery' ? '🔑' : '👋'}</Text>
      <Text style={styles.title}>{linkType === 'recovery' ? 'Choisis un nouveau mot de passe' : 'Connexion à PasseRyder'}</Text>

      {offerApp && (
        <View style={styles.appBox}>
          <Text style={styles.appText}>Tu as l’app PasseRyder sur ce téléphone ?</Text>
          <Button
            title="Continuer dans l’app"
            variant="secondary"
            onPress={() => openInApp(`/auth-callback?${new URLSearchParams({ token_hash: tokenHash, type: linkType })}`)}
          />
          <Text style={styles.hint}>Ou continue ici, dans le navigateur.</Text>
        </View>
      )}

      {linkType === 'recovery' && (
        <>
          <Field
            label="Nouveau mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder={`${PASSWORD_MIN} caractères minimum`}
            maxLength={PASSWORD_MAX}
          />
          <Field
            label="Confirme le mot de passe"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            onSubmitEditing={submit}
          />
          {tooShort && <Text style={styles.warn}>Au moins {PASSWORD_MIN} caractères.</Text>}
          {mismatch && <Text style={styles.warn}>Les deux mots de passe ne sont pas identiques.</Text>}
        </>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Button
        title={linkType === 'recovery' ? 'Changer mon mot de passe' : 'Me connecter'}
        onPress={submit}
        loading={busy}
        disabled={!canSubmit}
      />
      <Pressable onPress={backToApp} hitSlop={8}>
        <Text style={styles.link}>{session ? 'Retour à l’app' : 'Retour à la connexion'}</Text>
      </Pressable>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14, width: '100%', maxWidth: 480, alignSelf: 'center' },
  emoji: { fontSize: 52, textAlign: 'center' },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  text: { fontSize: 16, lineHeight: 22, color: Colors.textMuted, textAlign: 'center' },
  appBox: { backgroundColor: Colors.accentSoft, borderRadius: 16, padding: 14, gap: 10 },
  appText: { fontSize: 15, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  hint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  warn: { fontSize: 14, color: Colors.warning },
  error: { fontSize: 15, color: Colors.danger, textAlign: 'center' },
  link: { fontSize: 15, fontWeight: '700', color: Colors.accent, textAlign: 'center', padding: 8 },
}));
