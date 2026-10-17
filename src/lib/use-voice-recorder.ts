import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Vibration, type GestureResponderEvent } from 'react-native';

import { VOICE_MAX_MS } from '@/lib/messages';
import {
  MIC_DENIED_HELP,
  MIC_PROMPT_HINT,
  micPermission,
  releaseRecordedVoice,
  requestMicPermission,
  startVoiceRecording,
  VOICE_UNSUPPORTED,
  voiceRecordingSupported,
  type RecordedVoice,
  type VoiceRecording,
} from '@/lib/voice-recorder';

/** Glisser de plus de 80 px vers la gauche annule l'enregistrement (appui long) */
const CANCEL_DX = -80;
/** Appui plus court : mode « tap » (un tap démarre, un 2e tap arrête) ; plus long : maintenir pour parler */
const TAP_MS = 300;
/** Enregistrement trop court : pas d'envoi */
const MIN_MS = 600;

export type VoiceRecorderState =
  | { phase: 'idle' }
  | { phase: 'recording'; mode: 'hold' | 'tap'; elapsedMs: number; cancelling: boolean }
  | { phase: 'preview'; voice: RecordedVoice };

type Session = { pressAt: number; mode: 'pending' | 'hold' | 'tap'; rec: VoiceRecording | null };

const buzz = () => {
  try {
    Vibration.vibrate(30);
  } catch {
    // pas de vibreur (ordinateur, iPhone sur le web)
  }
};

/**
 * Messages vocaux, deux façons :
 * - appui long : maintenir = enregistre, relâcher = envoie, glisser vers la gauche = annule ;
 * - appui court (< 300 ms) : démarre, un 2e tap arrête → écoute, puis Envoyer ou Supprimer.
 * 2 min max (arrêt automatique), vibration au début et à la fin.
 * Sans enregistrement possible (APK 1.2.0, vieux navigateur) : le bouton reste là et explique pourquoi.
 */
export function useVoiceRecorder({
  onSend,
  onInfo,
}: {
  onSend: (v: RecordedVoice) => void;
  /** Petit message (aide, erreur) ; long = texte à lire tranquillement */
  onInfo: (message: string, long?: boolean) => void;
}) {
  const [state, setState] = useState<VoiceRecorderState>({ phase: 'idle' });
  const session = useRef<Session | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startX = useRef(0);
  // Dernier appui sur le micro (relâché avant la fin des vérifications : on sait quand même si c'était un tap)
  const press = useRef<{ at: number; releasedAt: number | null }>({ at: 0, releasedAt: null });
  const cancelling = useRef(false);
  const stopOnRelease = useRef(false);
  const busy = useRef(false);
  const preview = useRef<RecordedVoice | null>(null);
  const cb = useRef({ onSend, onInfo });
  useEffect(() => {
    cb.current = { onSend, onInfo };
  });

  const setPreview = (v: RecordedVoice | null) => {
    if (preview.current && preview.current !== v) releaseRecordedVoice(preview.current);
    preview.current = v;
    setState(v ? { phase: 'preview', voice: v } : { phase: 'idle' });
  };

  const finish = async (action: 'send' | 'preview' | 'cancel') => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    stopOnRelease.current = false;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState({ phase: 'idle' });
    const r = s.rec;
    // Pas encore démarré : begin() s'en rend compte et annule
    if (!r) return;
    buzz();
    if (action === 'cancel') return r.cancel();
    if (Date.now() - r.startedAt < MIN_MS) {
      r.cancel();
      cb.current.onInfo('Trop court : touche 🎤 pour démarrer, ou maintiens-le pendant que tu parles.');
      return;
    }
    try {
      const v = await r.stop();
      if (action === 'preview') return setPreview(v);
      cb.current.onSend(v);
      releaseRecordedVoice(v);
    } catch (e) {
      cb.current.onInfo(e instanceof Error ? e.message : String(e), true);
    }
  };

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      session.current?.rec?.cancel();
      if (preview.current) releaseRecordedVoice(preview.current);
    },
    [],
  );

  const begin = async (pageX: number) => {
    if (busy.current || preview.current) return;
    // Mode tap : le 2e appui arrête (au relâchement)
    if (session.current?.mode === 'tap') {
      stopOnRelease.current = true;
      return;
    }
    if (session.current) return;
    if (!voiceRecordingSupported()) {
      if (Platform.OS === 'web') cb.current.onInfo(VOICE_UNSUPPORTED, true);
      else Alert.alert('Messages vocaux', VOICE_UNSUPPORTED);
      return;
    }
    busy.current = true;
    try {
      const perm = await micPermission();
      if (perm === 'denied') return cb.current.onInfo(MIC_DENIED_HELP, true);
      if (perm === 'prompt') {
        // 1er usage : on explique, on demande, et on n'enregistre pas par surprise
        cb.current.onInfo(MIC_PROMPT_HINT, true);
        const ok = await requestMicPermission();
        cb.current.onInfo(ok ? 'Micro autorisé ✓ Touche 🎤 pour enregistrer, ou maintiens-le appuyé.' : MIC_DENIED_HELP, true);
        return;
      }
      if (perm === 'unknown') cb.current.onInfo('Si le navigateur le demande, autorise le micro.');
    } catch {
      // état de l'autorisation inconnu : on tente quand même
    } finally {
      busy.current = false;
    }
    const { at, releasedAt } = press.current;
    if (releasedAt != null && releasedAt - at >= TAP_MS) return;
    const s: Session = { pressAt: at, mode: releasedAt != null ? 'tap' : 'pending', rec: null };
    session.current = s;
    startX.current = pageX;
    cancelling.current = false;
    setState({ phase: 'recording', mode: s.mode === 'tap' ? 'tap' : 'hold', elapsedMs: 0, cancelling: false });
    let r: VoiceRecording;
    try {
      r = await startVoiceRecording();
    } catch (e) {
      if (session.current === s) session.current = null;
      setState({ phase: 'idle' });
      cb.current.onInfo(e instanceof Error ? e.message : String(e), true);
      return;
    }
    // Annulé, ou relâché (appui long) avant que le micro ne démarre
    if (session.current !== s) return r.cancel();
    s.rec = r;
    buzz();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - r.startedAt;
      if (elapsed >= VOICE_MAX_MS) finish(s.mode === 'tap' ? 'preview' : 'send');
      else
        setState({
          phase: 'recording',
          mode: s.mode === 'tap' ? 'tap' : 'hold',
          elapsedMs: elapsed,
          cancelling: s.mode !== 'tap' && cancelling.current,
        });
    }, 100);
  };

  const release = () => {
    if (press.current.releasedAt == null) press.current.releasedAt = Date.now();
    if (stopOnRelease.current) {
      stopOnRelease.current = false;
      finish('preview');
      return;
    }
    const s = session.current;
    if (!s || s.mode !== 'pending') return;
    if (Date.now() - s.pressAt < TAP_MS) {
      s.mode = 'tap';
      cancelling.current = false;
      setState((st) => (st.phase === 'recording' ? { ...st, mode: 'tap', cancelling: false } : st));
    } else {
      s.mode = 'hold';
      finish(cancelling.current ? 'cancel' : 'send');
    }
  };

  /** Props du bouton 🎤 (souris et doigt : système de « responder » de React Native) */
  const micProps = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      press.current = { at: Date.now(), releasedAt: null };
      begin(e.nativeEvent.pageX);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (session.current?.mode === 'pending') cancelling.current = e.nativeEvent.pageX - startX.current < CANCEL_DX;
    },
    onResponderRelease: release,
    onResponderTerminate: () => {
      stopOnRelease.current = false;
      if (session.current?.mode === 'pending') finish('cancel');
    },
  };

  return {
    state,
    micProps,
    /** Mode tap : arrêter et envoyer tout de suite */
    stopAndSend: () => finish('send'),
    /** Mode tap : arrêter et jeter */
    cancel: () => finish('cancel'),
    sendPreview: () => {
      const v = preview.current;
      if (!v) return;
      preview.current = null;
      setState({ phase: 'idle' });
      cb.current.onSend(v);
      releaseRecordedVoice(v);
    },
    discardPreview: () => setPreview(null),
  };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;
