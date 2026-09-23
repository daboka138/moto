import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';

type Props = {
  photoUrl: string;
  username: string;
  motoLabel: string | null;
  speedKmh: number | null;
  speeding?: boolean;
  distanceM: number | null;
  badge?: string;
  onViewProfile: () => void;
  onClose: () => void;
};

/** Fiche rapide affichée quand on appuie sur un motard de la carte. */
export function PersonCard({ photoUrl, username, motoLabel, speedKmh, speeding, distanceM, badge, onViewProfile, onClose }: Props) {
  const speed = speedKmh === null ? null : Math.round(speedKmh);

  return (
    <View style={styles.card}>
      <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={22} color={Colors.textMuted} />
      </Pressable>

      <View style={styles.row}>
        <Image source={{ uri: photoUrl }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.username}>@{username}</Text>
          {motoLabel && (
            <Text style={styles.moto} numberOfLines={1}>
              {motoLabel}
            </Text>
          )}
          {badge && <Text style={styles.badge}>{badge}</Text>}
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, speeding && { color: Colors.danger }]}>
            {speed === null ? '–' : speed === 0 ? 'Arrêté' : `${speed} km/h`}
          </Text>
          <Text style={styles.statLabel}>{speeding ? 'Excès de vitesse' : 'Vitesse'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{distanceM === null ? '–' : formatDistance(distanceM)}</Text>
          <Text style={styles.statLabel}>De toi</Text>
        </View>
      </View>

      <Button title="Voir le profil" onPress={onViewProfile} />
    </View>
  );
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function motoLabel(moto: { brand: string; model: string; displacement_cc: number | null } | null | undefined) {
  if (!moto) return null;
  return `${moto.brand} ${moto.model}${moto.displacement_cc ? ` · ${moto.displacement_cc} cc` : ''}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: Colors.accent },
  info: { flex: 1, gap: 2, paddingRight: 24 },
  username: { fontSize: 18, fontWeight: '800', color: Colors.text },
  moto: { fontSize: 14, color: Colors.textMuted },
  badge: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  stats: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 14, paddingVertical: 10 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textMuted },
  divider: { width: 1, backgroundColor: Colors.border },
});
