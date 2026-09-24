import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { formatRideDate, levelInfo, type RideSummary } from '@/lib/rides';
import { formatDistance, formatDuration } from '@/lib/routing';

type Props = {
  ride: RideSummary;
  /** Distance entre moi et le point de RDV */
  distanceFromMeM: number | null;
  /** Compatibilité avec ma moto : true / false, null si inconnue (pas de badge) */
  fit?: boolean | null;
  onPress: () => void;
};

export function RideCard({ ride, distanceFromMeM, fit = null, onPress }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const level = levelInfo(ride.level);
  const full = ride.maxParticipants !== null && ride.participantsCount >= ride.maxParticipants;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatRideDate(ride.meetingAt)}</Text>
        <View style={[styles.level, { backgroundColor: level.color }]}>
          <Text style={styles.levelText}>{level.label}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {ride.title}
      </Text>

      <View style={styles.infoRow}>
        <Ionicons name="flag" size={14} color={Colors.accent} />
        <Text style={styles.info} numberOfLines={1}>
          {ride.meeting.label}
          {distanceFromMeM !== null ? ` · à ${formatDistance(distanceFromMeM)}` : ''}
        </Text>
      </View>
      {ride.distanceM !== null && (
        <View style={styles.infoRow}>
          <Ionicons name="navigate" size={14} color={Colors.textMuted} />
          <Text style={styles.info}>
            {formatDistance(ride.distanceM)}
            {ride.durationS !== null ? ` · ${formatDuration(ride.durationS)}` : ''}
          </Text>
        </View>
      )}

      {fit !== null && (
        <View style={[styles.fit, { backgroundColor: fit ? Colors.successSoft : Colors.accentSoft }]}>
          <Ionicons
            name={fit ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={fit ? Colors.success : Colors.danger}
          />
          <Text style={[styles.fitText, { color: fit ? Colors.success : Colors.danger }]}>
            {fit ? 'Adaptée à ta moto' : 'Pas adaptée à ta moto'}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Image source={{ uri: ride.organizer.avatarUrl }} style={styles.avatar} />
        <Text style={styles.organizer} numberOfLines={1}>
          @{ride.organizer.username}
        </Text>
        <View style={styles.badges}>
          {ride.isDemo && <Badge label="Démo" color={Colors.textMuted} />}
          {ride.status === 'live' && <Badge label="En cours" color={Colors.success} />}
          {ride.joined && <Badge label="Tu participes" color={Colors.accent} />}
          {ride.invited && <Badge label="Invité" color={Colors.ghost} />}
          {full && !ride.joined && <Badge label="Complet" color={Colors.danger} />}
        </View>
        <Ionicons name="people" size={14} color={Colors.textMuted} />
        <Text style={styles.count}>
          {ride.participantsCount}
          {ride.maxParticipants !== null ? `/${ride.maxParticipants}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 14, gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 13, fontWeight: '700', color: Colors.accent, textTransform: 'capitalize' },
  level: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  levelText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  info: { flex: 1, fontSize: 13, color: Colors.textMuted },
  fit: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  fitText: { fontSize: 13, fontWeight: '800' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.border },
  organizer: { fontSize: 13, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  badges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  count: { fontSize: 13, fontWeight: '700', color: Colors.text },
}));
