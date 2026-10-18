import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { makeStyles, Type, useColors } from '@/constants/theme';
import { formatVoiceDuration } from '@/lib/messages';
import { useVoicePlayback } from '@/lib/voice-playback';
import type { VoiceRecorder } from '@/lib/use-voice-recorder';

/** Bulle d'un message vocal : lecture / pause, barre de progression, durée */
export function VoiceMessage({ url, durationMs, mine }: { url: string | undefined; durationMs: number | null; mine: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  const { playing, positionMs, toggle } = useVoicePlayback(url);
  const total = durationMs ?? 0;
  const progress = total ? Math.min(1, positionMs / total) : 0;
  const ink = mine ? Colors.white : Colors.accent;
  return (
    <View style={styles.voice}>
      <Pressable
        onPress={toggle}
        disabled={!url}
        hitSlop={8}
        style={[styles.play, mine && styles.playMine]}
        accessibilityLabel={playing ? 'Pause' : 'Écouter le message vocal'}>
        {url ? (
          <Ionicons name={playing ? 'pause' : 'play'} size={20} color={mine ? Colors.accent : Colors.white} />
        ) : (
          <ActivityIndicator size="small" color={mine ? Colors.accent : Colors.white} />
        )}
      </Pressable>
      <View style={[styles.track, mine && styles.trackMine]}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: ink }]} />
      </View>
      <Text style={[styles.time, mine && styles.timeMine]}>
        {formatVoiceDuration(playing || positionMs > 0 ? positionMs : total)}
      </Text>
    </View>
  );
}

/** Web : pas de sélection de texte, de menu ni de défilement pendant l'appui sur le micro */
const noTouchUi = (Platform.OS === 'web'
  ? { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none', cursor: 'pointer' }
  : {}) as object;

/** Bouton 🎤 : bleu ; rouge pendant l'enregistrement (en mode tap : carré stop + chrono) */
export function VoiceMicButton({ recorder }: { recorder: VoiceRecorder }) {
  const Colors = useColors();
  const styles = useStyles();
  const st = recorder.state;
  const rec = st.phase === 'recording' ? st : null;
  const tap = rec?.mode === 'tap';
  return (
    <View
      {...recorder.micProps}
      style={[styles.mic, noTouchUi, rec && styles.micActive, tap && styles.micTap]}
      accessibilityRole="button"
      accessibilityLabel={tap ? 'Arrêter l’enregistrement' : 'Message vocal : touche pour démarrer, ou maintiens pour parler'}>
      <View pointerEvents="none" style={styles.micInner}>
        <Ionicons name={tap ? 'stop' : 'mic'} size={tap ? 16 : 22} color={Colors.white} />
        {tap && <Text style={styles.micTime}>{formatVoiceDuration(rec.elapsedMs)}</Text>}
      </View>
    </View>
  );
}

/** Petite onde animée pendant l'enregistrement (suit le chrono) */
export function RecordingWave({ elapsedMs }: { elapsedMs: number }) {
  const styles = useStyles();
  const t = elapsedMs / 1000;
  return (
    <View style={styles.wave} pointerEvents="none">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const h = 4 + Math.round(12 * Math.abs(Math.sin(t * 5 + i * 0.9) * Math.cos(t * 2.3 + i * 1.7)));
        return <View key={i} style={[styles.waveBar, { height: h }]} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  voice: { flexDirection: 'row', alignItems: 'center', gap: 12, width: 210, paddingVertical: 2 },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  playMine: { backgroundColor: Colors.white },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  trackMine: { backgroundColor: Colors.accentDark },
  fill: { height: 4 },
  time: { fontSize: Type.small, fontWeight: '700', color: Colors.textMuted, minWidth: 32 },
  timeMine: { color: Colors.white },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  micActive: { backgroundColor: Colors.danger, transform: [{ scale: 1.2 }] },
  micTap: { width: 76, transform: [], paddingHorizontal: 8 },
  micInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  micTime: { fontSize: Type.small, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: Colors.danger },
}));
