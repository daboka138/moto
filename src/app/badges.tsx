import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useRiderStats } from '@/components/badges-card';
import { Card } from '@/components/profile-view';
import { makeStyles, useColors } from '@/constants/theme';
import { badgeProgress, fetchMyPasses, monthlyChallenges, type RiderPass } from '@/lib/badges';
import { useSession } from '@/lib/session';

/** Mes badges, défis du mois et cols franchis. */
export default function BadgesScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const stats = useRiderStats(session?.user.id);
  const [passes, setPasses] = useState<RiderPass[] | null>(null);

  useEffect(() => {
    fetchMyPasses()
      .then(setPasses)
      .catch(() => setPasses([]));
  }, []);

  if (!stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Chargement…</Text>
      </View>
    );
  }

  const challenges = monthlyChallenges(stats);
  const badges = badgeProgress(stats);

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

      <Card title="Badges">
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
              {!b.unlocked && (
                <Text style={styles.small}>
                  {Math.floor(b.value).toLocaleString('fr-FR')} / {b.goal.toLocaleString('fr-FR')}
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
        Les km et les cols sont comptés à la fin de chaque navigation dans l’app ; une balade compte quand l’organisateur la
        termine. Tes badges et totaux sont visibles sur ton profil ; la liste de tes cols reste privée.
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
  muted: { color: Colors.textMuted, fontSize: 14 },
  totals: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 18, padding: 14 },
  total: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: 22, fontWeight: '900', color: Colors.accent },
  small: { fontSize: 12, color: Colors.textMuted },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 26 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.text },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 3, padding: 10, borderRadius: 14, backgroundColor: Colors.accentSoft },
  locked: { backgroundColor: Colors.background, opacity: 0.7 },
  badgeEmoji: { fontSize: 30 },
  badgeLabel: { fontSize: 12, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  badgeDesc: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  pass: { fontSize: 15, color: Colors.text },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
}));
