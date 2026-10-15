import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { useCanUse } from '@/lib/features';
import {
  dismissCelebration,
  fetchRiderGoodPoints,
  goodBadges,
  levelOf,
  useBadgeCelebrations,
  type RiderGoodPoints,
} from '@/lib/good-points';

/** Barre de niveau : Apprenti → Motard → Road Captain → Légende */
export function LevelBar({ total }: { total: number }) {
  const styles = useStyles();
  const { level, next, progress } = levelOf(total);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.levelRow}>
        <Text style={styles.levelEmoji}>{level.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.levelLabel}>{level.label}</Text>
          <Text style={styles.small}>
            {total.toLocaleString('fr-FR')} points
            {next ? ` · ${(next.min - total).toLocaleString('fr-FR')} avant ${next.label}` : ' · niveau maximum'}
          </Text>
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

/**
 * Profil : niveau + badges de bon comportement, seulement si le motard les montre
 * (sur mon propre profil : affichés dès que les points sont activés, avec la mention « visible par toi »).
 */
export function GoodPointsCard({ userId, self, onPress }: { userId: string | undefined; self?: boolean; onPress?: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const allowed = useCanUse('good_points');
  const [data, setData] = useState<{ id: string; points: RiderGoodPoints | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !allowed) return;
      let cancelled = false;
      fetchRiderGoodPoints(userId)
        .then((points) => !cancelled && setData({ id: userId, points }))
        .catch((e) => console.warn('Points indisponibles', e));
      return () => {
        cancelled = true;
      };
    }, [userId, allowed]),
  );

  const points = data && data.id === userId ? data.points : null;
  if (!allowed || !points) return null;
  const unlocked = goodBadges(points.counters)
    .filter((b) => b.unlocked)
    .reverse();
  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.header}>
        <Text style={styles.title}>Bon comportement</Text>
        {self && !points.visible && (
          <Text style={styles.private}>
            <Ionicons name="lock-closed" size={11} /> visible par toi seul
          </Text>
        )}
        <View style={{ flex: 1 }} />
        {onPress && <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
      </View>
      <LevelBar total={points.total} />
      {unlocked.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {unlocked.map((b) => (
            <View key={b.id} style={styles.badge}>
              <Text style={styles.badgeEmoji}>{b.emoji}</Text>
              <Text style={styles.badgeLabel} numberOfLines={2}>
                {b.label}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Pressable>
  );
}

/** Nouveau badge : apparition sobre (fondu + léger zoom), un badge à la fois. Monté dans _layout. */
export function BadgeCelebrationHost() {
  const styles = useStyles();
  const queue = useBadgeCelebrations();
  const badge = queue[0] ?? null;
  const [scale] = useState(() => new Animated.Value(0.8));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!badge) return;
    scale.setValue(0.8);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(dismissCelebration, 4500);
    return () => clearTimeout(timer);
  }, [badge, scale, opacity]);

  if (!badge) return null;
  return (
    <Modal transparent animationType="none" visible onRequestClose={dismissCelebration}>
      <Pressable style={styles.overlay} onPress={dismissCelebration}>
        <Animated.View style={[styles.celebration, { opacity, transform: [{ scale }] }]}>
          <Text style={styles.small}>Nouveau badge</Text>
          <Text style={styles.celebrationEmoji}>{badge.emoji}</Text>
          <Text style={styles.celebrationTitle}>{badge.label}</Text>
          <Text style={styles.celebrationText}>{badge.description}</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 14, gap: 10, marginHorizontal: 16, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '900', color: Colors.text },
  private: { fontSize: 11, color: Colors.textMuted },
  small: { fontSize: 12, color: Colors.textMuted },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelEmoji: { fontSize: 30 },
  levelLabel: { fontSize: 17, fontWeight: '900', color: Colors.text },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  strip: { gap: 8 },
  badge: { width: 84, alignItems: 'center', gap: 4, padding: 8, borderRadius: 14, backgroundColor: Colors.accentSoft },
  badgeEmoji: { fontSize: 28 },
  badgeLabel: { fontSize: 11, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: Colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: 32 },
  celebration: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 6,
    maxWidth: 320,
  },
  celebrationEmoji: { fontSize: 64 },
  celebrationTitle: { fontSize: 20, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  celebrationText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
}));
