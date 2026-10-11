import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';

import { Chip, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  ADMIN_PAGE,
  fetchAdminReports,
  fetchAdminStats,
  fetchAdminUsers,
  moderate,
  REPORT_REASON_LABELS,
  REPORT_TYPE_LABELS,
  setSignupNotify,
  suspendUser,
  useIsAdmin,
  type AdminReport,
  type AdminStats,
  type AdminUser,
} from '@/lib/admin';
import { useSession } from '@/lib/session';

type Tab = 'overview' | 'users' | 'moderation';

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais';

/** Console développeur : réservée à l'admin (vérifié par le serveur à chaque appel). */
export default function AdminScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const admin = useIsAdmin(session?.user.id);
  const [tab, setTab] = useState<Tab>('overview');

  if (!admin) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={36} color={Colors.textMuted} />
        <Text style={styles.muted}>Réservé à l’administrateur.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        <Chip label="Vue d’ensemble" selected={tab === 'overview'} onPress={() => setTab('overview')} />
        <Chip label="Inscrits" selected={tab === 'users'} onPress={() => setTab('users')} />
        <Chip label="Modération" selected={tab === 'moderation'} onPress={() => setTab('moderation')} />
      </View>
      {tab === 'overview' ? <Overview /> : tab === 'users' ? <Users /> : <Moderation />}
    </View>
  );
}

// ---------- Vue d'ensemble ----------

function Overview() {
  const Colors = useColors();
  const styles = useStyles();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await fetchAdminStats());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!stats) {
    return <View style={styles.center}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={Colors.accent} />}</View>;
  }

  const max = Math.max(1, ...stats.signups.map((d) => d.count));
  const toggleNotify = async (on: boolean) => {
    setStats({ ...stats, notify_signups: on });
    try {
      await setSignupNotify(on);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
      load();
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          colors={[Colors.accent]}
        />
      }>
      <Text style={styles.section}>Comptes</Text>
      <View style={styles.grid}>
        <Stat label="Total" value={stats.users} big />
        <Stat label="Aujourd’hui" value={stats.new_today} />
        <Stat label="7 jours" value={stats.new_7d} />
        <Stat label="30 jours" value={stats.new_30d} />
        <Stat label="Actifs 24 h" value={stats.active_24h} />
        <Stat label="Actifs 7 j" value={stats.active_7d} />
        <Stat label="Suspendus" value={stats.suspended} />
      </View>

      <Text style={styles.section}>Inscriptions par jour (30 jours)</Text>
      <View style={styles.card}>
        <View style={styles.chart}>
          {stats.signups.map((d) => (
            <View key={d.day} style={styles.barSlot}>
              <View style={[styles.bar, { height: `${(d.count / max) * 100}%` }, d.count === 0 && styles.barEmpty]} />
            </View>
          ))}
        </View>
        <View style={styles.chartLegend}>
          <Text style={styles.small}>{date(stats.signups[0]?.day ?? null)}</Text>
          <Text style={styles.small}>max {max} / jour</Text>
          <Text style={styles.small}>aujourd’hui</Text>
        </View>
      </View>

      <Text style={styles.section}>Contenus</Text>
      <View style={styles.grid}>
        <Stat label="Balades" value={stats.rides} />
        <Stat label="Événements" value={stats.events} />
        <Stat label="Spots" value={stats.places} />
        <Stat label="Posts" value={stats.posts} />
      </View>

      <Text style={styles.section}>SMS envoyés (Brevo)</Text>
      <View style={styles.grid}>
        <Stat label="Aujourd’hui" value={stats.sms_today} />
        <Stat label="7 jours" value={stats.sms_7d} />
        <Stat label="30 jours" value={stats.sms_30d} />
        <Stat label="Erreurs 7 j" value={stats.sms_errors_7d} alert={stats.sms_errors_7d > 0} />
      </View>

      <View style={[styles.card, styles.switchRow]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Notification à chaque inscription</Text>
          <Text style={styles.small}>Push sur ce compte quand un nouveau motard s’inscrit.</Text>
        </View>
        <Switch
          value={stats.notify_signups ?? false}
          onValueChange={toggleNotify}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.white}
        />
      </View>
      <Text style={styles.small}>
        La console n’affiche jamais de position, de trajet, de message privé ni de numéro de contact d’urgence.
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value, big, alert }: { label: string; value: number; big?: boolean; alert?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.stat, big && styles.statBig]}>
      <Text style={[styles.statValue, alert && { color: Colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------- Inscrits ----------

function Users() {
  const Colors = useColors();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ key: string; users: AdminUser[]; more: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = query.trim();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchAdminUsers(key)
        .then((users) => !cancelled && setResult({ key, users, more: users.length === ADMIN_PAGE }))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const current = result && result.key === key ? result : null;

  const more = async () => {
    if (!current) return;
    setLoadingMore(true);
    try {
      const next = await fetchAdminUsers(key, current.users.length);
      setResult({ key, users: [...current.users, ...next], more: next.length === ADMIN_PAGE });
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleSuspend = (u: AdminUser) =>
    Alert.alert(
      u.suspended ? 'Rétablir ce compte ?' : 'Suspendre ce compte ?',
      u.suspended
        ? `@${u.username} pourra de nouveau se connecter.`
        : `@${u.username} est déconnecté tout de suite et ne peut plus se connecter. Ses données sont gardées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: u.suspended ? 'Rétablir' : 'Suspendre',
          style: u.suspended ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await suspendUser(u.id, !u.suspended);
              setResult((r) => r && { ...r, users: r.users.map((x) => (x.id === u.id ? { ...x, suspended: !u.suspended } : x)) });
            } catch (e) {
              Alert.alert('Oups', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field label="Rechercher" value={query} onChangeText={setQuery} placeholder="Pseudo ou email" autoCapitalize="none" />
      {!current ? (
        <View style={styles.centerSmall}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={Colors.accent} />}</View>
      ) : current.users.length === 0 ? (
        <Text style={styles.muted}>Aucun inscrit trouvé.</Text>
      ) : (
        current.users.map((u) => (
          <Pressable
            key={u.id}
            style={({ pressed }) => [styles.card, styles.userRow, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}>
            <Image source={{ uri: u.avatarUrl }} style={styles.avatar} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.label} numberOfLines={1}>
                @{u.username}
                {u.isAdmin ? ' · admin' : ''}
                {u.suspended ? ' · suspendu' : ''}
              </Text>
              <Text style={styles.small} numberOfLines={1}>
                {u.email ?? '—'}
              </Text>
              <Text style={styles.small}>
                Inscrit le {date(u.createdAt)} · vu {dateTime(u.lastSeen)}
              </Text>
              <Text style={styles.small}>
                {[u.city, u.platform].filter(Boolean).join(' · ') || 'Ville et plateforme inconnues'}
              </Text>
            </View>
            {!u.isAdmin && (
              <Pressable onPress={() => toggleSuspend(u)} hitSlop={8} accessibilityLabel={u.suspended ? 'Rétablir' : 'Suspendre'}>
                <Ionicons name={u.suspended ? 'lock-open-outline' : 'ban'} size={24} color={u.suspended ? Colors.success : Colors.danger} />
              </Pressable>
            )}
          </Pressable>
        ))
      )}
      {current?.more && (
        <Pressable style={styles.more} onPress={more} disabled={loadingMore}>
          {loadingMore ? <ActivityIndicator color={Colors.accent} /> : <Text style={styles.link}>Voir plus</Text>}
        </Pressable>
      )}
    </ScrollView>
  );
}

// ---------- Modération ----------

function targetHref(r: AdminReport): Href | null {
  switch (r.targetType) {
    case 'place':
      return { pathname: '/place/[id]', params: { id: r.targetId } };
    case 'event':
      return { pathname: '/event/[id]', params: { id: r.targetId } };
    case 'user':
      return { pathname: '/user/[id]', params: { id: r.targetId } };
    default:
      return r.authorId ? { pathname: '/user/[id]', params: { id: r.authorId } } : null;
  }
}

function Moderation() {
  const Colors = useColors();
  const styles = useStyles();
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReports(await fetchAdminReports());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (r: AdminReport, action: 'hide' | 'unhide' | 'delete' | 'dismiss') => {
    setBusy(r.targetType + r.targetId);
    try {
      await moderate(r, action);
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = (r: AdminReport) =>
    Alert.alert('Supprimer définitivement ?', `${REPORT_TYPE_LABELS[r.targetType] ?? r.targetType} : « ${r.excerpt ?? '…'} »`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => act(r, 'delete') },
    ]);

  const confirmSuspend = (r: AdminReport) =>
    r.authorId &&
    Alert.alert('Suspendre l’auteur ?', `@${r.authorUsername ?? '?'} est déconnecté et ne peut plus se connecter.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Suspendre',
        style: 'destructive',
        onPress: async () => {
          try {
            await suspendUser(r.authorId!, true, `Signalé : ${r.targetType}`);
            Alert.alert('Compte suspendu', `@${r.authorUsername ?? '?'}`);
          } catch (e) {
            Alert.alert('Oups', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  if (!reports) {
    return <View style={styles.center}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={Colors.accent} />}</View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.small}>
        Spots, avis, événements, photos, commentaires, stories et comptes signalés (les messages privés ne sont jamais affichés).
        Un spot ou un avis signalé 3 fois est déjà masqué automatiquement.
      </Text>
      {reports.length === 0 && <Text style={styles.muted}>Aucun signalement en attente. 👌</Text>}
      {reports.map((r) => {
        const href = targetHref(r);
        const canHide = r.targetType === 'place' || r.targetType === 'place_review';
        const canDelete = r.targetType !== 'user';
        const working = busy === r.targetType + r.targetId;
        return (
          <View key={r.targetType + r.targetId} style={[styles.card, { gap: 6 }]}>
            <Text style={styles.reportType}>
              {REPORT_TYPE_LABELS[r.targetType] ?? r.targetType}
              {r.hidden ? ' · masqué' : ''}
            </Text>
            <Text style={styles.label} numberOfLines={3}>
              {r.excerpt ?? '(contenu déjà supprimé)'}
            </Text>
            <Text style={styles.small}>
              {r.reports} signalement{r.reports > 1 ? 's' : ''} ({r.reasons.map((x) => REPORT_REASON_LABELS[x] ?? x).join(', ')}) · dernier{' '}
              {dateTime(r.lastAt)}
              {r.authorUsername ? ` · par @${r.authorUsername}` : ''}
            </Text>
            {working ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <View style={styles.actions}>
                {href && <Action label="Voir" onPress={() => router.push(href)} />}
                {canHide && <Action label={r.hidden ? 'Réafficher' : 'Masquer'} onPress={() => act(r, r.hidden ? 'unhide' : 'hide')} />}
                {canDelete && <Action label="Supprimer" danger onPress={() => confirmDelete(r)} />}
                <Action label="Ignorer" onPress={() => act(r, 'dismiss')} />
                {r.authorId && <Action label="Suspendre l’auteur" danger onPress={() => confirmSuspend(r)} />}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Action({ label, danger, onPress }: { label: string; danger?: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.action, danger && styles.actionDanger, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, backgroundColor: Colors.background },
  centerSmall: { padding: 24, alignItems: 'center' },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, flexWrap: 'wrap' },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, minWidth: 90, backgroundColor: Colors.surface, borderRadius: 14, padding: 12, gap: 2 },
  statBig: { minWidth: '100%' },
  statValue: { fontSize: 24, fontWeight: '900', color: Colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: Colors.accent, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  barEmpty: { backgroundColor: Colors.border },
  chartLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  small: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
  more: { alignItems: 'center', padding: 12 },
  link: { color: Colors.accent, fontWeight: '800' },
  reportType: { fontSize: 12, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background },
  actionDanger: { backgroundColor: Colors.danger },
  actionText: { fontWeight: '800', color: Colors.text, fontSize: 13 },
  actionTextDanger: { color: Colors.white },
}));
