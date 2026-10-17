// Enregistrement des messages vocaux : version Android.
// L'APK 1.2.0 n'a AUCUN module d'enregistrement audio (ni expo-audio ni expo-av) : l'enregistrement
// arrive avec le build 1.3.0 (PLAY_STORE.md § 7). La lecture des vocaux marche déjà (expo-video).
// Pour la 1.3.0 : npx expo install expo-audio, plugin « expo-audio » (microphonePermission) dans
// app.json, puis ici useAudioRecorder / AudioModule.requestRecordingPermissionsAsync avec
// RecordingPresets.LOW_QUALITY (AAC .m4a, mono, ~32 kb/s) et le fichier lu en ArrayBuffer
// (expo-file-system File.arrayBuffer()) pour sendVoiceMessage, type « audio/mp4 ».

export type RecordedVoice = { data: Blob | ArrayBuffer; mimeType: string; durationMs: number };

export type VoiceRecording = {
  startedAt: number;
  stop: () => Promise<RecordedVoice>;
  cancel: () => void;
};

/** Enregistrement possible sur cet appareil (Android : à partir du build 1.3.0) */
export function voiceRecordingSupported(): boolean {
  return false;
}

export async function startVoiceRecording(): Promise<VoiceRecording> {
  throw new Error('Les messages vocaux s’enregistrent depuis la version web pour l’instant (bientôt dans l’app).');
}
