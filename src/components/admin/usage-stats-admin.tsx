import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { Fonts, makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { fetchUsageStats, pct, usageCsv, usageLabel, type UsagePeriod, type UsageStats } from '@/lib/admin';
import { saveTextFile } from '@/lib/gpx-file';

// Console › Statistiques : agrégats calculés par le serveur (admin_usage_stats), sans position,
// sans comptes admin ni de test. Graphiques en barres simples (toucher une barre = valeurs).

const PERIODS: UsagePeriod[] = [7, 30, 90];
/** Règle Google Play : 12 testeurs pendant 14 jours */
const PLAY_TESTERS = 12;
const CONTENT: { feature: string; label: string }[] = [
  { feature: 'ride_create', label: 'Balades créées' },
  { feature: 'post', label: 'Posts' },
  { feature: 'message', label: 'Messages' },
  { feature: 'danger_report', label: 'Dangers signalés' },
];

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function UsageStatsAdmin() {
  const Colors = useColors();
  const styles = useStyles();
  const [days, setDays] = useState<UsagePeriod>(30);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (d: UsagePeriod) => {
    try {
      setStats(await fetchUsageStats(d));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchUsageStats(days)
      .then((s) => {
        if (cancelled) return;
        setStats(s);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const exportCsv = async () => {
    if (!stats) return;
    try {
      await saveTextFile(`passeryder-stats-${stats.days}j-${new Date().toISOString().slice(0, 10)}.csv`, usageCsv(stats), 'text/csv');
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  if (!stats || stats.days !== days) {
    return <View style={styles.center}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={Colors.accent} />}</View>;
  }

  const usage = (feature: string) => stats.daily.map((d) => stats.usage_daily.find((u) => u.day === d.day && u.feature === feature)?.n ?? 0);
  const totalPlatforms = stats.platforms.android + stats.platforms.web + stats.platforms.both;
  const deptMax = Math.max(1, ...stats.departments.map((d) => d.count));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load(days);
            setRefreshing(false);
          }}
          colors={[Colors.accent]}
        />
      }>
      <View style={styles.filters}>
        {PERIODS.map((p) => (
          <Chip key={p} label={`${p} jours`} selected={days === p} onPress={() => setDays(p)} />
        ))}
        <View style={{ flex: 1 }} />
        <Button title="Export CSV" icon="download-outline" variant="secondary" onPress={exportCsv} />
      </View>
      <Text style={styles.small}>
        {stats.tracking_since
          ? `Ouvertures de l’app suivies depuis le ${shortDay(stats.tracking_since)}.`
          : 'Aucune ouverture enregistrée pour l’instant (le suivi démarre avec cette version).'}{' '}
        Comptes admin et de test exclus. Aucune position, aucun outil tiers.
      </Text>

      <Text style={styles.section}>Utilisateurs</Text>
      <View style={styles.grid}>
        <Tile label="Inscrits" value={stats.users} />
        <Tile label={`Nouveaux ${days} j`} value={stats.new_period} />
        <Tile label="Actifs aujourd’hui" value={stats.dau} />
        <Tile label="Actifs 7 j" value={stats.wau} />
        <Tile label="Actifs 30 j" value={stats.mau} />
        <Tile
          label={`Testeurs Android 14 j (objectif ${PLAY_TESTERS})`}
          value={stats.testers_14d}
          alert={stats.testers_14d < PLAY_TESTERS}
        />
      </View>
      <Text style={styles.small}>Testeurs : membres qui ont ouvert l’app Android dans les 14 derniers jours (toi exclu).</Text>

      <BarChart
        title="Actifs par jour"
        days={stats.daily.map((d) => d.day)}
        series={[
          { label: 'Android', color: Colors.chartA, values: stats.daily.map((d) => d.android) },
          { label: 'Web', color: Colors.chartB, values: stats.daily.map((d) => d.web) },
        ]}
      />
      <BarChart title="Inscriptions par jour" days={stats.daily.map((d) => d.day)} series={[{ label: 'Inscriptions', color: Colors.chartA, values: stats.daily.map((d) => d.signups) }]} />
      {!!stats.weekly_signups?.length && (
        <View style={styles.card}>
          <Text style={styles.label}>Inscriptions par semaine</Text>
          {stats.weekly_signups.map((w) => (
            <Row key={w.week} label={`Semaine du ${shortDay(w.week)}`} value={String(w.count)} />
          ))}
        </View>
      )}

      <Text style={styles.section}>Plateformes ({days} j)</Text>
      <View style={styles.card}>
        <HBar label="Android seulement" value={stats.platforms.android} max={totalPlatforms} color={Colors.chartA} />
        <HBar label="Web seulement" value={stats.platforms.web} max={totalPlatforms} color={Colors.chartB} />
        <HBar label="Les deux" value={stats.platforms.both} max={totalPlatforms} color={Colors.neutral} />
      </View>

      <Text style={styles.section}>Départements ({days} j)</Text>
      <View style={styles.card}>
        {stats.departments.length === 0 ? (
          <Text style={styles.small}>Pas encore de données.</Text>
        ) : (
          stats.departments.slice(0, 20).map((d) => (
            <HBar key={d.department} label={d.department === '?' ? 'Inconnu' : d.department} value={d.count} max={deptMax} color={Colors.chartA} />
          ))
        )}
        <Text style={styles.small}>D’après la ville du profil (jamais la position).</Text>
      </View>

      <Text style={styles.section}>Fidélité</Text>
      <View style={styles.card}>
        <View style={styles.tableRow}>
          <Text style={[styles.th, styles.tableFirst]}>Inscrits la semaine du</Text>
          <Text style={styles.th}>Nb</Text>
          <Text style={styles.th}>J+1</Text>
          <Text style={styles.th}>J+7</Text>
          <Text style={styles.th}>J+30</Text>
        </View>
        {stats.retention.length === 0 ? (
          <Text style={styles.small}>Les cohortes apparaissent avec les inscriptions faites depuis le début du suivi.</Text>
        ) : (
          stats.retention.map((r) => (
            <View key={r.week} style={styles.tableRow}>
              <Text style={[styles.td, styles.tableFirst]}>{shortDay(r.week)}</Text>
              <Text style={styles.td}>{r.size}</Text>
              <Text style={styles.td}>{percent(r.d1, r.d1_n)}</Text>
              <Text style={styles.td}>{percent(r.d7, r.d7_n)}</Text>
              <Text style={styles.td}>{percent(r.d30, r.d30_n)}</Text>
            </View>
          ))
        )}
        <Text style={styles.small}>% d’inscrits revenus au moins une fois à partir de J+1, J+7, J+30 (— = pas encore atteint).</Text>
      </View>

      <Text style={styles.section}>Usage des fonctions</Text>
      <View style={styles.card}>
        <View style={styles.tableRow}>
          <Text style={[styles.th, styles.tableFirst]}>Fonction</Text>
          <Text style={styles.th}>7 j</Text>
          <Text style={styles.th}>30 j</Text>
        </View>
        {stats.features.length === 0 ? (
          <Text style={styles.small}>Pas encore de données.</Text>
        ) : (
          stats.features.map((f) => (
            <View key={f.feature} style={styles.tableRow}>
              <Text style={[styles.td, styles.tableFirst]}>{usageLabel(f.feature)}</Text>
              <Text style={styles.td}>{f.n7 ?? 0}</Text>
              <Text style={styles.td}>{f.n30 ?? 0}</Text>
            </View>
          ))
        )}
        <Text style={styles.small}>Compteurs anonymes par jour. Contenus comptés depuis 90 jours, fonctions du téléphone depuis cette version.</Text>
      </View>

      <Text style={styles.section}>Contenu ({days} j)</Text>
      {CONTENT.map((c) => (
        <BarChart key={c.feature} title={c.label} days={stats.daily.map((d) => d.day)} series={[{ label: c.label, color: Colors.chartA, values: usage(c.feature) }]} small />
      ))}
    </ScrollView>
  );
}

const percent = (n: number, of: number) => {
  const p = pct(n, of);
  return p === null ? '—' : `${p} %`;
};

function Tile({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, alert && { color: Colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.td, styles.tableFirst]}>{label}</Text>
      <Text style={styles.td}>{value}</Text>
    </View>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.hbarRow}>
      <Text style={styles.hbarLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbar, { width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.hbarValue}>{value}</Text>
    </View>
  );
}

type Series = { label: string; color: string; values: number[] };

/** Barres par jour (empilées si plusieurs séries) ; toucher une barre affiche ses valeurs */
function BarChart({ title, days, series, small }: { title: string; days: string[]; series: Series[]; small?: boolean }) {
  const styles = useStyles();
  const [selected, setSelected] = useState<number | null>(null);
  const totals = days.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  const i = selected !== null && selected < days.length ? selected : null;

  return (
    <View style={styles.card}>
      <View style={styles.chartHeader}>
        <Text style={styles.label}>{title}</Text>
        <Text style={styles.small}>
          {i !== null
            ? `${shortDay(days[i])} · ${series.length > 1 ? series.map((s) => `${s.label} ${s.values[i]}`).join(' · ') : totals[i]}`
            : `total ${sum} · max ${max} / jour`}
        </Text>
      </View>
      <View style={[styles.chart, small && { height: 64 }]}>
        {days.map((d, k) => (
          <Pressable key={d} style={styles.barSlot} onPress={() => setSelected(k === selected ? null : k)} accessibilityLabel={`${shortDay(d)} : ${totals[k]}`}>
            {totals[k] === 0 ? (
              <View style={styles.barEmpty} />
            ) : (
              <View style={[styles.barStack, { height: `${(totals[k] / max) * 100}%` }, k === i && styles.barSelected]}>
                {series
                  .slice()
                  .reverse()
                  .map((s) =>
                    s.values[k] > 0 ? <View key={s.label} style={{ flex: s.values[k], backgroundColor: s.color }} /> : null,
                  )}
              </View>
            )}
          </Pressable>
        ))}
      </View>
      <View style={styles.chartLegend}>
        <Text style={styles.small}>{days[0] ? shortDay(days[0]) : ''}</Text>
        {series.length > 1 && (
          <View style={styles.legend}>
            {series.map((s) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.small}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.small}>aujourd’hui</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  section: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, minWidth: 100, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 2 },
  statValue: { fontSize: Type.title, fontWeight: '900', color: Colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: Type.small, color: Colors.textMuted, fontWeight: '700' },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 6 },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barStack: { borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: 'hidden', minHeight: 2, gap: 1 },
  barSelected: { opacity: 0.7 },
  barEmpty: { height: 2, backgroundColor: Colors.border },
  chartLegend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  hbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 },
  hbarLabel: { width: 130, fontSize: Type.small, color: Colors.text },
  hbarTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: Colors.border, overflow: 'hidden' },
  hbar: { height: '100%', borderRadius: 5 },
  hbarValue: { width: 40, textAlign: 'right', fontSize: Type.small, color: Colors.text, fontFamily: Fonts.bold, fontVariant: ['tabular-nums'] },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  tableFirst: { flex: 2.4, textAlign: 'left' },
  th: { flex: 1, fontSize: Type.small, color: Colors.textMuted, fontWeight: '800', textAlign: 'right' },
  td: { flex: 1, fontSize: Type.small, color: Colors.text, textAlign: 'right', fontVariant: ['tabular-nums'] },
}));
