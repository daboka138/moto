import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useFeatures } from '@/lib/features';

/**
 * « PasseRyder Premium » : préparé, caché tant que la fonctionnalité premium_offer est
 * désactivée (console admin). AUCUN paiement pour l'instant (voir PLAY_STORE.md § 6).
 */
export default function PremiumScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { features, plan } = useFeatures();
  const premiumFeatures = (features ?? []).filter((f) => f.status === 'premium');
  const until = plan?.until ? new Date(plan.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Ionicons name="star" size={52} color={Colors.accent} style={{ alignSelf: 'center' }} />
      <Text style={styles.title}>PasseRyder Premium</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Mon offre</Text>
        <Text style={styles.text}>
          {plan?.plan === 'premium'
            ? plan.lifetime
              ? 'Premium à vie. Merci !'
              : `Premium jusqu’au ${until}.`
            : 'Gratuit. Toutes les fonctions sont gratuites pendant la bêta.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Inclus dans Premium</Text>
        {premiumFeatures.length === 0 ? (
          <Text style={styles.text}>Rien pour l’instant : pendant la bêta, tout est gratuit pour tout le monde.</Text>
        ) : (
          premiumFeatures.map((f) => (
            <View key={f.key} style={styles.row}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{f.name}</Text>
                {!!f.description && <Text style={styles.small}>{f.description}</Text>}
              </View>
            </View>
          ))
        )}
      </View>

      <Text style={styles.small}>
        L’abonnement n’est pas encore disponible : aucun paiement n’est demandé dans l’app. La sécurité (SOS, détection de chute,
        « Je rentre », dangers) restera toujours gratuite.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 8 },
  label: { fontSize: Type.body, fontWeight: '900', color: Colors.text },
  text: { fontSize: Type.body, color: Colors.text, lineHeight: 21 },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
}));
