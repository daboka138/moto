import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { fetchAdminPremium, savePremiumConfig, setPremiumActive, type AdminPremium } from '@/lib/premium';

const num = (s: string) => Number(s.replace(',', '.').trim());

/**
 * Console › Fonctions › Premium : interrupteur global (off = tout le monde a tout, aucun écran de
 * paiement), tarifs prévus (jamais affichés aux membres tant qu'il est off), membres fondateurs,
 * aperçu de l'écran Premium. AUCUN paiement : RevenueCat au build 1.3.0 (PLAY_STORE.md § 7).
 */
export function PremiumAdmin() {
  const Colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<AdminPremium | null>(null);
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [discount, setDiscount] = useState('');
  const [months, setMonths] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchAdminPremium()
      .then((d) => {
        setData(d);
        setMonthly(String(d.monthly).replace('.', ','));
        setYearly(String(d.yearly).replace('.', ','));
        setDiscount(String(d.founderDiscountPct));
        setMonths(String(d.founderOfferMonths));
      })
      .catch((e) => Alert.alert('Oups', errorMessage(e)));
  }, []);

  useFocusEffect(load);

  if (!data) return <ActivityIndicator color={Colors.accent} />;

  const toggle = (on: boolean) => {
    const apply = async () => {
      setBusy(true);
      try {
        await setPremiumActive(on);
        load();
      } catch (e) {
        Alert.alert('Oups', errorMessage(e));
      } finally {
        setBusy(false);
      }
    };
    Alert.alert(
      on ? 'Activer le premium ?' : 'Désactiver le premium ?',
      on
        ? `Les fonctions au statut « Premium » seront réservées aux membres premium.${
            data.activatedAt ? '' : ' La liste des membres fondateurs sera figée maintenant.'
          } Aucun paiement n’existe encore dans l’app : à ne faire qu’avec RevenueCat en place (PLAY_STORE.md § 7).`
        : 'Tout redevient accessible à tout le monde.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: on ? 'Activer' : 'Désactiver', style: on ? 'destructive' : 'default', onPress: apply },
      ],
    );
  };

  const save = async () => {
    const c = { monthly: num(monthly), yearly: num(yearly), founderDiscountPct: Math.round(num(discount)), founderOfferMonths: Math.round(num(months)) };
    if (!(c.monthly > 0 && c.yearly > 0) || !(c.founderDiscountPct >= 0 && c.founderDiscountPct <= 100) || !(c.founderOfferMonths >= 1 && c.founderOfferMonths <= 36)) {
      Alert.alert('À corriger', 'Prix > 0, réduction entre 0 et 100 %, durée entre 1 et 36 mois.');
      return;
    }
    setBusy(true);
    try {
      await savePremiumConfig(c);
      load();
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Premium actif</Text>
          <Text style={styles.small}>
            {data.active
              ? `Actif${data.activatedAt ? ` depuis le ${new Date(data.activatedAt).toLocaleDateString('fr-FR')}` : ''}`
              : 'Désactivé : tout le monde a tout, aucun écran de paiement nulle part.'}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={Colors.accent} />
        ) : (
          <Switch value={data.active} onValueChange={toggle} trackColor={{ true: Colors.accent, false: Colors.border }} thumbColor={Colors.white} />
        )}
      </View>
      <Text style={styles.small}>
        Membres fondateurs : {data.founders} sur {data.members} inscrits
        {data.activatedAt ? ` (liste figée le ${new Date(data.activatedAt).toLocaleDateString('fr-FR')})` : ' (tous les inscrits jusqu’à l’activation)'}.
      </Text>

      <Text style={styles.label}>Tarifs prévus (non affichés)</Text>
      <View style={styles.fields}>
        <View style={styles.col}>
          <Field label="Mois (€)" value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" maxLength={6} />
        </View>
        <View style={styles.col}>
          <Field label="An (€)" value={yearly} onChangeText={setYearly} keyboardType="decimal-pad" maxLength={6} />
        </View>
      </View>
      <View style={styles.fields}>
        <View style={styles.col}>
          <Field label="Fondateurs : réduction (%)" value={discount} onChangeText={setDiscount} keyboardType="number-pad" maxLength={3} />
        </View>
        <View style={styles.col}>
          <Field label="Pendant (mois)" value={months} onChangeText={setMonths} keyboardType="number-pad" maxLength={2} />
        </View>
      </View>
      <Button title="Enregistrer les tarifs" variant="secondary" onPress={save} disabled={busy} />
      <Button title="Aperçu de l’écran Premium" icon="eye-outline" variant="ghost" onPress={() => router.push('/premium')} />
      <Text style={styles.small}>
        Catalogue fixe (« ★ Prévue en premium ») : uniquement des fonctions pas encore créées (cartes hors ligne, GPX, statistiques
        avancées, carnet multi-motos, badge Soutien). Le serveur refuse le statut « Premium » pour toute autre fonction. Une fonction
        n’est réservée que si son statut est « Premium » ET le premium actif. Sécurité, météo et carburant : gratuits pour toujours.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fields: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  label: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
}));
