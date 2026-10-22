import * as Location from 'expo-location';
import { DeviceMotion } from 'expo-sensors';
import { Platform } from 'react-native';

import { headingFromRotation, initialCompass, stepCompass } from '@/lib/compass-filter';

// Boussole en continu pour la carte, SANS passer par l'état React (chaque mesure redessinait tout
// l'écran) : les cartes s'abonnent et envoient la valeur à leur page, qui l'anime image par image.
// Source : orientation du téléphone (expo-sensors DeviceMotion, capteur « rotation vector » fusionné,
// 30 mesures/s ; module déjà dans l'APK) ; expo-location (≈ 5 mesures/s) donne la calibration et la
// déclinaison (nord vrai), et sert de repli sans DeviceMotion. Filtre : lib/compass-filter.ts.

type Listener = (deg: number | null) => void;

const MOTION_INTERVAL_MS = 33;
/** Au plus une valeur envoyée à la carte toutes les 66 ms (≈ 15/s) : la page interpole entre deux */
const EMIT_MS = 66;
const EMIT_MIN_DEG = 0.3;
/** DeviceMotion muet depuis ce temps : repli sur expo-location */
const MOTION_STALE_MS = 500;

const listeners = new Set<Listener>();
let stopFn: (() => void) | null = null;
let state = initialCompass();
let accuracy: number | null = null;
let declination = 0;
let motionAt = 0;
let sent: number | null = null;
let sentAt = 0;
let hasSent = false;

function feed(value: number, tilt: number | null) {
  state = stepCompass(state, { value: (value + declination + 360) % 360, accuracy, tilt, time: Date.now() });
  const v = state.shown;
  const now = Date.now();
  const changed = v === null || sent === null ? v !== sent : Math.abs(((v - sent + 540) % 360) - 180) >= EMIT_MIN_DEG;
  if (!changed && hasSent) return;
  // Apparition / disparition tout de suite ; sinon au plus ~15 valeurs/s
  if (hasSent && v !== null && sent !== null && now - sentAt < EMIT_MS) return;
  sent = v;
  sentAt = now;
  hasSent = true;
  listeners.forEach((l) => l(v));
}

function start() {
  state = initialCompass();
  sent = null;
  hasSent = false;
  let cancelled = false;
  let heading: Location.LocationSubscription | undefined;
  let motion: { remove: () => void } | undefined;
  Location.watchHeadingAsync((h) => {
    accuracy = Platform.OS === 'android' ? h.accuracy : null;
    if (h.trueHeading >= 0 && h.magHeading >= 0) declination = ((h.trueHeading - h.magHeading + 540) % 360) - 180;
    // Repli : pas d'orientation du téléphone
    if (Date.now() - motionAt > MOTION_STALE_MS) {
      const value = h.trueHeading >= 0 ? h.trueHeading - declination : h.magHeading;
      if (value >= 0) feed(value, null);
    }
  })
    .then((s) => (cancelled ? s.remove() : (heading = s)))
    .catch(() => {
      // pas de boussole
    });
  DeviceMotion.isAvailableAsync()
    .then((ok) => {
      if (!ok || cancelled) return;
      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
      motion = DeviceMotion.addListener((m) => {
        if (!m.rotation) return;
        motionAt = Date.now();
        const { value, tilt } = headingFromRotation(m.rotation.alpha, m.rotation.beta);
        feed(value, tilt);
      });
    })
    .catch(() => {
      // pas d'orientation : repli expo-location
    });
  return () => {
    cancelled = true;
    heading?.remove();
    motion?.remove();
    motionAt = 0;
  };
}

/** S'abonner à la boussole lissée (null = peu fiable / absente). Renvoie le désabonnement. */
export function subscribeCompass(listener: Listener): () => void {
  listeners.add(listener);
  if (!stopFn) stopFn = start();
  else if (hasSent) listener(sent);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && stopFn) {
      stopFn();
      stopFn = null;
    }
  };
}
