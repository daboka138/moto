import { Switch, Text, View } from 'react-native';

import { Card } from '@/components/profile-view';
import { makeStyles, useColors } from '@/constants/theme';
import { useDemoMode } from '@/demo/demo-context';

export function DemoToggle() {
  const Colors = useColors();
  const styles = useStyles();
  const { enabled, setEnabled } = useDemoMode();
  return (
    <Card title="Démonstration">
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.label}>Afficher les données de démo</Text>
          <Text style={styles.hint}>
            Motards, balades, signalements, spots et événements fictifs autour de toi (carte, Mur, Sorties, recherche, stories,
            messages). Désactivé par défaut.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.white}
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 13, color: Colors.textMuted },
}));
