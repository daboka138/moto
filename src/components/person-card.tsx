import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { UserName } from '@/components/user-name';

type Props = {
  userId: string;
  photoUrl: string;
  username: string;
  motoLabel: string | null;
  /** Vitesse publiée : sert seulement à dire « en route » ou « à l'arrêt » (jamais affichée) */
  speedKmh: number | null;
  distanceM: number | null;
  badge?: string;
  onViewProfile: () => void;
  onClose: () => void;
};

/** Fiche rapide affichée quand on appuie sur un motard de la carte. */
export function PersonCard({ userId, photoUrl, username, motoLabel, speedKmh, distanceM, badge, onViewProfile, onClose }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  // Règle de l'appli : la vitesse d'un motard n'est JAMAIS montrée aux autres
  const moving = speedKmh === null ? null : speedKmh >= 5;

  return (
    <View style={styles.card}>
      <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={22} color={Colors.textMuted} />
      </Pressable>

      <View style={styles.row}>
        <Image source={{ uri: photoUrl }} style={styles.avatar} />
        <View style={styles.info}>
          <UserName userId={userId} username={username} style={styles.username} />
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
          <Text style={styles.statValue}>{moving === null ? '–' : moving ? 'En route' : 'À l’arrêt'}</Text>
          <Text style={styles.statLabel}>Statut</Text>
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

const useStyles = makeStyles((Colors) => ({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 16,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: Colors.accent },
  info: { flex: 1, gap: 2, paddingRight: 24 },
  username: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  moto: { fontSize: Type.body, color: Colors.textMuted },
  badge: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  stats: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: Radius.md, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: Type.small, color: Colors.textMuted },
  divider: { width: 1, backgroundColor: Colors.border },
}));
