import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useIsAdmin } from '@/lib/admin';
import { canUse, premiumActive, useFeatures } from '@/lib/features';
import { euros, fetchPremiumOffer, useIsFounder, type PremiumOffer } from '@/lib/premium';
import { useSession } from '@/lib/session';

const SAFETY = ['SOS et contacts d’urgence', 'Alertes de danger et zones de danger', 'Détection de chute', '« Je rentre »'];

/**
 * « PasseRyder Premium » : préparé mais CACHÉ. Visible par l'admin en aperçu (Console › Fonctions),
 * par les membres seulement quand le premium sera actif ET l'écran activé (premium_offer).
 * AUCUN paiement, aucun bouton d'achat (RevenueCat au build 1.3.0 : PLAY_STORE.md § 7).
 */
export default function PremiumScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const admin = useIsAdmin(session?.user.id);
  const founder = useIsFounder(session?.user.id);
  const { features, plan } = useFeatures();
  const [offer, setOffer] = useState<PremiumOffer | null | undefined>(undefined);
  const open = premiumActive() && canUse('premium_offer');
  const visible = admin || open;

  useEffect(() => {
    if (!visible) return;
    fetchPremiumOffer()
      .then(setOffer)
      .catch(() => setOffer(null));
  }, [visible]);

  if (!visible) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Ionicons name="heart" size={44} color={Colors.accent} style={{ alignSelf: 'center' }} />
        <Text style={styles.title}>PasseRyder est gratuit</Text>
        <Text style={styles.text}>
          Plus tard, des options avancées seront proposées en premium pour faire vivre l’appli. Tout ce qui est gratuit
          aujourd’hui le restera, et la sécurité sera toujours gratuite.
        </Text>
      </ScrollView>
    );
  }

  const advantages = (features ?? []).filter((f) => f.premium_planned);
  const until = plan?.until ? new Date(plan.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const founderYear = offer ? offer.yearly * (1 - offer.founderDiscountPct / 100) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {admin && !premiumActive() && (
        <View style={styles.preview}>
          <Ionicons name="eye-outline" size={18} color={Colors.warning} />
          <Text style={styles.previewText}>Aperçu admin : écran caché aux membres tant que le premium est désactivé.</Text>
        </View>
      )}
      <Ionicons name="star" size={52} color={Colors.accent} style={{ alignSelf: 'center' }} />
      <Text style={styles.title}>PasseRyder Premium</Text>
      <Text style={[styles.text, styles.center]}>Des options avancées pour aller plus loin, et pour faire vivre l’appli.</Text>

      {plan?.plan === 'premium' && (
        <View style={styles.card}>
          <Text style={styles.label}>Mon offre</Text>
          <Text style={styles.text}>{plan.lifetime ? 'Premium à vie. Merci !' : `Premium jusqu’au ${until}.`}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Ce que Premium ajoute</Text>
        {advantages.map((f) => (
          <View key={f.key} style={styles.row}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>{f.name}</Text>
              {!!f.description && <Text style={styles.small}>{f.description}</Text>}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Prix</Text>
        {offer === undefined ? (
          <ActivityIndicator color={Colors.accent} />
        ) : offer ? (
          <>
            <View style={styles.prices}>
              <View style={styles.price}>
                <Text style={styles.priceValue}>{euros(offer.monthly)}</Text>
                <Text style={styles.small}>par mois</Text>
              </View>
              <View style={styles.price}>
                <Text style={styles.priceValue}>{euros(offer.yearly)}</Text>
                <Text style={styles.small}>par an</Text>
              </View>
            </View>
            {offer.founderDiscountPct > 0 && (
              <View style={styles.founder}>
                <Ionicons name="ribbon" size={22} color={Colors.accent} />
                <Text style={[styles.text, { flex: 1 }]}>
                  Offre membres fondateurs : -{offer.founderDiscountPct} % la{' '}
                  {offer.founderOfferMonths === 12 ? '1re année' : `${offer.founderOfferMonths} premiers mois`}
                  {founderYear ? ` (${euros(founderYear)} la 1re année)` : ''}.{' '}
                  {founder ? 'Tu es membre fondateur : merci d’être là depuis le début !' : 'Pour les inscrits d’avant le lancement du premium.'}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.small}>Prix indisponibles pour le moment.</Text>
        )}
      </View>

      <View style={[styles.card, styles.safety]}>
        <View style={styles.row}>
          <Ionicons name="shield-checkmark" size={22} color={Colors.success} />
          <Text style={styles.label}>La sécurité reste gratuite, pour toujours</Text>
        </View>
        {SAFETY.map((s) => (
          <Text key={s} style={styles.small}>
            • {s}
          </Text>
        ))}
      </View>

      <Text style={styles.small}>
        Tout ce qui est gratuit aujourd’hui le restera. L’abonnement n’est pas encore disponible : aucun paiement n’est demandé dans
        l’app.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  center: { textAlign: 'center' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 8 },
  safety: { borderWidth: 1, borderColor: Colors.success },
  label: { fontSize: Type.body, fontWeight: '900', color: Colors.text },
  text: { fontSize: Type.body, color: Colors.text, lineHeight: 21 },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  prices: { flexDirection: 'row', gap: 12 },
  price: { flex: 1, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  priceValue: { fontSize: Type.title, fontWeight: '900', color: Colors.text },
  founder: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4 },
  preview: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.warning, padding: 12 },
  previewText: { flex: 1, fontSize: Type.small, color: Colors.text },
}));
