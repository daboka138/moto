import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { formatVoiceDuration, VOICE_MAX_MS } from '@/lib/messages';
import { useVoicePlayback } from '@/lib/voice-playback';
import { startVoiceRecording, type RecordedVoice, type VoiceRecording } from '@/lib/voice-recorder';

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

/** Glisser de plus de 80 px vers la gauche annule l'enregistrement */
const CANCEL_DX = -80;
/** Appui trop court : pas d'envoi, petite aide à la place */
const MIN_MS = 700;

/**
 * Micro : maintenir pour enregistrer (2 min max, envoi automatique au bout), relâcher pour envoyer,
 * glisser vers la gauche pour annuler.
 */
export function VoiceRecordButton({
  onRecorded,
  onState,
  onError,
}: {
  onRecorded: (v: RecordedVoice) => void;
  /** Enregistrement en cours : durée écoulée, annulation imminente (null : rien en cours) */
  onState: (s: { elapsedMs: number; cancelling: boolean } | null) => void;
  onError: (message: string) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const recording = useRef<VoiceRecording | null>(null);
  const pressed = useRef(false);
  const startX = useRef(0);
  const cancelling = useRef(false);
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    recording.current = null;
    setActive(false);
    onState(null);
  };

  const finish = async (send: boolean) => {
    const r = recording.current;
    if (!r) return;
    clear();
    if (!send || Date.now() - r.startedAt < MIN_MS) {
      r.cancel();
      if (send) onError('Maintiens le micro appuyé pendant que tu parles, puis relâche pour envoyer.');
      return;
    }
    try {
      onRecorded(await r.stop());
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recording.current?.cancel();
    },
    [],
  );

  const begin = async (e: GestureResponderEvent) => {
    pressed.current = true;
    cancelling.current = false;
    startX.current = e.nativeEvent.pageX;
    try {
      const r = await startVoiceRecording();
      // Relâché pendant la demande d'autorisation du micro : on n'enregistre pas
      if (!pressed.current) return r.cancel();
      recording.current = r;
      setActive(true);
      onState({ elapsedMs: 0, cancelling: false });
      timer.current = setInterval(() => {
        const elapsed = Date.now() - r.startedAt;
        if (elapsed >= VOICE_MAX_MS) finish(true);
        else onState({ elapsedMs: elapsed, cancelling: cancelling.current });
      }, 200);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <View
      style={[styles.mic, active && styles.micActive]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={begin}
      onResponderMove={(e) => {
        cancelling.current = e.nativeEvent.pageX - startX.current < CANCEL_DX;
      }}
      onResponderRelease={() => {
        pressed.current = false;
        finish(!cancelling.current);
      }}
      onResponderTerminate={() => {
        pressed.current = false;
        finish(false);
      }}
      accessibilityRole="button"
      accessibilityLabel="Maintenir pour enregistrer un message vocal">
      <Ionicons name="mic" size={22} color={Colors.white} />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 210, paddingVertical: 2 },
  play: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  playMine: { backgroundColor: Colors.white },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  trackMine: { backgroundColor: Colors.accentDark },
  fill: { height: 4 },
  time: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, minWidth: 32 },
  timeMine: { color: Colors.white },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  micActive: { backgroundColor: Colors.danger, transform: [{ scale: 1.25 }] },
}));
