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
  /** Alertes moto en navigation (voix + bandeau), désactivables une par une */
  curveAlerts: boolean;
  sunAlerts: boolean;
  weatherAlerts: boolean;
  /** Rappel de pause : 0 = désactivé, sinon minutes de route (60, 90, 120 ; 2 = test admin) */
  breakReminderMin: number;
  /** Voix choisie (identifiant du téléphone) ; null = automatique (voix d'homme française si dispo) */
  voiceId: string | null;
};

export const BREAK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Désactivé' },
  { value: 60, label: '1 h' },
  { value: 90, label: '1 h 30' },
  { value: 120, label: '2 h' },
];

// « Normal » = un peu plus lent que la voix du téléphone : rendu calme et posé
export const VOICE_RATES: { value: VoiceRate; label: string; rate: number }[] = [
  { value: 'slow', label: 'Lent', rate: 0.8 },
  { value: 'normal', label: 'Normal', rate: 0.9 },
  { value: 'fast', label: 'Rapide', rate: 1.05 },
];
/** Ton légèrement plus grave que celui du téléphone */
const PITCH = 0.9;

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
  curveAlerts: true,
  sunAlerts: true,
  weatherAlerts: true,
  breakReminderMin: 0,
  voiceId: null,
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

// ---------- Voix du téléphone ----------
// La liste dépend du téléphone (moteur de synthèse installé : Google, Samsung…) ou du navigateur.
// Aucune voix d'homme n'est garantie : sans elle, la meilleure voix française disponible.

export type FrenchVoice = {
  id: string;
  /** « Voix 2 · homme · hors ligne » */
  label: string;
  /** true homme, false femme, null inconnu */
  male: boolean | null;
  /** Fonctionne sans réseau (null : inconnu) */
  offline: boolean | null;
  language: string;
};

// Google (Android) : fr-fr-x-fra / frc / vlf = femme, frb / frd = homme ; Samsung : smtm = homme,
// smtf = femme ; navigateurs : prénoms des voix Microsoft / Apple / Google
const MALE = /x-frb|x-frd|smtm|\b(paul|henri|thomas|claude|nicolas|mathieu|remy|rémy|antoine|jerome|jérôme|daniel|yves|guillaume|gilles|jean|alain|male|homme)\b/i;
const FEMALE = /x-fra|x-frc|x-vlf|smtf|\b(julie|hortense|denise|amelie|amélie|audrey|aurelie|aurélie|marie|virginie|celine|céline|lea|léa|eloise|éloïse|vivienne|female|femme)\b|google français/i;

function describe(v: Speech.Voice, index: number): FrenchVoice {
  const key = `${v.identifier} ${v.name}`;
  const male = MALE.test(key) ? true : FEMALE.test(key) ? false : null;
  const offline = /local/i.test(key) ? true : /network/i.test(key) ? false : (v as { localService?: boolean }).localService ?? null;
  // Nom lisible : prénom du navigateur, sinon « Voix 1, 2… » (les identifiants Android sont illisibles)
  const plain = /^[A-Za-zÀ-ÿ' -]+$/.test(v.name) && !/^fr[-_]/i.test(v.name) ? v.name.replace(/^Microsoft |^Google /, '').split(' - ')[0] : `Voix ${index + 1}`;
  const parts = [plain, male === true ? 'homme' : male === false ? 'femme' : null, offline === true ? 'hors ligne' : offline === false ? 'en ligne' : null];
  return { id: v.identifier, label: parts.filter(Boolean).join(' · '), male, offline, language: v.language };
}

let voicesPromise: Promise<FrenchVoice[]> | null = null;
let autoVoiceId: string | null = null;

/** Voix françaises du téléphone (fr-FR d'abord), chargées une fois */
export function listFrenchVoices(): Promise<FrenchVoice[]> {
  if (!voicesPromise) {
    voicesPromise = (async () => {
      let all = await Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[]);
      // Android : le moteur de synthèse peut ne pas être prêt au tout premier appel
      if (!all.length) {
        await new Promise((r) => setTimeout(r, 1500));
        all = await Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[]);
      }
      const fr = all
        .filter((v) => /^fr([-_]|$)/i.test(v.language))
        .sort((a, b) => Number(/^fr[-_]fr/i.test(b.language)) - Number(/^fr[-_]fr/i.test(a.language)) || a.identifier.localeCompare(b.identifier));
      const list = fr.map(describe);
      autoVoiceId = pickDefaultVoice(list)?.id ?? null;
      if (!list.length) voicesPromise = null; // nouvel essai au prochain appel
      return list;
    })();
  }
  return voicesPromise;
}

/** Voix par défaut : homme fr-FR hors ligne, puis homme fr-FR, puis fr-FR hors ligne, fr-FR, autre français */
export function pickDefaultVoice(list: FrenchVoice[]): FrenchVoice | null {
  const frFR = (v: FrenchVoice) => /^fr[-_]fr/i.test(v.language);
  return (
    list.find((v) => frFR(v) && v.male === true && v.offline !== false) ??
    list.find((v) => frFR(v) && v.male === true) ??
    list.find((v) => frFR(v) && v.offline !== false) ??
    list.find(frFR) ??
    list[0] ??
    null
  );
}

// Chargée dès le démarrage du module : la première annonce a déjà sa voix
listFrenchVoices().catch(() => {});

function say(text: string, urgent: boolean, voiceId?: string | null) {
  if (urgent) Speech.stop();
  const voice = voiceId ?? settings.voiceId ?? autoVoiceId;
  Speech.speak(text, {
    language: 'fr-FR',
    ...(voice ? { voice } : {}),
    pitch: PITCH,
    rate: VOICE_RATES.find((r) => r.value === settings.rate)!.rate,
    volume: VOICE_VOLUMES.find((v) => v.value === settings.volume)!.volume,
  });
}

/** Bouton « Écouter » d'une voix de la liste */
export function previewVoice(voiceId: string | null) {
  say('Dans 200 mètres, tourne à droite. Au rond-point, prends la deuxième sortie.', true, voiceId ?? autoVoiceId);
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
  say('Attention, gravillons signalés dans 400 mètres. Dans 200 mètres, tourne à droite.', true);
}

/** Alerte de sécurité (chute détectée…) : lue même en muet, au débit et au volume choisis. */
export function speakAlarm(text: string) {
  say(text, true);
}
