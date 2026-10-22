import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { fetchRiderStats, fetchUserBadges, showcase, type RiderStats, type UserBadge } from '@/lib/badges';

/** Statistiques d'un motard : fournies par l'appelant, sinon chargées depuis le serveur */
export function useRiderStats(userId: string | undefined, given?: RiderStats) {
  const [stats, setStats] = useState<{ id: string; stats: RiderStats } | null>(null);
  useEffect(() => {
    if (!userId || given) return;
    let cancelled = false;
    fetchRiderStats(userId)
      .then((s) => !cancelled && setStats({ id: userId, stats: s }))
      .catch((e) => console.warn('Badges indisponibles', e));
    return () => {
      cancelled = true;
    };
  }, [userId, given]);
  return given ?? (stats && stats.id === userId ? stats.stats : null);
}

/** Badges attribués par le serveur à un motard, relus à chaque affichage de l'écran */
export function useUserBadges(userId: string | undefined) {
  const [badges, setBadges] = useState<{ id: string; list: UserBadge[] } | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      fetchUserBadges(userId)
        .then((list) => !cancelled && setBadges({ id: userId, list }))
        .catch((e) => console.warn('Badges indisponibles', e));
      return () => {
        cancelled = true;
      };
    }, [userId]),
  );
  return badges && badges.id === userId ? badges.list : null;
}

/** Vitrine du profil : km, balades, cols et badges obtenus (fondateur d'abord, puis les plus récents) */
export function BadgesCard({ userId, stats, onPress }: { userId: string | undefined; stats: RiderStats | null; onPress?: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const earned = useUserBadges(userId);
  if (!stats || !earned) return null;
  const shown = showcase(earned);
  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.header}>
        <Text style={styles.title}>Badges{shown.length ? ` (${shown.length})` : ''}</Text>
        <Text style={styles.summary}>
          {Math.round(stats.totalKm).toLocaleString('fr-FR')} km · {stats.ridesDone} balade{stats.ridesDone > 1 ? 's' : ''} · {stats.passesCount} col
          {stats.passesCount > 1 ? 's' : ''}
        </Text>
        {onPress && <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
      </View>
      {shown.length === 0 ? (
        <Text style={styles.muted}>Pas encore de badge. Va rouler, ça vient vite !</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {shown.map((b) => (
            <View key={b.id} style={styles.badge}>
              <Text style={styles.emoji}>{b.emoji}</Text>
              <Text style={styles.label} numberOfLines={2}>
                {b.label}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 12, marginHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: Type.body, fontWeight: '900', color: Colors.text },
  summary: { flex: 1, fontSize: Type.small, color: Colors.textMuted, textAlign: 'right' },
  muted: { fontSize: Type.small, color: Colors.textMuted },
  strip: { gap: 8 },
  badge: { width: 84, alignItems: 'center', gap: 4, padding: 8, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  emoji: { fontSize: Type.title },
  label: { fontSize: Type.small, fontWeight: '700', color: Colors.text, textAlign: 'center' },
}));
