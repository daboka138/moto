import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import type { RoutePrefs } from '@/lib/route-prefs';

const ROWS: { key: keyof RoutePrefs; label: string; hint?: string }[] = [
  { key: 'avoidHighways', label: 'Éviter l’autoroute' },
  { key: 'avoidTolls', label: 'Éviter les péages' },
  {
    key: 'avoidCities',
    label: 'Éviter les villes autant que possible',
    hint: 'Contourne les centres denses quand un détour raisonnable existe (au plus +50 % de temps).',
  },
];

/** Cases « Éviter l'autoroute / les péages / les villes » (création de balade, boucles) */
export function RouteOptionsFields({
  value,
  onChange,
  highwaysLocked,
  hideCities,
  citiesHint,
}: {
  value: RoutePrefs;
  onChange: (patch: Partial<RoutePrefs>) => void;
  /** 50 cm³ : autoroute toujours évitée (case cochée, grisée) */
  highwaysLocked?: boolean;
  hideCities?: boolean;
  /** Texte sous « Éviter les villes » quand la case est cochée (sinon : contournement, au plus +50 %) */
  citiesHint?: string;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.list}>
      {ROWS.filter((r) => !(hideCities && r.key === 'avoidCities')).map((r) => {
        const locked = r.key === 'avoidHighways' && highwaysLocked;
        const on = locked || value[r.key];
        return (
          <Pressable
            key={r.key}
            style={[styles.row, locked && styles.locked]}
            disabled={locked}
            onPress={() => onChange({ [r.key]: !value[r.key] })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: locked }}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? Colors.accent : Colors.textMuted} />
            <View style={styles.body}>
              <Text style={styles.label}>
                {r.label}
                {locked ? ' (obligatoire en 50 cm³)' : ''}
              </Text>
              {r.hint && on && <Text style={styles.hint}>{(r.key === 'avoidCities' && citiesHint) || r.hint}</Text>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  locked: { opacity: 0.6 },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 15, color: Colors.text },
  hint: { fontSize: 12, color: Colors.textMuted },
}));
