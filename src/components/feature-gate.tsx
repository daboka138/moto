import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { canUse, featureStatus, useFeatures, type FeatureKey } from '@/lib/features';

/** Écran réservé : affiche son contenu si canUse(feature), sinon une explication (premium / indisponible). */
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const Colors = useColors();
  const styles = useStyles();
  useFeatures();
  if (canUse(feature)) return <>{children}</>;
  const premium = featureStatus(feature) === 'premium';
  return (
    <View style={styles.center}>
      <Ionicons name={premium ? 'star' : 'pause-circle-outline'} size={44} color={premium ? Colors.accent : Colors.textMuted} />
      <Text style={styles.title}>{premium ? 'Fonction PasseRyder Premium' : 'Fonction momentanément indisponible'}</Text>
      <Text style={styles.text}>
        {premium ? 'Cette fonction fait partie de PasseRyder Premium.' : 'Elle revient bientôt. Merci de ta patience !'}
      </Text>
      {premium && canUse('premium_offer') && <Button title="Découvrir Premium" onPress={() => router.push('/premium')} />}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: Colors.background },
  title: { fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  text: { fontSize: 15, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
}));
