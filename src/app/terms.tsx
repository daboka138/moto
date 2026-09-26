import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsCheckbox } from '@/components/terms-checkbox';
import { Button } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { acceptTerms } from '@/lib/terms';

/**
 * Affiché aux membres connectés qui n'ont pas accepté la version en vigueur des CGU
 * (comptes créés avant les CGU, ou nouvelle version publiée).
 */
export default function TermsScreen() {
  const styles = useStyles();
  const { refreshProfile } = useSession();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const onContinue = async () => {
    setLoading(true);
    try {
      await acceptTerms();
      // La session recharge l'état des CGU : la navigation bascule toute seule
      await refreshProfile();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Conditions d’utilisation</Text>
          <Text style={styles.text}>
            Pour continuer à utiliser PasseRyder, prends connaissance de nos conditions d’utilisation et de notre
            politique de confidentialité, puis accepte-les.
          </Text>
          <Text style={styles.text}>
            En bref : respect des autres membres, aucun contenu illégal, pas d’incitation à la vitesse ni aux
            infractions, et jamais le téléphone en main en roulant.
          </Text>
        </View>

        <TermsCheckbox checked={checked} onChange={setChecked} />

        <Button title="Continuer" onPress={onContinue} loading={loading} disabled={!checked} />
        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  hero: { gap: 10, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '900', color: Colors.text },
  text: { fontSize: 15, lineHeight: 22, color: Colors.textMuted },
}));
