import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import {
  getVoiceSettings,
  isVoiceBad,
  listFrenchVoices,
  onVoicesChange,
  pickDefaultVoice,
  previewVoice,
  updateVoiceSettings,
  useVoiceSettings,
  type FrenchVoice,
} from '@/lib/voice';

const UNAVAILABLE =
  'Cette voix n’est pas installée sur ton téléphone. Va dans Réglages Android > Synthèse vocale pour la télécharger, ou choisis-en une autre.';

const openTtsSettings = () => Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(() => Linking.openSettings());

function unavailable() {
  Alert.alert('Voix indisponible', UNAVAILABLE, [
    { text: 'Choisir une autre', style: 'cancel' },
    ...(Platform.OS === 'android' ? [{ text: 'Synthèse vocale', onPress: openTtsSettings }] : []),
  ]);
}

/**
 * Paramètres › Voix et alertes › Voix du guidage. Replié : « Voix : … », Écouter, Changer.
 * Déplié : voix françaises utilisables du téléphone, puis « Autres voix » (réseau, ou qui ont échoué).
 * Choisir une voix la fait parler : si elle ne marche pas, message et retour à la voix précédente.
 */
export function VoicePicker() {
  const Colors = useColors();
  const styles = useStyles();
  const settings = useVoiceSettings();
  const [voices, setVoices] = useState<FrenchVoice[] | null>(null);
  const [open, setOpen] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  /** Voix en cours d'essai ('auto' = Automatique) */
  const [testing, setTesting] = useState<string | null>(null);

  const reload = useCallback(() => {
    listFrenchVoices().then(setVoices);
  }, []);
  useEffect(() => {
    let alive = true;
    listFrenchVoices().then((v) => alive && setVoices(v));
    const off = onVoicesChange(reload);
    return () => {
      alive = false;
      off();
    };
  }, [reload]);

  if (!voices) return <ActivityIndicator color={Colors.accent} />;
  const auto = pickDefaultVoice(voices);
  const main = voices.filter((v) => !v.network && !v.failed);
  const others = voices.filter((v) => v.network || v.failed);
  const chosen = settings.voiceId ? (voices.find((v) => v.id === settings.voiceId) ?? null) : null;
  const autoLabel = auto ? `Automatique (${auto.label})` : 'Automatique';
  const currentLabel = chosen ? chosen.label : autoLabel;
  const chosenBad = !!chosen && isVoiceBad(chosen.id);

  const listen = async (id: string | null) => {
    setTesting(id ?? 'auto');
    const ok = await previewVoice(id);
    setTesting(null);
    if (ok) return;
    // La voix choisie ne marche plus : retour à Automatique
    if (id && getVoiceSettings().voiceId === id) updateVoiceSettings({ voiceId: null });
    unavailable();
  };

  const choose = async (id: string | null) => {
    const previous = getVoiceSettings().voiceId;
    updateVoiceSettings({ voiceId: id });
    setOpen(false);
    setShowOthers(false);
    setTesting(id ?? 'auto');
    const ok = await previewVoice(id);
    setTesting(null);
    if (ok) return;
    updateVoiceSettings({ voiceId: previous && previous !== id && !isVoiceBad(previous) ? previous : null });
    unavailable();
  };

  const row = (id: string | null, label: string, sub?: string) => {
    const selected = id === null ? !chosen : settings.voiceId === id;
    const key = id ?? 'auto';
    return (
      <View key={key} style={[styles.row, selected && styles.rowOn]}>
        <Pressable style={styles.choice} onPress={() => choose(id)} accessibilityRole="radio" accessibilityState={{ checked: selected }}>
          <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? Colors.accent : Colors.textMuted} />
          <View style={styles.text}>
            <Text style={styles.label}>{label}</Text>
            {!!sub && <Text style={styles.sub}>{sub}</Text>}
          </View>
        </Pressable>
        <ListenButton testing={testing === key} onPress={() => listen(id)} label={label} />
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.current}>
        <View style={styles.text}>
          <Text style={styles.label} numberOfLines={2}>
            Voix : {currentLabel}
          </Text>
          {chosenBad && <Text style={styles.warn}>Elle n’a pas marché : la voix par défaut est utilisée.</Text>}
        </View>
        <ListenButton testing={testing !== null && !open} onPress={() => listen(chosen && !chosenBad ? chosen.id : null)} label={currentLabel} />
        <Pressable style={styles.change} onPress={() => setOpen((o) => !o)} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={styles.listenText}>{open ? 'Fermer' : 'Changer'}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.accent} />
        </Pressable>
      </View>

      {open && (
        <>
          {row(null, 'Automatique', auto ? `${auto.label}${auto.male ? '' : ' (pas de voix d’homme sur ce téléphone)'}` : 'Voix par défaut du téléphone')}
          {main.map((v) => row(v.id, v.label, `${v.region} · sur le téléphone`))}
          {others.length > 0 && (
            <Pressable style={styles.othersToggle} onPress={() => setShowOthers((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showOthers }}>
              <Ionicons name={showOthers ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              <Text style={styles.sub}>Autres voix ({others.length}) : peuvent nécessiter un téléchargement</Text>
            </Pressable>
          )}
          {showOthers &&
            others.map((v) => row(v.id, v.label, v.failed ? 'N’a pas marché sur ce téléphone' : `${v.region} · réseau, peut demander un téléchargement`))}
          <Text style={styles.sub}>
            {voices.length
              ? 'Les voix dépendent du téléphone (moteur de synthèse vocale). Si celle choisie ne répond pas pendant le guidage, la voix par défaut prend le relais.'
              : 'Aucune voix française trouvée : la voix par défaut du téléphone est utilisée.'}
          </Text>
          {Platform.OS === 'android' && (
            <Pressable style={styles.settingsLink} onPress={openTtsSettings} accessibilityRole="button">
              <Ionicons name="settings-outline" size={18} color={Colors.accent} />
              <Text style={styles.listenText}>Installer d’autres voix (synthèse vocale d’Android)</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function ListenButton({ testing, onPress, label }: { testing: boolean; onPress: () => void; label: string }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={styles.listen} onPress={onPress} disabled={testing} hitSlop={6} accessibilityLabel={`Écouter ${label}`}>
      {testing ? <ActivityIndicator size="small" color={Colors.accent} /> : <Ionicons name="play" size={16} color={Colors.accent} />}
      <Text style={styles.listenText}>Écouter</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 8 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowOn: { borderColor: Colors.accent },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1 },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  sub: { fontSize: Type.small, color: Colors.textMuted },
  warn: { fontSize: Type.small, color: Colors.danger },
  listen: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.accent },
  change: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 6 },
  listenText: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  othersToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  settingsLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
}));
