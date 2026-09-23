import * as Speech from 'expo-speech';

let muted = false;

export function setVoiceMuted(value: boolean) {
  muted = value;
  if (value) Speech.stop();
}

export function isVoiceMuted() {
  return muted;
}

/** Annonce vocale en français. urgent = coupe l'annonce en cours. */
export function speak(text: string, urgent = false) {
  if (muted) return;
  if (urgent) Speech.stop();
  Speech.speak(text, { language: 'fr-FR', rate: 1.0 });
}
