import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { Button, Chip, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  ADMIN_PAGE,
  CHALLENGE_METRICS,
  deleteChallenge,
  fetchChallenges,
  saveChallenge,
  fetchAdminReports,
  fetchAppSetting,
  fetchReferralStats,
  saveAppSetting,
  type ReferralStats,
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
  type ChallengeMetric,
  type ChallengeRow,
} from '@/lib/admin';
import { FEATURE_STATUS_LABELS, refreshFeatures, setFeatureStatus, setUserPremium, useFeatures, type FeatureStatus } from '@/lib/features';
import { deletePartnerLink, fetchPartnerLinks, savePartnerLink, type PartnerLink, type PartnerLinkDraft } from '@/lib/partners';
import { pickPlace } from '@/lib/place-picker';
import { deleteScenic, fetchScenic, saveScenic, SCENIC_KINDS, type ScenicDraft, type ScenicWaypoint } from '@/lib/scenic';
import { useSession } from '@/lib/session';

type Tab = 'overview' | 'users' | 'moderation' | 'features';

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
        <Chip label="Fonctions" selected={tab === 'features'} onPress={() => setTab('features')} />
      </View>
      {tab === 'overview' ? <Overview /> : tab === 'users' ? <Users /> : tab === 'moderation' ? <Moderation /> : <Features />}
    </View>
  );
}

// ---------- Vue d'ensemble ----------

function Overview() {
  const Colors = useColors();
  const styles = useStyles();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      fetchReferralStats()
        .then(setReferrals)
        .catch((e) => console.warn('Invitations indisponibles', e));
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

      <Text style={styles.section}>Invitations</Text>
      <View style={styles.grid}>
        <Stat label="Inscrits par invitation" value={referrals?.invited ?? 0} />
        <Stat label="30 jours" value={referrals?.invited_30d ?? 0} />
        <Stat label="Actifs (1re action)" value={referrals?.qualified ?? 0} />
      </View>
      {!!referrals?.top.length && (
        <View style={[styles.card, { gap: 4 }]}>
          <Text style={styles.label}>Top parrains</Text>
          {referrals.top.map((t, i) => (
            <Text key={t.username} style={styles.small}>
              {i + 1}. @{t.username} · {t.n} filleul{t.n > 1 ? 's' : ''} ({t.qualified} actif{t.qualified > 1 ? 's' : ''})
            </Text>
          ))}
        </View>
      )}

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

  const setPremium = (u: AdminUser) => {
    const apply = async (mode: 'lifetime' | 'until' | 'free', months?: number) => {
      try {
        const until = months ? new Date(Date.now() + months * 30 * 24 * 3600 * 1000) : undefined;
        await setUserPremium(u.id, mode, until);
        setResult(
          (r) =>
            r && {
              ...r,
              users: r.users.map((x) =>
                x.id === u.id
                  ? { ...x, lifetimePremium: mode === 'lifetime' || x.isAdmin, premiumUntil: until ? until.toISOString() : null }
                  : x,
              ),
            },
        );
      } catch (e) {
        Alert.alert('Oups', e instanceof Error ? e.message : String(e));
      }
    };
    showActionSheet({
      title: `Premium pour @${u.username}`,
      message: 'Offert (testeurs) : aucun paiement. Un admin reste premium à vie.',
      options: [
        { label: 'Offrir 1 mois', onPress: () => apply('until', 1) },
        { label: 'Offrir 3 mois', onPress: () => apply('until', 3) },
        { label: 'Offrir 1 an', onPress: () => apply('until', 12) },
        { label: 'Offrir à vie', onPress: () => apply('lifetime') },
        { label: 'Retirer le premium', destructive: true, onPress: () => apply('free') },
      ],
    });
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
              {premiumLabel(u) && <Text style={styles.premium}>★ {premiumLabel(u)}</Text>}
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
            <Pressable onPress={() => setPremium(u)} hitSlop={8} accessibilityLabel="Premium">
              <Ionicons name={premiumLabel(u) ? 'star' : 'star-outline'} size={24} color={Colors.accent} />
            </Pressable>
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

function premiumLabel(u: AdminUser) {
  if (u.lifetimePremium) return 'Premium à vie';
  if (u.premiumUntil && new Date(u.premiumUntil) > new Date()) return `Premium jusqu’au ${date(u.premiumUntil)}`;
  return null;
}

// ---------- Modération ----------

function targetHref(r: AdminReport): Href | null {
  switch (r.targetType) {
    case 'place':
      return { pathname: '/place/[id]', params: { id: r.targetId } };
    case 'event':
      return { pathname: '/event/[id]', params: { id: r.targetId } };
    case 'club':
      return { pathname: '/club/[id]', params: { id: r.targetId } };
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
        const canHide = r.targetType === 'place' || r.targetType === 'place_review' || r.targetType === 'club';
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

// ---------- Fonctionnalités (gratuit / premium / désactivé) et défi du mois ----------

const STATUSES: FeatureStatus[] = ['free', 'premium', 'disabled'];

function Features() {
  const Colors = useColors();
  const styles = useStyles();
  const { features } = useFeatures();
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshFeatures().catch((e) => console.warn('Fonctionnalités indisponibles', e));
    }, []),
  );

  const change = async (key: string, status: FeatureStatus) => {
    setBusy(key);
    try {
      await setFeatureStatus(key, status);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.small}>
        Gratuit = pour tous ; Premium = membres premium seulement ; Désactivé = masqué pour tous. Bêta : tout reste gratuit.
        Aucun paiement n’existe encore (voir PLAY_STORE.md). « Écran PasseRyder Premium » : Gratuit = bouton visible dans Paramètres.
      </Text>
      {!features ? (
        <ActivityIndicator color={Colors.accent} />
      ) : (
        features.map((f) => (
          <View key={f.key} style={[styles.card, { gap: 8 }]}>
            <Text style={styles.label}>{f.name}</Text>
            {!!f.description && <Text style={styles.small}>{f.description}</Text>}
            {busy === f.key ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <View style={styles.actions}>
                {STATUSES.map((st) => (
                  <Chip key={st} label={FEATURE_STATUS_LABELS[st]} selected={f.status === st} onPress={() => f.status !== st && change(f.key, st)} />
                ))}
              </View>
            )}
          </View>
        ))
      )}

      <Text style={styles.section}>Distribution de l’app</Text>
      <Distribution />

      <Text style={styles.section}>Liens partenaires (Idées de balades)</Text>
      <PartnerLinks />

      <Text style={styles.section}>Cols et routes réputés (boucles)</Text>
      <ScenicWaypoints />

      <Text style={styles.section}>Défi du mois</Text>
      <Challenges />
    </ScrollView>
  );
}

// Page passeryder.fr/telecharger (et tous les boutons « Télécharger » du site) : test fermé = 3 étapes
// (groupe des testeurs, activer le test, Google Play), public = Google Play seul. Lu par la page
// dans app_settings : aucun recodage ni republication pour passer en public.
const DISTRIBUTION_LINKS = [
  { key: 'testers_group_url', label: '1. Groupe des testeurs (https://groups.google.com/…)', prefix: 'https://groups.google.com/', testOnly: true },
  { key: 'testing_optin_url', label: '2. Activer le test (https://play.google.com/apps/testing/…)', prefix: 'https://play.google.com/apps/testing/', testOnly: true },
  { key: 'play_store_url', label: '3. Google Play (https://play.google.com/…)', prefix: 'https://play.google.com/', testOnly: false },
] as const;
type DistributionKey = 'distribution_mode' | 'google_review' | (typeof DISTRIBUTION_LINKS)[number]['key'];
const DISTRIBUTION_KEYS: DistributionKey[] = ['distribution_mode', 'google_review', ...DISTRIBUTION_LINKS.map((l) => l.key)];

function Distribution() {
  const styles = useStyles();
  const [values, setValues] = useState<Record<DistributionKey, string> | null>(null);
  const [saved, setSaved] = useState<Record<DistributionKey, string> | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all(DISTRIBUTION_KEYS.map((k) => fetchAppSetting(k)))
        .then((list) => {
          const v = Object.fromEntries(DISTRIBUTION_KEYS.map((k, i) => [k, list[i] ?? ''])) as Record<DistributionKey, string>;
          if (v.distribution_mode !== 'public') v.distribution_mode = 'test';
          if (v.google_review !== 'on') v.google_review = 'off';
          setValues(v);
          setSaved(v);
        })
        .catch((e) => Alert.alert('Oups', e instanceof Error ? e.message : String(e)));
    }, []),
  );

  if (!values || !saved) return null;
  const isPublic = values.distribution_mode === 'public';
  const changed = DISTRIBUTION_KEYS.filter((k) => values[k].trim() !== saved[k]);
  const invalid = DISTRIBUTION_LINKS.filter((l) => (!l.testOnly || !isPublic || values[l.key].trim()) && !values[l.key].trim().startsWith(l.prefix));
  const set = (k: DistributionKey, v: string) => setValues({ ...values, [k]: v });
  // Bandeau de validation : enregistré tout de suite (1 clic le jour J)
  const setReview = (v: 'on' | 'off') => {
    if (v === saved.google_review) return;
    setValues({ ...values, google_review: v });
    saveAppSetting('google_review', v)
      .then(() => setSaved((cur) => (cur ? { ...cur, google_review: v } : cur)))
      .catch((e) => {
        setValues((cur) => (cur ? { ...cur, google_review: saved.google_review } : cur));
        Alert.alert('Oups', e instanceof Error ? e.message : String(e));
      });
  };
  return (
    <View style={[styles.card, { gap: 8 }]}>
      <Text style={styles.small}>Mode de distribution (page passeryder.fr/telecharger)</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label="Test fermé (3 étapes)" selected={!isPublic} onPress={() => set('distribution_mode', 'test')} />
        <Chip label="Public (Google Play seul)" selected={isPublic} onPress={() => set('distribution_mode', 'public')} />
      </View>
      <Text style={styles.small}>Validation Google en cours (bandeau « utilise la version web » sur /telecharger, /i et /c)</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label="⏳ Oui" selected={values.google_review === 'on'} onPress={() => setReview('on')} />
        <Chip label="Non (app validée)" selected={values.google_review !== 'on'} onPress={() => setReview('off')} />
      </View>
      {DISTRIBUTION_LINKS.map((l) => (
        <Field
          key={l.key}
          label={l.testOnly && isPublic ? `${l.label} — inutilisé en public` : l.label}
          value={values[l.key]}
          onChangeText={(v) => set(l.key, v)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ))}
      <Text style={styles.small}>
        La page relit ces réglages à chaque visite : rien à republier. Le lien 3 sert aussi d’étape unique en public.
      </Text>
      {changed.length > 0 && (
        <Button
          title={invalid.length ? `Lien invalide : ${invalid[0].label.split(' (')[0]}` : 'Enregistrer'}
          disabled={invalid.length > 0}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              for (const k of changed) await saveAppSetting(k, values[k].trim());
              setSaved(Object.fromEntries(DISTRIBUTION_KEYS.map((k) => [k, values[k].trim()])) as Record<DistributionKey, string>);
            } catch (e) {
              Alert.alert('Oups', e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </View>
  );
}

// Liens partenaires « 💡 Besoin d'idées ? » (écrans boucle et création de balade). Clics = nombre
// anonyme, à montrer au partenaire. Zone : centre + rayon, ou partout.
const EMPTY_LINK = (order: number): PartnerLinkDraft => ({
  title: '',
  description: '',
  url: 'https://',
  imageUrl: '',
  zoneLabel: '',
  zone: null,
  zoneRadiusKm: 50,
  active: true,
  sortOrder: order,
});

function PartnerLinks() {
  const styles = useStyles();
  const [list, setList] = useState<PartnerLink[] | null>(null);
  const [draft, setDraft] = useState<PartnerLinkDraft | null>(null);
  const [radius, setRadius] = useState('50');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await fetchPartnerLinks());
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const edit = (d: PartnerLinkDraft) => {
    setDraft(d);
    setRadius(String(d.zoneRadiusKm ?? 50));
  };

  if (!list) return null;

  if (draft) {
    const set = (patch: Partial<PartnerLinkDraft>) => setDraft({ ...draft, ...patch });
    const radiusKm = Number(radius);
    const https = (u: string) => /^https:\/\/\S+$/.test(u.trim());
    const error =
      draft.title.trim().length < 3
        ? 'Titre trop court'
        : !https(draft.url)
          ? 'Adresse invalide (https://…)'
          : draft.imageUrl?.trim() && !https(draft.imageUrl)
            ? 'Image invalide (https://…)'
            : draft.zone && !(Number.isInteger(radiusKm) && radiusKm >= 1 && radiusKm <= 2000)
              ? 'Rayon entre 1 et 2000 km'
              : null;
    return (
      <View style={[styles.card, { gap: 8 }]}>
        <Field label="Titre" value={draft.title} onChangeText={(v) => set({ title: v })} maxLength={100} />
        <Field label="Description courte" value={draft.description ?? ''} onChangeText={(v) => set({ description: v })} maxLength={200} />
        <Field label="Adresse du lien" value={draft.url} onChangeText={(v) => set({ url: v })} autoCapitalize="none" autoCorrect={false} />
        <Field
          label="Image (facultatif, https://…)"
          value={draft.imageUrl ?? ''}
          onChangeText={(v) => set({ imageUrl: v })}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field label="Zone affichée (ex. Marseille / Bouches-du-Rhône)" value={draft.zoneLabel ?? ''} onChangeText={(v) => set({ zoneLabel: v })} maxLength={80} />
        <View style={styles.actions}>
          <Chip label="Partout" selected={!draft.zone} onPress={() => set({ zone: null })} />
          <Chip
            label={draft.zone ? `Centre : ${draft.zone.latitude.toFixed(3)}, ${draft.zone.longitude.toFixed(3)}` : 'Choisir le centre de la zone'}
            selected={!!draft.zone}
            onPress={async () => {
              const place = await pickPlace({ title: 'Centre de la zone', initial: draft.zone });
              if (place) setDraft((d) => d && { ...d, zone: { latitude: place.latitude, longitude: place.longitude } });
            }}
          />
        </View>
        {draft.zone && <Field label="Rayon (km)" value={radius} onChangeText={setRadius} keyboardType="number-pad" maxLength={4} />}
        <Field
          label="Ordre (plus petit = en premier)"
          value={String(draft.sortOrder)}
          onChangeText={(v) => set({ sortOrder: Number(v.replace(/[^0-9]/g, '')) || 0 })}
          keyboardType="number-pad"
          maxLength={4}
        />
        <View style={styles.actions}>
          <Chip label="Actif" selected={draft.active} onPress={() => set({ active: true })} />
          <Chip label="Inactif" selected={!draft.active} onPress={() => set({ active: false })} />
        </View>
        <Button
          title={error ?? 'Enregistrer'}
          disabled={!!error}
          loading={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await savePartnerLink({ ...draft, zoneRadiusKm: draft.zone ? radiusKm : null });
              setDraft(null);
              await load();
            } catch (e) {
              Alert.alert('Oups', e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          }}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setDraft(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {list.map((l) => (
        <Pressable
          key={l.id}
          style={[styles.card, { gap: 2, opacity: l.active ? 1 : 0.55 }]}
          onPress={() =>
            showActionSheet({
              title: l.title,
              options: [
                { label: 'Modifier', onPress: () => edit({ ...l }) },
                { label: l.active ? 'Désactiver' : 'Activer', onPress: () => savePartnerLink({ ...l, active: !l.active }).then(load, (e) => Alert.alert('Oups', String(e))) },
                {
                  label: 'Supprimer',
                  destructive: true,
                  onPress: () =>
                    Alert.alert('Supprimer ce lien ?', `${l.title} (${l.clicks} clic${l.clicks > 1 ? 's' : ''})`, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => deletePartnerLink(l.id).then(load, (e) => Alert.alert('Oups', String(e))) },
                    ]),
                },
              ],
            })
          }>
          <Text style={styles.label}>{l.title}</Text>
          <Text style={styles.small}>
            {[l.description, l.zoneLabel ?? (l.zone ? null : 'Partout'), l.zone ? `${l.zoneRadiusKm} km` : null, l.active ? null : 'inactif']
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.premium}>
            {l.clicks} clic{l.clicks > 1 ? 's' : ''} envoyé{l.clicks > 1 ? 's' : ''}
          </Text>
        </Pressable>
      ))}
      <Button title="+ Ajouter un lien partenaire" variant="secondary" onPress={() => edit(EMPTY_LINK(list.length))} />
      <Text style={styles.small}>Clics comptés de façon anonyme (un nombre par lien, rien sur qui clique).</Text>
    </View>
  );
}

// Cols et routes réputés : points de passage choisis en priorité par « Fais-moi une boucle »
// (avec un peu de hasard). Le point doit être SUR la route : choisi sur la carte, il y est accroché.
function ScenicWaypoints() {
  const styles = useStyles();
  const [list, setList] = useState<ScenicWaypoint[] | null>(null);
  const [draft, setDraft] = useState<ScenicDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await fetchScenic());
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!list) return null;

  if (draft) {
    const set = (patch: Partial<ScenicDraft>) => setDraft({ ...draft, ...patch });
    const placed = Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude);
    const error = draft.name.trim().length < 2 ? 'Nom trop court' : !placed ? 'Choisis la position' : null;
    return (
      <View style={[styles.card, { gap: 8 }]}>
        <Field label="Nom (ex. Col de la Gineste)" value={draft.name} onChangeText={(v) => set({ name: v })} maxLength={80} />
        <Field label="Région (ex. Marseille)" value={draft.region} onChangeText={(v) => set({ region: v })} maxLength={60} />
        <View style={styles.actions}>
          {SCENIC_KINDS.map((k) => (
            <Chip key={k.value} label={`${k.emoji} ${k.label}`} selected={draft.kind === k.value} onPress={() => set({ kind: k.value })} />
          ))}
        </View>
        <Chip
          label={placed ? `📍 ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}` : 'Choisir la position sur la route'}
          selected={placed}
          onPress={async () => {
            const place = await pickPlace({ title: draft.name || 'Col ou route', initial: placed ? draft : null });
            if (place) setDraft((d) => d && { ...d, latitude: place.latitude, longitude: place.longitude });
          }}
        />
        <View style={styles.actions}>
          <Chip label="Actif" selected={draft.active} onPress={() => set({ active: true })} />
          <Chip label="Inactif" selected={!draft.active} onPress={() => set({ active: false })} />
        </View>
        <Button
          title={error ?? 'Enregistrer'}
          disabled={!!error}
          loading={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await saveScenic(draft);
              setDraft(null);
              await load();
            } catch (e) {
              Alert.alert('Oups', e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          }}
        />
        <Button title="Annuler" variant="ghost" onPress={() => setDraft(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {list.map((w) => (
        <Pressable
          key={w.id}
          style={[styles.card, { gap: 2, opacity: w.active ? 1 : 0.55 }]}
          onPress={() =>
            showActionSheet({
              title: w.name,
              options: [
                { label: 'Modifier', onPress: () => setDraft({ ...w }) },
                { label: w.active ? 'Désactiver' : 'Activer', onPress: () => saveScenic({ ...w, active: !w.active }).then(load, (e) => Alert.alert('Oups', String(e))) },
                {
                  label: 'Supprimer',
                  destructive: true,
                  onPress: () =>
                    Alert.alert('Supprimer ce point ?', w.name, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => deleteScenic(w.id).then(load, (e) => Alert.alert('Oups', String(e))) },
                    ]),
                },
              ],
            })
          }>
          <Text style={styles.label}>
            {SCENIC_KINDS.find((k) => k.value === w.kind)?.emoji} {w.name}
          </Text>
          <Text style={styles.small}>{[w.region || 'Sans région', w.active ? null : 'inactif'].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
      <Button
        title="+ Ajouter un col ou une route"
        variant="secondary"
        onPress={() => setDraft({ name: '', region: '', kind: 'col', latitude: NaN, longitude: NaN, active: true })}
      />
      <Text style={styles.small}>
        Utilisés en priorité (avec un peu de hasard) comme points de passage des boucles, avec les spots « belle route » et « point de vue » notés 4/5 ou plus.
      </Text>
    </View>
  );
}

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const EMPTY_CHALLENGE = (): ChallengeRow => ({
  month: thisMonth(),
  emoji: '🎯',
  title: '',
  description: '',
  metric: 'clean_km',
  goal: 100,
  bonus: 50,
});

function Challenges() {
  const Colors = useColors();
  const styles = useStyles();
  const [list, setList] = useState<ChallengeRow[] | null>(null);
  const [draft, setDraft] = useState<ChallengeRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await fetchChallenges());
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const save = async () => {
    if (!draft) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.month) || draft.title.trim().length < 3 || !(draft.goal > 0)) {
      Alert.alert('Défi', 'Mois au format AAAA-MM, titre de 3 caractères au moins, objectif supérieur à 0.');
      return;
    }
    setSaving(true);
    try {
      await saveChallenge({ ...draft, title: draft.title.trim(), description: draft.description?.trim() || null });
      setDraft(null);
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (draft) {
    return (
      <View style={[styles.card, { gap: 8 }]}>
        <Field label="Mois (AAAA-MM)" value={draft.month} onChangeText={(v) => setDraft({ ...draft, month: v.trim() })} maxLength={7} />
        <Field label="Emoji" value={draft.emoji} onChangeText={(v) => setDraft({ ...draft, emoji: v })} maxLength={8} />
        <Field label="Titre" value={draft.title} onChangeText={(v) => setDraft({ ...draft, title: v })} maxLength={80} />
        <Field
          label="Description"
          value={draft.description ?? ''}
          onChangeText={(v) => setDraft({ ...draft, description: v })}
          maxLength={300}
          multiline
        />
        <Text style={styles.label}>Ce qui est compté</Text>
        <View style={styles.actions}>
          {CHALLENGE_METRICS.map((m) => (
            <Chip
              key={m.value}
              label={m.label}
              selected={draft.metric === m.value}
              onPress={() => setDraft({ ...draft, metric: m.value as ChallengeMetric })}
            />
          ))}
        </View>
        <Field
          label={draft.metric === 'clean_km' ? 'Objectif (km)' : 'Objectif'}
          value={String(draft.goal || '')}
          onChangeText={(v) => setDraft({ ...draft, goal: parseInt(v.replace(/\D/g, ''), 10) || 0 })}
          keyboardType="number-pad"
        />
        <Field
          label="Bonus (points, 200 max)"
          value={String(draft.bonus)}
          onChangeText={(v) => setDraft({ ...draft, bonus: Math.min(200, parseInt(v.replace(/\D/g, ''), 10) || 0) })}
          keyboardType="number-pad"
        />
        <Button title="Enregistrer le défi" onPress={save} loading={saving} />
        <Button title="Annuler" variant="ghost" onPress={() => setDraft(null)} />
      </View>
    );
  }

  return (
    <>
      {!list ? (
        <ActivityIndicator color={Colors.accent} />
      ) : list.length === 0 ? (
        <Text style={styles.muted}>Aucun défi.</Text>
      ) : (
        list.map((c) => (
          <View key={c.month} style={[styles.card, { gap: 4 }]}>
            <Text style={styles.reportType}>
              {c.month}
              {c.month === thisMonth() ? ' · en cours' : ''}
            </Text>
            <Text style={styles.label}>
              {c.emoji} {c.title}
            </Text>
            <Text style={styles.small}>
              {CHALLENGE_METRICS.find((m) => m.value === c.metric)?.label ?? c.metric} : {c.goal} · bonus {c.bonus} points
            </Text>
            <View style={styles.actions}>
              <Action label="Modifier" onPress={() => setDraft(c)} />
              <Action
                label="Supprimer"
                danger
                onPress={() =>
                  Alert.alert('Supprimer ce défi ?', c.title, [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Supprimer',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteChallenge(c.month);
                          await load();
                        } catch (e) {
                          Alert.alert('Oups', e instanceof Error ? e.message : String(e));
                        }
                      },
                    },
                  ])
                }
              />
            </View>
          </View>
        ))
      )}
      <Button title="Nouveau défi" variant="secondary" onPress={() => setDraft(EMPTY_CHALLENGE())} />
    </>
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
  premium: { fontSize: 12, fontWeight: '800', color: Colors.accent },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.background },
  actionDanger: { backgroundColor: Colors.danger },
  actionText: { fontWeight: '800', color: Colors.text, fontSize: 13 },
  actionTextDanger: { color: Colors.white },
}));
