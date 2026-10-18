// Enregistrement des messages vocaux : version web (MediaRecorder du navigateur).
// Opus en WebM (Chrome, Firefox, Android) ou AAC en MP4 (Safari), mono, ~24 kb/s : 2 min ≈ 360 Ko.

export type RecordedVoice = {
  data: Blob | ArrayBuffer;
  mimeType: string;
  durationMs: number;
  /** URL blob: pour l'écouter avant l'envoi (libérée par releaseRecordedVoice) */
  uri?: string;
};

export type VoiceRecording = {
  startedAt: number;
  stop: () => Promise<RecordedVoice>;
  cancel: () => void;
};

export type MicPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

export const MIC_PROMPT_HINT = 'Pour envoyer un vocal, PasseRyder a besoin du micro : choisis « Autoriser » dans la fenêtre du navigateur.';
export const MIC_DENIED_HELP =
  'Micro bloqué pour ce site. Pour l’autoriser : touche le cadenas 🔒 (ou ⓘ) à gauche de l’adresse › Autorisations › Micro › Autoriser, puis recharge la page.';
// Jamais le message « prochaine version » de l'APK 1.2.0 ici : sur le web, on dit pourquoi le micro manque
const insecure = typeof window !== 'undefined' && window.isSecureContext === false;
export const VOICE_UNSUPPORTED = insecure
  ? 'Les vocaux ont besoin d’une adresse sécurisée : ouvre https://app.passeryder.fr (avec le « s »).'
  : 'Ce navigateur ne permet pas d’enregistrer un vocal. Ouvre app.passeryder.fr dans Chrome, Edge, Firefox ou Safari à jour (pas depuis l’aperçu d’une autre appli).';

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export function voiceRecordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

let granted = false;

/** État de l'autorisation du micro, sans rien demander ('unknown' : navigateur qui ne le dit pas) */
export async function micPermission(): Promise<MicPermission> {
  if (granted) return 'granted';
  try {
    const s = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (s.state === 'granted') granted = true;
    return s.state;
  } catch {
    return 'unknown';
  }
}

/** Demande le micro (fenêtre du navigateur) sans enregistrer */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    granted = true;
  } catch {
    granted = false;
  }
  return granted;
}

export async function startVoiceRecording(): Promise<VoiceRecording> {
  if (!voiceRecordingSupported()) throw new Error(VOICE_UNSUPPORTED);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    granted = false;
    throw new Error(MIC_DENIED_HELP);
  }
  granted = true;
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const startedAt = Date.now();
  recorder.start(250);
  return {
    startedAt,
    stop: () =>
      new Promise<RecordedVoice>((resolve, reject) => {
        recorder.onstop = () => {
          release();
          const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
          const data = new Blob(chunks, { type });
          if (!data.size) reject(new Error('Enregistrement vide'));
          else resolve({ data, mimeType: type, durationMs: Date.now() - startedAt, uri: URL.createObjectURL(data) });
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    },
  };
}

/** Libère l'URL gardée pour l'écoute avant envoi */
export function releaseRecordedVoice(v: RecordedVoice) {
  if (v.uri) URL.revokeObjectURL(v.uri);
}
