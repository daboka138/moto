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
  /** Annonce en entrant dans une zone de danger (points noirs) */
  dangerZones: boolean;
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
  dangerZones: true,
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
// Voix « réseau » (Android : …-network) ou pas encore téléchargées : elles peuvent ne rien dire.
// Une voix qui échoue est mémorisée (moto.voice.bad) : plus jamais choisie automatiquement, et le
// guidage repasse aussitôt sur la voix par défaut (jamais de navigation sans voix).

export type FrenchVoice = {
  id: string;
  /** « Voix 1 – homme », « Paul – homme », « Voix réseau 2 – femme » */
  label: string;
  /** true homme, false femme, null inconnu */
  male: boolean | null;
  /** Fonctionne sans réseau (null : inconnu) */
  offline: boolean | null;
  /** Voix réseau : peut demander un téléchargement ou une connexion */
  network: boolean;
  /** A déjà échoué sur ce téléphone */
  failed: boolean;
  language: string;
  /** « France », « Canada »… */
  region: string;
};

// Google (Android) : fr-fr-x-fra / frc / vlf = femme, frb / frd = homme ; Samsung : smtm = homme,
// smtf = femme ; navigateurs : prénoms des voix Microsoft / Apple / Google
const MALE = /x-frb|x-frd|smtm|\b(paul|henri|thomas|claude|nicolas|mathieu|remy|rémy|antoine|jerome|jérôme|daniel|yves|guillaume|gilles|jean|alain|male|homme)\b/i;
const FEMALE = /x-fra|x-frc|x-vlf|smtf|\b(julie|hortense|denise|amelie|amélie|audrey|aurelie|aurélie|marie|virginie|celine|céline|lea|léa|eloise|éloïse|vivienne|female|femme)\b|google français/i;
const REGIONS: Record<string, string> = { FR: 'France', CA: 'Canada', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg' };

const BAD_KEY = 'moto.voice.bad';
const badVoices = new Set<string>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(BAD_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
);
const voiceListeners = new Set<() => void>();

function setVoiceBad(id: string, bad: boolean) {
  if (badVoices.has(id) === bad) return;
  if (bad) badVoices.add(id);
  else badVoices.delete(id);
  try {
    localStorage.setItem(BAD_KEY, JSON.stringify([...badVoices]));
  } catch {
    // pas grave : mémorisé pour cette session
  }
  if (rawVoices) autoVoiceId = pickDefaultVoice(rawVoices.map(describeAll(rawVoices)))?.id ?? null;
  voiceListeners.forEach((l) => l());
}

/** La liste des voix change (une voix vient d'échouer ou de remarcher) */
export function onVoicesChange(listener: () => void) {
  voiceListeners.add(listener);
  return () => {
    voiceListeners.delete(listener);
  };
}

function isNetwork(v: Speech.Voice) {
  return /network/i.test(`${v.identifier} ${v.name}`) || (v as { localService?: boolean }).localService === false;
}

/** Numérotation par groupe (voix du téléphone / voix réseau), stable même si une voix échoue */
function describeAll(all: Speech.Voice[]) {
  const counters = { local: 0, network: 0 };
  const numbers = new Map<string, number>();
  for (const v of all) numbers.set(v.identifier, ++counters[isNetwork(v) ? 'network' : 'local']);
  return (v: Speech.Voice): FrenchVoice => describe(v, numbers.get(v.identifier) ?? 1);
}

function describe(v: Speech.Voice, n: number): FrenchVoice {
  const key = `${v.identifier} ${v.name}`;
  const network = isNetwork(v);
  const male = MALE.test(key) ? true : FEMALE.test(key) ? false : null;
  const offline = network ? false : /local/i.test(key) ? true : ((v as { localService?: boolean }).localService ?? null);
  // Nom lisible : prénom du navigateur, sinon « Voix 1, 2… » (les identifiants Android sont illisibles)
  const named = /^[A-Za-zÀ-ÿ' -]+$/.test(v.name) && !/^fr[-_]/i.test(v.name) && !/\b(local|network|language)\b/i.test(v.name);
  const base = named
    ? v.name.replace(/^Microsoft |^Google /, '').split(' - ')[0]
    : /-language$/i.test(v.identifier)
      ? 'Voix standard'
      : `${network ? 'Voix réseau' : 'Voix'} ${n}`;
  const gender = male === true ? 'homme' : male === false ? 'femme' : null;
  const country = v.language.split(/[-_]/)[1]?.toUpperCase() ?? '';
  return {
    id: v.identifier,
    label: gender ? `${base} – ${gender}` : base,
    male,
    offline,
    network,
    failed: badVoices.has(v.identifier),
    language: v.language,
    region: REGIONS[country] ?? (country || 'Français'),
  };
}

let voicesPromise: Promise<Speech.Voice[]> | null = null;
let rawVoices: Speech.Voice[] | null = null;
let autoVoiceId: string | null = null;

/** Voix françaises du téléphone (fr-FR d'abord, voix du téléphone avant les voix réseau), chargées une fois */
export async function listFrenchVoices(): Promise<FrenchVoice[]> {
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
        .sort(
          (a, b) =>
            Number(/^fr[-_]fr/i.test(b.language)) - Number(/^fr[-_]fr/i.test(a.language)) ||
            Number(isNetwork(a)) - Number(isNetwork(b)) ||
            a.identifier.localeCompare(b.identifier),
        );
      rawVoices = fr;
      autoVoiceId = pickDefaultVoice(fr.map(describeAll(fr)))?.id ?? null;
      if (!fr.length) voicesPromise = null; // nouvel essai au prochain appel
      return fr;
    })();
  }
  const raw = await voicesPromise;
  return raw.map(describeAll(raw));
}

/** Voix par défaut, jamais une voix réseau ni une voix qui a échoué : homme fr-FR, puis fr-FR, puis autre français */
export function pickDefaultVoice(list: FrenchVoice[]): FrenchVoice | null {
  const ok = list.filter((v) => !v.network && !v.failed);
  const frFR = (v: FrenchVoice) => /^fr[-_]fr/i.test(v.language);
  return (
    ok.find((v) => frFR(v) && v.male === true && v.offline === true) ??
    ok.find((v) => frFR(v) && v.male === true) ??
    ok.find((v) => frFR(v) && v.offline === true) ??
    ok.find(frFR) ??
    ok[0] ??
    null
  );
}

// Chargée dès le démarrage du module : la première annonce a déjà sa voix
listFrenchVoices().catch(() => {});

/** Sans début de lecture au bout de 4 s (et rien d'autre en cours), la voix est considérée en panne */
const START_TIMEOUT_MS = 4000;
const MAX_WAIT_MS = 20_000;

/**
 * Lit le texte avec cette voix ; done(true) dès que la lecture commence, done(false) si la voix échoue
 * (erreur du moteur, ou rien au bout de quelques secondes : voix pas installée, réseau absent…).
 */
function utter(text: string, voice: string | null, done: (started: boolean) => void) {
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  const settle = (started: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    done(started);
  };
  const t0 = Date.now();
  const check = () => {
    Speech.isSpeakingAsync()
      .catch(() => false)
      .then((speaking) => {
        if (settled) return;
        // Une autre annonce est en cours (file d'attente) : on attend encore un peu
        if (speaking && Date.now() - t0 < MAX_WAIT_MS) timer = setTimeout(check, 2000);
        else {
          if (speaking) Speech.stop(); // voix bloquée (téléchargement…) : on la coupe
          settle(false);
        }
      });
  };
  // Minuteur lancé une fois le moteur prêt (au démarrage, son initialisation peut prendre quelques secondes)
  (voicesPromise ?? Promise.resolve()).finally(() => {
    if (!settled) timer = setTimeout(check, START_TIMEOUT_MS);
  });
  Speech.speak(text, {
    language: 'fr-FR',
    ...(voice ? { voice } : {}),
    pitch: PITCH,
    rate: VOICE_RATES.find((r) => r.value === settings.rate)!.rate,
    volume: VOICE_VOLUMES.find((v) => v.value === settings.volume)!.volume,
    onStart: () => settle(true),
    onDone: () => settle(true),
    onStopped: () => settle(true),
    onError: () => settle(false),
  });
}

/** Voix réellement utilisée : la voix choisie, sauf si elle a déjà échoué (alors la voix par défaut) */
function effectiveVoice() {
  const chosen = settings.voiceId;
  return chosen && !badVoices.has(chosen) ? chosen : autoVoiceId;
}

function say(text: string, urgent: boolean) {
  if (urgent) Speech.stop();
  const voice = effectiveVoice();
  utter(text, voice, (started) => {
    if (started || !voice) return;
    // La voix ne marche pas : mémorisée, et la phrase est relue tout de suite avec la voix par défaut
    setVoiceBad(voice, true);
    const fallback = autoVoiceId && autoVoiceId !== voice ? autoVoiceId : null;
    utter(text, fallback, (ok) => {
      if (ok || !fallback) return;
      setVoiceBad(fallback, true);
      utter(text, null, () => {});
    });
  });
}

/**
 * Bouton « Écouter » (ou choix d'une voix) : lit la phrase d'exemple avec cette voix, sans repli.
 * Résout true si la voix parle, false si elle n'est pas utilisable (alors mémorisée comme en panne).
 */
export function previewVoice(voiceId: string | null): Promise<boolean> {
  Speech.stop();
  const voice = voiceId ?? autoVoiceId;
  return new Promise((resolve) =>
    utter('Dans 200 mètres, tourne à droite. Au rond-point, prends la deuxième sortie.', voice, (started) => {
      if (voice) setVoiceBad(voice, !started);
      resolve(started);
    }),
  );
}

/** Voix déjà en échec sur ce téléphone (le guidage utilise la voix par défaut à la place) */
export function isVoiceBad(voiceId: string | null) {
  return !!voiceId && badVoices.has(voiceId);
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
