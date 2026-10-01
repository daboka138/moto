import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

import type { ReportType } from '@/lib/reports';

// Annonces vocales et leurs réglages (Paramètres > Voix et alertes), mémorisés sur le téléphone.

/** guidance : instructions GPS ; danger : alertes de signalements ; info : confirmations (signalement envoyé…) */
export type SpeechKind = 'guidance' | 'danger' | 'info';

export type VoiceRate = 'slow' | 'normal' | 'fast';
export type VoiceVolume = 'low' | 'medium' | 'high';

export type VoiceSettings = {
  /** Guidage vocal GPS */
  guidance: boolean;
  /** Alertes vocales des dangers */
  dangers: boolean;
  /** Types de danger annoncés (tous par défaut) */
  mutedDangerTypes: ReportType[];
  rate: VoiceRate;
  volume: VoiceVolume;
  /** Bouton muet rapide de l'écran de navigation : coupe toutes les annonces */
  muted: boolean;
  /** Limitation de vitesse de la route affichée à côté du compteur */
  speedLimit: boolean;
  /** Dépassement de la limitation : compteur en rouge + bip */
  speedAlert: boolean;
};

export const VOICE_RATES: { value: VoiceRate; label: string; rate: number }[] = [
  { value: 'slow', label: 'Lent', rate: 0.85 },
  { value: 'normal', label: 'Normal', rate: 1 },
  { value: 'fast', label: 'Rapide', rate: 1.2 },
];

export const VOICE_VOLUMES: { value: VoiceVolume; label: string; volume: number }[] = [
  { value: 'low', label: 'Faible', volume: 0.5 },
  { value: 'medium', label: 'Moyen', volume: 0.75 },
  { value: 'high', label: 'Fort', volume: 1 },
];

const KEY = 'moto.voice';
const DEFAULTS: VoiceSettings = {
  guidance: true,
  dangers: true,
  mutedDangerTypes: [],
  rate: 'normal',
  volume: 'high',
  muted: false,
  speedLimit: true,
  speedAlert: true,
};

function read(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<VoiceSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export function getVoiceSettings() {
  return settings;
}

export function updateVoiceSettings(patch: Partial<VoiceSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // pas grave : le réglage vaut pour cette session
  }
  if (patch.muted || patch.guidance === false || patch.dangers === false) Speech.stop();
  listeners.forEach((l) => l());
}

export function useVoiceSettings() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings,
  );
}

/** Ce type de danger est-il annoncé à voix haute ? */
export function isDangerAnnounced(type: ReportType) {
  return settings.dangers && !settings.muted && !settings.mutedDangerTypes.includes(type);
}

function say(text: string, urgent: boolean) {
  if (urgent) Speech.stop();
  Speech.speak(text, {
    language: 'fr-FR',
    rate: VOICE_RATES.find((r) => r.value === settings.rate)!.rate,
    volume: VOICE_VOLUMES.find((v) => v.value === settings.volume)!.volume,
  });
}

/** Annonce vocale en français, selon les réglages. urgent = coupe l'annonce en cours. */
export function speak(text: string, urgent = false, kind: SpeechKind = 'info') {
  if (settings.muted) return;
  if (kind === 'guidance' && !settings.guidance) return;
  if (kind === 'danger' && !settings.dangers) return;
  say(text, urgent);
}

/** Bouton « Tester la voix » : joue toujours, même en muet, avec le débit et le volume choisis. */
export function testVoice() {
  say('Attention, gravillons signalés dans 500 mètres. Dans 200 mètres, tournez à droite.', true);
}

/** Alerte de sécurité (chute détectée…) : lue même en muet, au débit et au volume choisis. */
export function speakAlarm(text: string) {
  say(text, true);
}
