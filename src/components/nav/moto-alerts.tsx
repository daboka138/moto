import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { FUEL_LEVELS } from '@/lib/garage';
import type { BreakReminder } from '@/lib/moto-alerts';
import { shortDistance } from '@/lib/navigation';

/** Petit bandeau d'alerte moto sous le guidage (virage serré, coucher du soleil) : rien à toucher */
export function MotoAlertChip({ icon, text, tone = 'warning' }: { icon: string; text: string; tone?: 'warning' | 'night' }) {
  const styles = useStyles();
  return (
    <View style={[styles.chip, tone === 'night' && styles.chipNight]}>
      <Text style={styles.chipText} numberOfLines={1}>
        {icon} {text}
      </Text>
    </View>
  );
}

/**
 * Au départ d'une navigation (à l'arrêt) : « Plein fait ? » et niveau approximatif. Masqué dès
 * qu'on roule (jamais de question à valider en roulant) : l'estimation actuelle est gardée.
 */
export function FuelCheckBanner({ leftKm, onPick, onClose }: { leftKm: number | null; onPick: (level: number) => void; onClose: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="gas-station" size={26} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Plein fait ? Niveau d’essence</Text>
          <Text style={styles.small}>
            {leftKm !== null ? `Estimation actuelle : ~${Math.round(leftKm)} km d’autonomie` : 'Autonomie inconnue'}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Garder l’estimation">
          <Ionicons name="close" size={26} color={Colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.levels}>
        {FUEL_LEVELS.map((l) => (
          <Pressable key={l.value} style={({ pressed }) => [styles.level, pressed && { opacity: 0.6 }]} onPress={() => onPick(l.value)}>
            <Text style={styles.levelText}>{l.value === 1 ? '⛽ Plein fait' : l.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/**
 * Rappel de pause : bandeau seulement. Le bouton « Ajouter en étape » n'apparaît qu'à l'arrêt
 * (au-dessus de 10 km/h : simple information, pas d'interaction demandée).
 */
export function BreakBanner({ reminder, stopped, onAdd, onClose }: { reminder: BreakReminder; stopped: boolean; onAdd: () => void; onClose: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const s = reminder.suggestion;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={{ fontSize: Type.title }}>☕</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Pause conseillée</Text>
          <Text style={styles.small} numberOfLines={2}>
            {reminder.searching
              ? 'Recherche d’un café ou d’un point de vue sur la route…'
              : s
                ? `${s.label} · dans ${shortDistance(s.aheadM)} sur ta route`
                : 'Rien trouvé à moins de 10 min : arrête-toi dès que possible'}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
          <Ionicons name="close" size={26} color={Colors.textMuted} />
        </Pressable>
      </View>
      {s &&
        (stopped ? (
          <Pressable style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]} onPress={onAdd}>
            <MaterialCommunityIcons name="map-marker-plus" size={22} color={Colors.white} />
            <Text style={styles.addText}>Ajouter en étape</Text>
          </Pressable>
        ) : (
          <Text style={styles.small}>Arrête-toi pour l’ajouter en étape.</Text>
        ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  chip: {
    alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: Colors.warning,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
  },
  chipNight: { backgroundColor: Colors.accentDark },
  chipText: { color: Colors.white, fontWeight: '800', fontSize: Type.body },
  card: { gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 16, borderWidth: 2, borderColor: Colors.accent, elevation: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: Type.body, fontWeight: '900', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted },
  levels: { flexDirection: 'row', gap: 8 },
  level: { flex: 1, minHeight: 52, borderRadius: Radius.md, backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontSize: Type.body, fontWeight: '900', color: Colors.text },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: Radius.md, backgroundColor: Colors.accent },
  addText: { fontSize: Type.large, fontWeight: '900', color: Colors.white },
}));
