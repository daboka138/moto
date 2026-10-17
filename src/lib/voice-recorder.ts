import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';

// Enregistrement des messages vocaux : version Android.
// L'APK 1.2.0 n'a AUCUN module d'enregistrement audio : le module natif « ExpoAudio » est absent,
// voiceRecordingSupported() renvoie false et le bouton 🎤 explique que ça arrive avec la prochaine version.
// Build 1.3.0 (PLAY_STORE.md § 7) : `npx expo install expo-audio` + plugin « expo-audio »
// (microphonePermission) dans app.json, RIEN à changer ici : le module natif est trouvé et ce code
// l'utilise directement (même chemin que useAudioRecorder d'expo-audio, sans importer son JS, pour
// que l'APK 1.2.0 continue de compiler). AAC en M4A mono ~32 kb/s : lisible partout (web compris).
// La lecture des vocaux marche déjà (expo-video).

export type RecordedVoice = {
  data: Blob | ArrayBuffer;
  mimeType: string;
  durationMs: number;
  /** Fichier local pour l'écouter avant l'envoi (libéré par releaseRecordedVoice) */
  uri?: string;
};

export type VoiceRecording = {
  startedAt: number;
  stop: () => Promise<RecordedVoice>;
  cancel: () => void;
};

export type MicPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

type PermissionResponse = { granted: boolean; canAskAgain?: boolean };
type NativeRecorder = {
  uri: string | null;
  prepareToRecordAsync: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
  release?: () => void;
};
type ExpoAudioModule = {
  AudioRecorder: new (options: object) => NativeRecorder;
  getRecordingPermissionsAsync: () => Promise<PermissionResponse>;
  requestRecordingPermissionsAsync: () => Promise<PermissionResponse>;
};

const Audio = requireOptionalNativeModule<ExpoAudioModule>('ExpoAudio');

/** Options natives Android (format de createRecordingOptions d'expo-audio) */
const OPTIONS = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: false,
  outputFormat: 'mpeg4',
  audioEncoder: 'aac',
};

export const MIC_PROMPT_HINT = 'Pour envoyer un vocal, PasseRyder a besoin du micro : choisis « Autoriser ».';
export const MIC_DENIED_HELP =
  'Micro refusé. Pour l’autoriser : Paramètres du téléphone › Applications › PasseRyder › Autorisations › Micro › Autoriser.';
export const VOICE_UNSUPPORTED =
  'Les vocaux arrivent avec la prochaine version de l’appli. En attendant tu peux en envoyer depuis app.passeryder.fr, et tu peux déjà écouter ceux qu’on t’envoie.';

/** Enregistrement possible sur cet appareil (Android : à partir du build 1.3.0, avec expo-audio) */
export function voiceRecordingSupported(): boolean {
  return Audio != null;
}

let granted = false;

export async function micPermission(): Promise<MicPermission> {
  if (granted) return 'granted';
  if (!Audio) return 'unknown';
  const p = await Audio.getRecordingPermissionsAsync();
  granted = p.granted;
  return p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : 'prompt';
}

export async function requestMicPermission(): Promise<boolean> {
  if (!Audio) return false;
  granted = (await Audio.requestRecordingPermissionsAsync()).granted;
  return granted;
}

export async function startVoiceRecording(): Promise<VoiceRecording> {
  if (!Audio) throw new Error(VOICE_UNSUPPORTED);
  if (!granted && !(await requestMicPermission())) throw new Error(MIC_DENIED_HELP);
  const recorder = new Audio.AudioRecorder(OPTIONS);
  await recorder.prepareToRecordAsync();
  recorder.record();
  const startedAt = Date.now();
  const done = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    recorder.release?.();
    return uri;
  };
  return {
    startedAt,
    stop: async () => {
      const uri = await done();
      if (!uri) throw new Error('Enregistrement vide');
      const data = await new File(uri).arrayBuffer();
      if (!data.byteLength) throw new Error('Enregistrement vide');
      return { data, mimeType: 'audio/mp4', durationMs: Date.now() - startedAt, uri };
    },
    cancel: () => {
      done()
        .then((uri) => uri && new File(uri).delete())
        .catch(() => {});
    },
  };
}

/** Efface le fichier gardé pour l'écoute avant envoi */
export function releaseRecordedVoice(v: RecordedVoice) {
  if (!v.uri) return;
  try {
    new File(v.uri).delete();
  } catch {
    // déjà effacé
  }
}
