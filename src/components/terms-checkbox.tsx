import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, Text } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/terms';

/** Case « J'accepte les conditions d'utilisation et la politique de confidentialité ». */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={styles.row}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={26} color={checked ? Colors.accent : Colors.textMuted} />
      <Text style={styles.text}>
        J’accepte les{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>
          conditions d’utilisation
        </Text>{' '}
        et la{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          politique de confidentialité
        </Text>
        .
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  text: { flex: 1, fontSize: 15, lineHeight: 21, color: Colors.text },
  link: { color: Colors.accent, fontWeight: '700', textDecorationLine: 'underline' },
}));
