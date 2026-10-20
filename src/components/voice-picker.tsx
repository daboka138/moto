import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { listFrenchVoices, pickDefaultVoice, previewVoice, updateVoiceSettings, useVoiceSettings, type FrenchVoice } from '@/lib/voice';

/**
 * Paramètres › Voix et alertes › Voix du guidage : voix françaises du téléphone, « Écouter » pour
 * chacune, choix mémorisé. Automatique = voix d'homme française si le téléphone en a une.
 */
export function VoicePicker() {
  const Colors = useColors();
  const styles = useStyles();
  const settings = useVoiceSettings();
  const [voices, setVoices] = useState<FrenchVoice[] | null>(null);

  useEffect(() => {
    let alive = true;
    listFrenchVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
    };
  }, []);

  if (!voices) return <ActivityIndicator color={Colors.accent} />;
  const auto = pickDefaultVoice(voices);
  const selectedMissing = settings.voiceId && !voices.some((v) => v.id === settings.voiceId);
  const rows: { id: string | null; label: string; sub?: string }[] = [
    { id: null, label: 'Automatique', sub: auto ? `${auto.label}${auto.male ? '' : ' (pas de voix d’homme sur ce téléphone)'}` : 'Voix par défaut du téléphone' },
    ...voices.map((v) => ({ id: v.id, label: v.label, sub: v.language })),
  ];

  return (
    <View style={styles.wrap}>
      {rows.map((r) => {
        const selected = r.id === null ? !settings.voiceId || !!selectedMissing : settings.voiceId === r.id;
        return (
          <View key={r.id ?? 'auto'} style={[styles.row, selected && styles.rowOn]}>
            <Pressable
              style={styles.choice}
              onPress={() => updateVoiceSettings({ voiceId: r.id })}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? Colors.accent : Colors.textMuted} />
              <View style={styles.text}>
                <Text style={styles.label}>{r.label}</Text>
                {!!r.sub && <Text style={styles.sub}>{r.sub}</Text>}
              </View>
            </Pressable>
            <Pressable style={styles.listen} onPress={() => previewVoice(r.id)} hitSlop={6} accessibilityLabel={`Écouter ${r.label}`}>
              <Ionicons name="play" size={16} color={Colors.accent} />
              <Text style={styles.listenText}>Écouter</Text>
            </Pressable>
          </View>
        );
      })}
      <Text style={styles.sub}>
        {voices.length
          ? 'Les voix dépendent du téléphone (moteur de synthèse vocale). « Hors ligne » marche aussi sans réseau.'
          : 'Aucune voix française trouvée : la voix par défaut du téléphone est utilisée.'}
      </Text>
      {Platform.OS === 'android' && (
        <Pressable
          style={styles.settingsLink}
          onPress={() => Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(() => Linking.openSettings())}
          accessibilityRole="button">
          <Ionicons name="settings-outline" size={18} color={Colors.accent} />
          <Text style={styles.listenText}>Installer d’autres voix (synthèse vocale d’Android)</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 8 },
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
  listen: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.accent },
  listenText: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  settingsLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
}));
