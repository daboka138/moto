// Enregistrement des messages vocaux : version web (MediaRecorder du navigateur).
// Opus en WebM (Chrome, Firefox, Android) ou AAC en MP4 (Safari), mono, ~24 kb/s : 2 min ≈ 360 Ko.

export type RecordedVoice = { data: Blob | ArrayBuffer; mimeType: string; durationMs: number };

export type VoiceRecording = {
  startedAt: number;
  stop: () => Promise<RecordedVoice>;
  cancel: () => void;
};

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export function voiceRecordingSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export async function startVoiceRecording(): Promise<VoiceRecording> {
  if (!voiceRecordingSupported()) throw new Error('Ce navigateur ne permet pas d’enregistrer un message vocal.');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    throw new Error('Micro refusé : autorise le micro pour ce site dans les réglages du navigateur.');
  }
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
          else resolve({ data, mimeType: type, durationMs: Date.now() - startedAt });
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
