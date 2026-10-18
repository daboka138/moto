import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';

import { FeatureGate } from '@/components/feature-gate';
import { LevelBar } from '@/components/good-points';
import { Card } from '@/components/profile-view';
import { Button, Chip, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { IS_WEB } from '@/lib/app-link';
import {
  checkNewBadges,
  fetchMyGoodPoints,
  fetchRanking,
  goodBadges,
  initSeenBadges,
  LEVELS,
  POINT_KINDS,
  resetGoodPoints,
  saveGoodPointsSettings,
  type GoodPointsSettings,
  type MyGoodPoints,
  type RankingRow,
} from '@/lib/good-points';
import { photoUrl } from '@/lib/profile';

/** « Mes points » : niveau, défi du mois, badges, classement entre amis, historique, confidentialité. */
export default function PointsScreen() {
  return (
    <FeatureGate feature="good_points">
      <Points />
    </FeatureGate>
  );
}

function Points() {
  const Colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<MyGoodPoints | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const mine = await fetchMyGoodPoints();
      setData(mine);
      setError(null);
      if (mine.settings.enabled) checkNewBadges(mine.counters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const save = async (next: GoodPointsSettings) => {
    if (!data) return;
    const before = data.settings;
    setData({ ...data, settings: next });
    try {
      await saveGoodPointsSettings(next);
      if (next.enabled && !before.enabled) initSeenBadges(data.counters);
    } catch (e) {
      setData({ ...data, settings: before });
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  if (!data) {
    return <View style={styles.center}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={Colors.accent} />}</View>;
  }

  const s = data.settings;

  if (!s.enabled) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.heroEmoji}>🛡️</Text>
        <Text style={styles.heroTitle}>Points de bon comportement</Text>
        <Text style={styles.text}>
          Gagne des points en roulant proprement et en aidant les autres : km sans dépasser les limitations, trajets sans
          toucher au téléphone, dangers confirmés, balades et convois menés, spots bien notés.
        </Text>
        <Card title="C’est toi qui choisis">
          <Text style={styles.text}>• Désactivé tant que tu ne l’actives pas.</Text>
          <Text style={styles.text}>• Ton score est privé : tu décides s’il apparaît sur ton profil ou dans un classement entre amis.</Text>
          <Text style={styles.text}>• Jamais transmis à un tiers. Aucun point lié à la vitesse ou au chrono.</Text>
        </Card>
        <Rules />
        <Button title="Activer les points" loading={busy} onPress={async () => {
          setBusy(true);
          await save({ ...s, enabled: true });
          setBusy(false);
          load();
        }} />
      </ScrollView>
    );
  }

  const badges = goodBadges(data.counters);
  const ch = data.challenge;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
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
      <View style={styles.box}>
        <LevelBar total={data.total} />
        <View style={styles.totals}>
          <Total value={data.month} label="ce mois-ci" />
          <Total value={data.today} label={`aujourd’hui (max ${data.dailyCap})`} />
          <Total value={badges.filter((b) => b.unlocked).length} label={`badges sur ${badges.length}`} />
        </View>
      </View>

      {ch && (
        <Card title="Défi du mois">
          <View style={styles.challenge}>
            <Text style={styles.challengeEmoji}>{ch.done ? '✅' : ch.emoji}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.label}>{ch.title}</Text>
              {!!ch.description && <Text style={styles.small}>{ch.description}</Text>}
              <View style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(1, ch.progress / ch.goal) * 100}%` },
                    ch.done && { backgroundColor: Colors.success },
                  ]}
                />
              </View>
              <Text style={styles.small}>
                {Math.min(Math.floor(ch.progress), ch.goal).toLocaleString('fr-FR')} / {ch.goal.toLocaleString('fr-FR')}
                {ch.done ? ' · réussi !' : ` · bonus ${ch.bonus} points`}
              </Text>
            </View>
          </View>
        </Card>
      )}

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

      <Ranking settings={s} />

      <Card title="Historique">
        {data.history.length === 0 ? (
          <Text style={styles.muted}>
            Pas encore de points. {IS_WEB ? 'Les km propres se comptent pendant une navigation dans l’app Android. ' : ''}
            Lance une navigation, confirme un danger ou organise une balade !
          </Text>
        ) : (
          data.history.map((h, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.historyEmoji}>{POINT_KINDS[h.kind]?.emoji ?? '•'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {POINT_KINDS[h.kind]?.label ?? h.kind}
                  {h.kind === 'clean_km' ? ` · ${h.qty.toLocaleString('fr-FR')} km` : ''}
                </Text>
                <Text style={styles.small}>
                  {new Date(h.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {h.points === 0 ? ' · plafond du jour atteint' : ''}
                </Text>
              </View>
              <Text style={styles.historyPoints}>+{h.points}</Text>
            </View>
          ))
        )}
      </Card>

      <Rules />

      <Card title="Confidentialité">
        <SwitchRow
          label="Afficher mon niveau et mes badges sur mon profil"
          description="Visible par les membres connectés. Ton historique reste privé."
          value={s.showOnProfile}
          onChange={(v) => save({ ...s, showOnProfile: v })}
        />
        <SwitchRow
          label="Classement entre amis"
          description="Tes amis qui l’ont aussi activé voient tes points du mois, et toi les leurs."
          value={s.friendsRanking}
          onChange={(v) => save({ ...s, friendsRanking: v })}
        />
        <SwitchRow
          label="Classement de mon département"
          description="Ton pseudo et tes points du mois, visibles par les membres du même département qui l’ont activé."
          value={s.departmentRanking}
          onChange={(v) => {
            if (v && !s.department) {
              Alert.alert('Département', 'Indique d’abord ton département ci-dessous (ex. 13, 2A, 974).');
              return;
            }
            save({ ...s, departmentRanking: v });
          }}
        />
        <DepartmentField settings={s} onSave={save} />
      </Card>

      <Text style={styles.small}>
        Jamais de points liés à la vitesse ou au temps de parcours. Ton score n’est jamais transmis à un tiers. Les km propres
        et les trajets sans téléphone sont mesurés pendant la navigation dans l’app ; le reste est calculé par le serveur.
      </Text>
      <Pressable
        onPress={() =>
          Alert.alert('Effacer mon historique ?', 'Tous tes points et badges de bon comportement sont supprimés.', [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Effacer',
              style: 'destructive',
              onPress: async () => {
                try {
                  await resetGoodPoints();
                  load();
                } catch (e) {
                  Alert.alert('Oups', e instanceof Error ? e.message : String(e));
                }
              },
            },
          ])
        }>
        <Text style={styles.danger}>Effacer mon historique de points</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          Alert.alert('Désactiver les points ?', 'Tu ne gagnes plus de points et tu disparais des classements. Ton historique est gardé.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Désactiver', style: 'destructive', onPress: () => save({ ...s, enabled: false, friendsRanking: false, departmentRanking: false, showOnProfile: false }) },
          ])
        }>
        <Text style={styles.danger}>Désactiver les points</Text>
      </Pressable>
    </ScrollView>
  );
}

function Rules() {
  const styles = useStyles();
  return (
    <Card title="Comment gagner des points">
      {(Object.keys(POINT_KINDS) as (keyof typeof POINT_KINDS)[]).map((k) => (
        <Text key={k} style={styles.text}>
          {POINT_KINDS[k].emoji} {POINT_KINDS[k].rule}
        </Text>
      ))}
      <Text style={styles.small}>
        Plafond : 100 points par jour. Niveaux : {LEVELS.map((l) => `${l.emoji} ${l.label} (${l.min})`).join(' → ')}.
      </Text>
    </Card>
  );
}

function Ranking({ settings }: { settings: GoodPointsSettings }) {
  const Colors = useColors();
  const styles = useStyles();
  const [scope, setScope] = useState<'friends' | 'department'>('friends');
  const [rows, setRows] = useState<{ key: string; rows: RankingRow[] } | null>(null);
  const on = scope === 'friends' ? settings.friendsRanking : settings.departmentRanking;
  const key = `${scope}:${on}:${settings.department}`;

  useFocusEffect(
    useCallback(() => {
      if (!on) return;
      let cancelled = false;
      fetchRanking(scope)
        .then((r) => !cancelled && setRows({ key, rows: r }))
        .catch((e) => console.warn('Classement indisponible', e));
      return () => {
        cancelled = true;
      };
    }, [scope, on, key]),
  );

  const current = rows && rows.key === key ? rows.rows : null;
  return (
    <Card title="Classement du mois">
      <View style={styles.chips}>
        <Chip label="Mes amis" selected={scope === 'friends'} onPress={() => setScope('friends')} />
        <Chip
          label={settings.department ? `Département ${settings.department}` : 'Mon département'}
          selected={scope === 'department'}
          onPress={() => setScope('department')}
        />
      </View>
      {!on ? (
        <Text style={styles.muted}>
          {scope === 'friends'
            ? 'Active « Classement entre amis » dans Confidentialité, plus bas, pour comparer tes points avec tes amis.'
            : 'Active « Classement de mon département » dans Confidentialité, plus bas.'}
        </Text>
      ) : !current ? (
        <ActivityIndicator color={Colors.accent} />
      ) : current.length <= 1 ? (
        <Text style={styles.muted}>
          {scope === 'friends'
            ? 'Aucun ami dans le classement pour l’instant : il faut qu’ils activent aussi les points et le classement entre amis.'
            : 'Personne d’autre de ton département dans le classement pour l’instant.'}
        </Text>
      ) : (
        current.map((r, i) => (
          <Pressable
            key={r.userId}
            style={[styles.rankRow, r.isMe && styles.rankMe]}
            onPress={() => !r.isMe && router.push({ pathname: '/user/[id]', params: { id: r.userId } })}>
            <Text style={styles.rank}>{i + 1}</Text>
            <Image source={{ uri: photoUrl(r.avatarPath) }} style={styles.avatar} />
            <Text style={[styles.label, { flex: 1 }]} numberOfLines={1}>
              {r.isMe ? 'Moi' : `@${r.username}`}
            </Text>
            <Text style={styles.historyPoints}>{r.points}</Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

function DepartmentField({ settings, onSave }: { settings: GoodPointsSettings; onSave: (s: GoodPointsSettings) => Promise<void> }) {
  const styles = useStyles();
  const [value, setValue] = useState(settings.department ?? '');
  const clean = value.trim().toUpperCase();
  const valid = /^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$/.test(clean);
  const changed = clean !== (settings.department ?? '');
  return (
    <View style={styles.deptRow}>
      <View style={{ flex: 1 }}>
        <Field
          label="Mon département"
          value={value}
          onChangeText={setValue}
          placeholder="ex. 13, 2A, 974"
          autoCapitalize="characters"
          maxLength={3}
        />
      </View>
      {changed && (
        <Chip
          label={clean && !valid ? 'Invalide' : 'Enregistrer'}
          onPress={
            clean && !valid
              ? undefined
              : () => onSave({ ...settings, department: clean || null, departmentRanking: clean ? settings.departmentRanking : false })
          }
        />
      )}
    </View>
  );
}

function SwitchRow({ label, description, value, onChange }: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.label}>{label}</Text>
        {!!description && <Text style={styles.small}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.accent, false: Colors.border }}
        thumbColor={Colors.white}
        {...(IS_WEB && ({ activeThumbColor: Colors.white } as object))}
      />
    </View>
  );
}

function Total({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value.toLocaleString('fr-FR')}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: Type.body, lineHeight: 20 },
  text: { color: Colors.text, fontSize: Type.body, lineHeight: 20 },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  heroEmoji: { fontSize: 56, textAlign: 'center' },
  heroTitle: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  box: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 16 },
  totals: { flexDirection: 'row' },
  total: { flex: 1, alignItems: 'center' },
  totalValue: { fontSize: Type.title, fontWeight: '900', color: Colors.accent },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  challengeEmoji: { fontSize: Type.title },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badge: { width: '30%', flexGrow: 1, alignItems: 'center', gap: 3, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  locked: { backgroundColor: Colors.background, opacity: 0.7 },
  badgeEmoji: { fontSize: Type.title },
  badgeLabel: { fontSize: Type.small, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  badgeDesc: { fontSize: Type.small, color: Colors.textMuted, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 8, borderRadius: Radius.md },
  rankMe: { backgroundColor: Colors.accentSoft },
  rank: { width: 22, fontSize: Type.body, fontWeight: '900', color: Colors.textMuted, textAlign: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.border },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyEmoji: { fontSize: Type.title },
  historyPoints: { fontSize: Type.body, fontWeight: '900', color: Colors.accent, fontVariant: ['tabular-nums'] },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  deptRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  danger: { color: Colors.danger, fontWeight: '700', textAlign: 'center', padding: 8 },
}));
