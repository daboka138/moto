import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useRiderStats, useUserBadges } from '@/components/badges-card';
import { Card } from '@/components/profile-view';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { badgeProgress, checkNewRiderBadges, fetchMyPasses, monthlyChallenges, refreshMyBadges, type RiderPass } from '@/lib/badges';
import { useSession } from '@/lib/session';

/** Mes badges, défis du mois et cols franchis. */
export default function BadgesScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id;
  const stats = useRiderStats(userId);
  const earned = useUserBadges(userId);
  const [passes, setPasses] = useState<RiderPass[] | null>(null);

  useEffect(() => {
    fetchMyPasses()
      .then(setPasses)
      .catch(() => setPasses([]));
  }, []);

  // Revérification par le serveur (carnet devenu à jour…), puis animation des nouveaux
  useEffect(() => {
    if (!userId) return;
    refreshMyBadges()
      .then((n) => {
        if (n > 0) checkNewRiderBadges(userId);
      })
      .catch(() => {});
  }, [userId]);

  if (!stats || !earned) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Chargement…</Text>
      </View>
    );
  }

  const challenges = monthlyChallenges(stats);
  const badges = badgeProgress(stats, earned);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.totals}>
        <Total value={Math.round(stats.totalKm).toLocaleString('fr-FR')} label="km" />
        <Total value={String(stats.ridesDone)} label="balades" />
        <Total value={String(stats.passesCount)} label="cols" />
        <Total value={String(stats.bestWeekStreak)} label="sem. d’affilée" />
      </View>

      <Card title="Défis du mois">
        {challenges.map((c) => (
          <View key={c.id} style={styles.challenge}>
            <Text style={styles.emoji}>{c.done ? '✅' : c.emoji}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.label}>{c.label}</Text>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${(c.value / c.goal) * 100}%` }, c.done && { backgroundColor: Colors.success }]} />
              </View>
              <Text style={styles.small}>
                {c.value} / {c.goal} {c.unit}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <Card title={`Badges (${unlockedCount} / ${badges.length})`}>
        <View style={styles.grid}>
          {badges.map((b) => (
            <View key={b.id} style={[styles.badge, !b.unlocked && styles.locked]}>
              <Text style={styles.badgeEmoji}>{b.unlocked ? b.emoji : '🔒'}</Text>
              <Text style={styles.badgeLabel} numberOfLines={2}>
                {b.label}
              </Text>
              <Text style={styles.badgeDesc} numberOfLines={3}>
                {b.description}
              </Text>
              {b.unlocked && b.unlockedAt && (
                <Text style={styles.small}>{new Date(b.unlockedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              )}
              {!b.unlocked && b.value !== null && (
                <Text style={styles.small}>
                  {Math.floor(Math.min(b.value, b.goal)).toLocaleString('fr-FR')} / {b.goal.toLocaleString('fr-FR')}
                </Text>
              )}
            </View>
          ))}
        </View>
      </Card>

      <Card title="Mes cols">
        {passes === null ? (
          <Text style={styles.muted}>Chargement…</Text>
        ) : passes.length === 0 ? (
          <Text style={styles.muted}>Aucun col pour l’instant. Les cols franchis pendant une navigation sont détectés automatiquement.</Text>
        ) : (
          passes.map((p) => (
            <Text key={p.osmId} style={styles.pass}>
              ⛰️ {p.name}
              {p.elevationM ? ` · ${p.elevationM} m` : ''}
              <Text style={styles.small}> · {new Date(p.firstAt).toLocaleDateString('fr-FR')}</Text>
            </Text>
          ))
        )}
      </Card>

      <Text style={styles.hint}>
        Les badges sont attribués par le serveur (une notification te prévient) : km et cols à la fin de chaque navigation, balades
        quand l’organisateur les termine, dangers quand un autre motard les confirme, événements le lendemain. Jamais de badge
        lié à la vitesse ou au chrono. Tes badges sont visibles sur ton profil ; la liste de tes cols reste privée.
      </Text>
    </ScrollView>
  );
}

function Total({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: Type.body },
  totals: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16 },
  total: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: Type.title, fontWeight: '900', color: Colors.accent },
  small: { fontSize: Type.small, color: Colors.textMuted },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: Type.title },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 3, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  locked: { backgroundColor: Colors.background, opacity: 0.7 },
  badgeEmoji: { fontSize: Type.title },
  badgeLabel: { fontSize: Type.small, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  badgeDesc: { fontSize: Type.small, color: Colors.textMuted, textAlign: 'center' },
  pass: { fontSize: Type.body, color: Colors.text },
  hint: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 18 },
}));
