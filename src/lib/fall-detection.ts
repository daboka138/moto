import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Détection de chute pendant une navigation ou une balade en cours : un choc fort
// (accéléromètre), alors que je roulais, suivi d'une immobilité (GPS à l'arrêt, téléphone
// immobile). L'app affiche alors « Tout va bien ? » avec un compte à rebours.
// Ne fonctionne qu'app ouverte (écran allumé en navigation) : pas de capteur en arrière-plan.

export type FallSensitivity = 'high' | 'normal' | 'low';

export const FALL_SENSITIVITIES: { value: FallSensitivity; label: string; description: string; thresholdG: number }[] = [
  { value: 'high', label: 'Sensible', description: 'Choc à partir de 3,5 g', thresholdG: 3.5 },
  { value: 'normal', label: 'Normal', description: 'Choc à partir de 5 g', thresholdG: 5 },
  { value: 'low', label: 'Peu sensible', description: 'Choc à partir de 7 g', thresholdG: 7 },
];

export type SafetySettings = { fallDetection: boolean; fallSensitivity: FallSensitivity };

const KEY = 'moto.safety';
const DEFAULTS: SafetySettings = { fallDetection: true, fallSensitivity: 'normal' };

function read(): SafetySettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SafetySettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export function updateSafetySettings(patch: Partial<SafetySettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // pas grave : le réglage vaut pour cette session
  }
  listeners.forEach((l) => l());
}

export function useSafetySettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

/** 50 mesures par seconde : un choc dure quelques centièmes de seconde */
const SAMPLE_MS = 20;
/** Délai après le choc avant de juger l'immobilité */
const SETTLE_MS = 8000;
/** Fenêtre d'immobilité examinée (avant la fin du délai) */
const STILL_WINDOW_MS = 4000;
/** Écart-type max de l'accélération pour un téléphone « immobile » (g) */
const STILL_STDDEV_G = 0.25;
/** Arrêté : moins de 5 km/h au GPS */
const STOPPED_KMH = 5;
/** Il faut avoir roulé (≥ 15 km/h dans les 15 s avant le choc) : un téléphone qui tombe à l'arrêt ne compte pas */
const RIDING_KMH = 15;
const RIDING_WINDOW_MS = 15_000;

/**
 * Surveille l'accéléromètre tant que active est vrai.
 * detected passe à true quand une chute probable est détectée ; reset() relance la surveillance.
 */
export function useFallDetection(active: boolean, speedKmh: number) {
  const { fallDetection, fallSensitivity } = useSafetySettings();
  const enabled = active && fallDetection;
  const thresholdG = FALL_SENSITIVITIES.find((s) => s.value === fallSensitivity)!.thresholdG;
  const [detected, setDetected] = useState(false);

  // Vitesses récentes (pour savoir si je roulais avant le choc)
  const speeds = useRef<{ at: number; kmh: number }[]>([]);
  useEffect(() => {
    const now = Date.now();
    speeds.current = [...speeds.current.filter((s) => now - s.at < RIDING_WINDOW_MS + SETTLE_MS), { at: now, kmh: speedKmh }];
  }, [speedKmh]);

  useEffect(() => {
    if (!enabled || detected) return;
    const samples: { at: number; g: number }[] = [];
    let impactAt: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const judge = () => {
      timer = null;
      const at = impactAt!;
      impactAt = null;
      const now = Date.now();
      const recent = speeds.current;
      const wasRiding = recent.some((s) => s.at < at && at - s.at < RIDING_WINDOW_MS && s.kmh >= RIDING_KMH);
      const lastSpeed = recent.at(-1)?.kmh ?? 0;
      const still = samples.filter((s) => now - s.at < STILL_WINDOW_MS).map((s) => s.g);
      const mean = still.reduce((a, b) => a + b, 0) / Math.max(still.length, 1);
      const stddev = Math.sqrt(still.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(still.length, 1));
      if (wasRiding && lastSpeed < STOPPED_KMH && still.length > 20 && stddev < STILL_STDDEV_G) setDetected(true);
    };

    Accelerometer.setUpdateInterval(SAMPLE_MS);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const now = Date.now();
      const g = Math.sqrt(x * x + y * y + z * z);
      samples.push({ at: now, g });
      while (samples.length && now - samples[0].at > STILL_WINDOW_MS + 1000) samples.shift();
      if (g >= thresholdG && impactAt === null) {
        impactAt = now;
        timer = setTimeout(judge, SETTLE_MS);
      }
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, detected, thresholdG]);

  return { detected, reset: () => setDetected(false) };
}
