import { useEffect, useMemo, useRef, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import { ANNOUNCE_MAX_M, ANNOUNCE_MIN_M, findSharpCurves, SERIES_M } from '@/lib/curves';
import type { NavRoute } from '@/lib/navigation';
import { poisAlongRoute, spotsAlongRoute, type RoutePoi } from '@/lib/pois';
import { sunTimes } from '@/lib/sun';
import { speak } from '@/lib/voice';

// Alertes moto pendant la navigation (voix courte + bandeau, jamais de fenêtre à valider en
// roulant) : virage serré à venir, coucher du soleil / nuit pendant le trajet, rappel de pause.
// Tout est calculé sur le téléphone. Aucune référence à la vitesse.

// ---------- Virages serrés (géométrie de l'itinéraire) ----------

/** Prochain virage serré à moins de 300 m (bandeau) ; annonce vocale vers 200 m, une fois */
export function useCurveAlerts(active: boolean, route: NavRoute | null, alongM: number | null) {
  const curves = useMemo(() => (active && route ? findSharpCurves(route) : []), [active, route]);
  const announced = useRef(new Set<number>());
  // Dernier virage annoncé dans une série : les suivants de la série ne sont pas répétés
  const seriesUntil = useRef(-1);

  useEffect(() => {
    announced.current = new Set();
    seriesUntil.current = -1;
  }, [route]);

  const next = alongM === null ? null : (curves.find((c) => c.alongM > alongM) ?? null);
  const distance = next && alongM !== null ? next.alongM - alongM : null;

  useEffect(() => {
    if (!next || distance === null || announced.current.has(next.alongM)) return;
    if (distance < ANNOUNCE_MIN_M || distance > ANNOUNCE_MAX_M) return;
    announced.current.add(next.alongM);
    if (next.alongM <= seriesUntil.current) return;
    const side = next.side === 'left' ? 'à gauche' : 'à droite';
    if (next.series) {
      // Fin de la série : dernier virage à moins de SERIES_M du précédent
      let end = next.alongM;
      for (const c of curves) if (c.alongM > end && c.alongM - end < SERIES_M) end = c.alongM;
      seriesUntil.current = end;
      speak(`Série de virages serrés dans 200 mètres, le premier ${side}`, false, 'guidance');
    } else {
      speak(`Virage serré ${side} dans 200 mètres`, false, 'guidance');
    }
  }, [next, distance, curves]);

  if (!next || distance === null || distance > 300) return null;
  return { text: `${next.series ? 'Série de virages serrés' : `Virage serré ${next.side === 'left' ? 'à gauche' : 'à droite'}`} dans ${Math.round(distance / 10) * 10} m`, side: next.side };
}

// ---------- Coucher du soleil / nuit pendant le trajet ----------

const clock = (d: Date) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Bandeau : « Coucher du soleil à 19h02 » dans les 30 dernières minutes avant, et « La nuit
 * tombera avant ton arrivée » au départ si l'arrivée prévue est après le coucher.
 */
export function useSunAlerts(active: boolean, position: LatLng | null, remainingS: number | null) {
  const [now, setNow] = useState(() => Date.now());
  const said = useRef({ night: false, sunset: false });

  useEffect(() => {
    if (!active) {
      said.current = { night: false, sunset: false };
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);

  const lat = position ? Math.round(position.latitude * 10) / 10 : null;
  const lng = position ? Math.round(position.longitude * 10) / 10 : null;
  const sunset = useMemo(() => {
    if (lat === null || lng === null) return null;
    const t = sunTimes(new Date(now), lat, lng);
    return t.kind === 'normal' ? t.sunset : null;
  }, [now, lat, lng]);

  const minutesToSunset = sunset ? (sunset.getTime() - now) / 60_000 : null;
  const nightBeforeArrival = minutesToSunset !== null && minutesToSunset > 0 && remainingS !== null && remainingS / 60 > minutesToSunset;

  useEffect(() => {
    if (!active || minutesToSunset === null || !sunset) return;
    if (nightBeforeArrival && !said.current.night) {
      said.current.night = true;
      speak(`La nuit tombera avant ton arrivée, coucher du soleil à ${clock(sunset).replace('h', ' heures ')}`, false, 'info');
    } else if (minutesToSunset > 0 && minutesToSunset <= 30 && !said.current.sunset) {
      said.current.sunset = true;
      speak(`Coucher du soleil dans ${Math.max(5, Math.round(minutesToSunset / 5) * 5)} minutes. Pense à être bien visible`, false, 'info');
    }
  }, [active, minutesToSunset, nightBeforeArrival, sunset]);

  if (!active || !sunset || minutesToSunset === null) return null;
  if (minutesToSunset <= 0 && minutesToSunset > -60) return { text: `Soleil couché à ${clock(sunset)} · allume et sois visible` };
  if (minutesToSunset > 0 && minutesToSunset <= 30) return { text: `Coucher du soleil à ${clock(sunset)}` };
  if (nightBeforeArrival) return { text: `Nuit avant l’arrivée · coucher du soleil à ${clock(sunset)}` };
  return null;
}

// ---------- Rappel de pause ----------

/** Un arrêt de 10 min remet le compteur à zéro */
const REST_RESETS_S = 10 * 60;
const MOVING_KMH = 5;
/** Spot proposé : à moins de ~10 min de route (12 km) et à moins d'1 km du tracé */
const BREAK_LOOKAHEAD_M = 12_000;

export type BreakReminder = { suggestion: RoutePoi | null; searching: boolean };

/**
 * Rappel de pause après `intervalMin` minutes de route (temps en mouvement, remis à zéro par un
 * arrêt de 10 min). Annonce vocale courte + bandeau ; spot café / point de vue sur la route,
 * sinon un café OpenStreetMap. L'ajout en étape se fait à l'arrêt (bandeau).
 */
export function useBreakReminder({
  active,
  kmh,
  intervalMin,
  route,
  alongM,
  spots,
}: {
  active: boolean;
  kmh: number;
  intervalMin: number;
  route: NavRoute | null;
  alongM: number | null;
  spots: (LatLng & { label: string })[];
}) {
  const [reminder, setReminder] = useState<BreakReminder | null>(null);
  const ridingS = useRef(0);
  const stoppedS = useRef(0);
  const last = useRef<number | null>(null);
  const inputs = useRef({ kmh, route, alongM, spots });
  useEffect(() => {
    inputs.current = { kmh, route, alongM, spots };
  });

  useEffect(() => {
    if (!active || intervalMin <= 0) {
      ridingS.current = 0;
      stoppedS.current = 0;
      last.current = null;
      const t = setTimeout(() => setReminder(null), 0);
      return () => clearTimeout(t);
    }
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      if (inputs.current.kmh > MOVING_KMH) {
        ridingS.current += dt;
        stoppedS.current = 0;
      } else {
        stoppedS.current += dt;
        if (stoppedS.current >= REST_RESETS_S) {
          ridingS.current = 0;
          setReminder(null);
        }
      }
      if (ridingS.current < intervalMin * 60) return;
      ridingS.current = 0;
      const h = Math.floor(intervalMin / 60);
      const m = intervalMin % 60;
      const duration = h ? `${h} heure${h > 1 ? 's' : ''}${m ? ` ${m}` : ''}` : `${m} minutes`;
      speak(`Ça fait ${duration} de route. Pense à faire une pause`, false, 'info');
      const { route: r, alongM: from, spots: community } = inputs.current;
      if (!r || from === null) {
        setReminder({ suggestion: null, searching: false });
        return;
      }
      const nearby = spotsAlongRoute(r, community, from, BREAK_LOOKAHEAD_M);
      if (nearby.length) {
        setReminder({ suggestion: nearby[0], searching: false });
        return;
      }
      setReminder({ suggestion: null, searching: true });
      poisAlongRoute(r, 'cafe', from)
        .then((cafes) => setReminder({ suggestion: cafes.find((c) => c.aheadM <= BREAK_LOOKAHEAD_M) ?? null, searching: false }))
        .catch(() => setReminder({ suggestion: null, searching: false }));
    }, 5000);
    return () => clearInterval(timer);
  }, [active, intervalMin]);

  return { reminder, dismiss: () => setReminder(null) };
}

