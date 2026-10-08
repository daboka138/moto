import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { formatDistance } from '@/components/person-card';
import { makeStyles, useColors } from '@/constants/theme';
import type { Place } from '@/lib/geocoding';

export type RidePlaceRole = 'start' | 'end' | 'meeting';

/** Fiche du point posé par appui long : aller ici, s'en servir pour une balade, signaler un danger. */
export function DroppedPinCard({
  place,
  resolving,
  distanceM,
  onGo,
  onRide,
  onReport,
  onClose,
}: {
  place: Place;
  resolving: boolean;
  distanceM: number | null;
  onGo: () => void;
  onRide: (role: RidePlaceRole) => void;
  /** Absent (version web) : pas de bouton « Signaler un danger ici » */
  onReport?: () => void;
  onClose: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="location" size={22} color={Colors.danger} />
        <View style={styles.headerBody}>
          <Text style={styles.label} numberOfLines={2}>
            {place.label}
          </Text>
          {resolving ? (
            <View style={styles.resolving}>
              <ActivityIndicator size="small" color={Colors.textMuted} />
              <Text style={styles.muted}>Recherche de l’adresse…</Text>
            </View>
          ) : (
            distanceM !== null && <Text style={styles.muted}>à {formatDistance(distanceM)}</Text>
          )}
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
          <Ionicons name="close" size={24} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Pressable style={({ pressed }) => [styles.go, pressed && styles.pressed]} onPress={onGo}>
        <MaterialCommunityIcons name="navigation-variant" size={20} color={Colors.white} />
        <Text style={styles.goText}>Aller ici</Text>
      </Pressable>

      <Text style={styles.section}>Pour une balade</Text>
      <View style={styles.row}>
        <RoleButton icon="flag-outline" label="Départ" onPress={() => onRide('start')} />
        <RoleButton icon="flag-checkered" label="Arrivée" onPress={() => onRide('end')} />
        <RoleButton icon="account-group" label="Point de RDV" onPress={() => onRide('meeting')} />
      </View>

      {onReport && (
        <Pressable style={({ pressed }) => [styles.report, pressed && styles.pressed]} onPress={onReport}>
          <Ionicons name="warning" size={18} color={Colors.danger} />
          <Text style={styles.reportText}>Signaler un danger ici</Text>
        </Pressable>
      )}
    </View>
  );
}

function RoleButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.role, pressed && styles.pressed]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={20} color={Colors.accent} />
      <Text style={styles.roleText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerBody: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.text },
  muted: { fontSize: 13, color: Colors.textMuted },
  resolving: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  go: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 24,
    paddingVertical: 12,
  },
  goText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  row: { flexDirection: 'row', gap: 8 },
  role: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  report: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  reportText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
  pressed: { opacity: 0.7 },
}));
