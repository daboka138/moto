import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { shortDistance } from '@/lib/navigation';
import { formatDuration } from '@/lib/routing';
import type { TripSummary } from '@/lib/trips';

/** Distance, durée, vitesses moyenne et max d'un trajet. */
export function TripStatsGrid({ trip }: { trip: TripSummary }) {
  const styles = useStyles();
  return (
    <View style={styles.grid}>
      <Stat icon="map-marker-distance" label="Distance" value={shortDistance(trip.distanceM)} />
      <Stat icon="timer-outline" label="Durée" value={formatDuration(trip.durationS)} />
      <Stat icon="speedometer-medium" label="Moyenne" value={`${trip.avgKmh} km/h`} />
      <Stat icon="speedometer" label="Max" value={`${trip.maxKmh} km/h`} />
    </View>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={22} color={Colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Résumé affiché à la fin d'une navigation. */
export function TripSummaryModal({
  trip,
  onClose,
  onOpenHistory,
}: {
  trip: TripSummary | null;
  onClose: () => void;
  onOpenHistory: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Modal visible={!!trip} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card}>
          {trip && (
            <>
              <MaterialCommunityIcons
                name={trip.arrived ? 'flag-checkered' : 'map-marker-path'}
                size={40}
                color={trip.arrived ? Colors.success : Colors.accent}
                style={{ alignSelf: 'center' }}
              />
              <Text style={styles.title}>{trip.arrived ? 'Bien arrivé !' : 'Trajet terminé'}</Text>
              <Text style={styles.dest} numberOfLines={2}>
                {trip.destination}
              </Text>
              <TripStatsGrid trip={trip} />
              <Text style={styles.note}>Enregistré dans Profil › Mes trajets.</Text>
              <Button title="OK" onPress={onClose} />
              <Button title="Voir mes trajets" variant="ghost" onPress={onOpenHistory} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: Colors.backdrop },
  card: { backgroundColor: Colors.surface, borderRadius: 22, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  dest: { fontSize: 15, color: Colors.textMuted, textAlign: 'center' },
  note: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    gap: 2,
    padding: 10,
    borderRadius: 14,
    backgroundColor: Colors.background,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textMuted },
}));
