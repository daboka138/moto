import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import {
  addNewsSource,
  fetchAdminNews,
  fetchNewsNow,
  fetchNewsSources,
  setNewsHidden,
  setNewsSourceEnabled,
  type AdminNews,
  type NewsSource,
} from '@/lib/news';

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais';

/** Console › Actus : sources RSS (activer, ajouter), dernière récupération, masquer une actu */
export function NewsAdmin() {
  const Colors = useColors();
  const styles = useStyles();
  const [sources, setSources] = useState<NewsSource[] | null>(null);
  const [items, setItems] = useState<AdminNews[]>([]);
  const [name, setName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchNewsSources()
      .then(setSources)
      .catch((e) => Alert.alert('Oups', errorMessage(e)));
    fetchAdminNews()
      .then(setItems)
      .catch((e) => console.warn('Actus indisponibles', e));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const fetchNow = () =>
    run(async () => {
      const report = await fetchNewsNow();
      const lines = Object.entries(report).map(([k, v]) => `${k} : ${v}`);
      Alert.alert('Récupération faite', lines.join('\n') || 'Rien de nouveau.');
    });

  const add = () =>
    run(async () => {
      if (!name.trim()) throw new Error('Donne un nom à la source.');
      await addNewsSource(name, feedUrl);
      setName('');
      setFeedUrl('');
    });

  if (!sources) return <ActivityIndicator color={Colors.accent} />;
  const last = sources.map((s) => s.lastFetchAt).filter(Boolean).sort().at(-1) ?? null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Sources</Text>
      <Text style={styles.muted}>
        Récupération automatique toutes les 3 h. Dernière : {when(last)}. On garde le titre, 1-2 phrases du résumé du
        flux et le lien ; rien sur la police, les contrôles, les radars ou les permis.
      </Text>
      {sources.map((s) => (
        <View key={s.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{s.name}</Text>
            <Text style={styles.small} numberOfLines={1}>
              {s.feedUrl}
            </Text>
            <Text style={[styles.small, s.lastStatus && s.lastStatus !== 'ok' && { color: Colors.danger }]}>
              {when(s.lastFetchAt)}
              {s.lastStatus ? ` · ${s.lastStatus === 'ok' ? `+${s.lastNew ?? 0} nouvelles` : s.lastStatus}` : ''}
            </Text>
          </View>
          <Switch
            value={s.enabled}
            onValueChange={(v) => run(() => setNewsSourceEnabled(s.id, v))}
            trackColor={{ true: Colors.accent }}
            disabled={busy}
          />
        </View>
      ))}
      <Button title="Récupérer maintenant" icon="refresh" variant="secondary" loading={busy} onPress={fetchNow} />

      <Text style={styles.title}>Ajouter un flux</Text>
      <Field label="Nom" value={name} onChangeText={setName} placeholder="Ex. Moto Revue" />
      <Field
        label="Adresse du flux RSS"
        value={feedUrl}
        onChangeText={setFeedUrl}
        placeholder="https://…/rss.xml"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Button title="Ajouter" icon="add" onPress={add} disabled={busy} />

      <Text style={styles.title}>Dernières actus</Text>
      {items.map((n) => (
        <View key={n.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, n.hidden && styles.hidden]} numberOfLines={2}>
              {n.title}
            </Text>
            <Text style={styles.small}>
              {n.sourceName} · {when(n.publishedAt)}
            </Text>
          </View>
          <Pressable onPress={() => run(() => setNewsHidden(n.id, !n.hidden))} hitSlop={8} disabled={busy}>
            <Text style={styles.action}>{n.hidden ? 'Réafficher' : 'Masquer'}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 12 },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text, marginTop: 8 },
  muted: { fontSize: Type.small, color: Colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 12,
  },
  name: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted },
  hidden: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  action: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
}));
