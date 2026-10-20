import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { fetchAppSetting, saveAppSetting } from '@/lib/admin';
import { errorMessage } from '@/lib/errors';
import { fetchLaunchStats, PLATFORM_LABELS, sendStoreLaunch, type LaunchStats, type StorePlatform } from '@/lib/store-waitlist';

const LINKS: Record<StorePlatform, { key: string; label: string; prefix: string }> = {
  ios: { key: 'app_store_url', label: 'Lien App Store (https://apps.apple.com/…)', prefix: 'https://apps.apple.com/' },
  android: { key: 'play_store_url', label: 'Lien Google Play (https://play.google.com/…)', prefix: 'https://play.google.com/' },
};

/**
 * Console › Sorties stores : inscrits « Préviens-moi » par plateforme, liens des stores, et envoi
 * (notification + push + email, une seule fois par personne). Le lien App Store renseigné passe
 * aussi le bandeau du web iPhone et passeryder.fr/telecharger en « dispo sur l'App Store ».
 */
export function StoreLaunchAdmin() {
  const Colors = useColors();
  const styles = useStyles();
  const [stats, setStats] = useState<LaunchStats[] | null>(null);
  const [links, setLinks] = useState<Record<StorePlatform, string>>({ ios: '', android: '' });
  const [saved, setSaved] = useState<Record<StorePlatform, string>>({ ios: '', android: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, ios, android] = await Promise.all([fetchLaunchStats(), fetchAppSetting(LINKS.ios.key), fetchAppSetting(LINKS.android.key)]);
      setStats(s);
      const l = { ios: ios ?? '', android: android ?? '' };
      setLinks(l);
      setSaved(l);
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!stats) return <ActivityIndicator color={Colors.accent} />;

  const saveLink = async (p: StorePlatform) => {
    const v = links[p].trim();
    if (v && !v.startsWith(LINKS[p].prefix)) {
      Alert.alert('Lien invalide', `Le lien doit commencer par ${LINKS[p].prefix}`);
      return;
    }
    if (p === 'android' && !v) {
      Alert.alert('Lien obligatoire', 'Le lien Google Play sert aussi à la page /telecharger.');
      return;
    }
    setBusy(`link-${p}`);
    try {
      await saveAppSetting(LINKS[p].key, v);
      setSaved((s) => ({ ...s, [p]: v }));
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const run = async (p: StorePlatform, test: boolean) => {
    setBusy(`${test ? 'test' : 'send'}-${p}`);
    try {
      const r = await sendStoreLaunch(p, test);
      await load();
      const mails = `${r.emailed} email${r.emailed > 1 ? 's' : ''} envoyé${r.emailed > 1 ? 's' : ''}`;
      Alert.alert(
        test ? 'Test envoyé' : 'Inscrits prévenus',
        (test ? 'Notification + push sur ton compte, ' : 'Notifications et push envoyés, ') +
          mails +
          (r.failed ? `, ${r.failed} raté${r.failed > 1 ? 's' : ''} (remis en attente : reclique plus tard).\n${r.error ?? ''}` : '.'),
      );
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmSend = (p: StorePlatform, s: LaunchStats) => {
    if (!s.pending) {
      Alert.alert('Personne à prévenir', 'Tous les inscrits ont déjà été prévenus (ou se sont désinscrits).');
      return;
    }
    Alert.alert(
      `L’appli ${PLATFORM_LABELS[p]} est dispo ?`,
      `${s.pending} personne${s.pending > 1 ? 's' : ''} à prévenir (sur ${s.subscribers} inscrit${s.subscribers > 1 ? 's' : ''}) : ` +
        'notification dans l’appli, push si elle a l’app Android, et l’email si elle l’a accepté. Personne n’est prévenu deux fois.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Prévenir', onPress: () => run(p, false) },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.muted}>
        Inscrits « Préviens-moi » (bandeau du Mur sur le web, Paramètres › Notifications, formulaire de passeryder.fr/telecharger).
        Chacun n’est prévenu qu’une fois ; les désinscrits ne reçoivent rien.
      </Text>
      {stats.map((s) => {
        const p = s.platform;
        const ready = !!saved[p];
        return (
          <View key={p} style={styles.card}>
            <Text style={styles.title}>{PLATFORM_LABELS[p]}</Text>
            <Text style={styles.big}>{s.subscribers} inscrit{s.subscribers > 1 ? 's' : ''}</Text>
            {s.pending > 0 && s.pending < s.subscribers && <Text style={styles.muted}>{s.pending} encore à prévenir</Text>}
            <Text style={styles.muted}>
              {s.members} compte{s.members > 1 ? 's' : ''} · {s.emails} acceptent l’email · déjà prévenus : {s.notified} notif, {s.emailed} email
              {s.unsubscribed ? ` · ${s.unsubscribed} désinscrit${s.unsubscribed > 1 ? 's' : ''}` : ''}
            </Text>
            <Field
              label={LINKS[p].label}
              value={links[p]}
              onChangeText={(v) => setLinks((l) => ({ ...l, [p]: v }))}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {links[p].trim() !== saved[p] && (
              <Button title="Enregistrer le lien" loading={busy === `link-${p}`} onPress={() => saveLink(p)} />
            )}
            {p === 'ios' && (
              <Text style={styles.muted}>Dès qu’il est enregistré : bandeau « dispo sur l’App Store » sur le web iPhone et bouton sur /telecharger.</Text>
            )}
            <Button
              title={ready ? `L’appli ${PLATFORM_LABELS[p]} est dispo : prévenir les inscrits` : 'Renseigne d’abord le lien'}
              icon="megaphone-outline"
              disabled={!ready || !!busy}
              loading={busy === `send-${p}`}
              onPress={() => confirmSend(p, s)}
            />
            <Button
              title="M’envoyer un test"
              icon="flask-outline"
              variant="secondary"
              disabled={!ready || !!busy}
              loading={busy === `test-${p}`}
              onPress={() => run(p, true)}
            />
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 12 },
  card: { gap: 10, padding: 16, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  big: { fontSize: Type.title, fontWeight: '800', color: Colors.accent },
  muted: { fontSize: Type.small, color: Colors.textMuted },
}));
