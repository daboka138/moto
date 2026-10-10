import { useEffect, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';

// Météo sur le trajet (API Open-Meteo, gratuite, sans clé) : quelques points répartis le long
// de l'itinéraire, chacun à son heure de passage estimée (départ + part de la durée).

export type WeatherSample = LatLng & {
  /** Distance depuis le départ (m) */
  alongM: number;
  /** Heure de passage estimée */
  at: Date;
  /** null : trop loin dans le futur pour les prévisions (16 jours) */
  forecast: {
    tempC: number;
    precipMm: number;
    precipProb: number | null;
    windKmh: number;
    gustKmh: number;
    code: number;
  } | null;
};

export type RouteWeather = {
  samples: WeatherSample[];
  /** Alertes à afficher avant de partir (pluie, vent fort, froid…) */
  alerts: string[];
  /** Les prévisions ne couvrent pas encore la date (balade dans plus de 16 jours) */
  tooFar: boolean;
};

const API = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 12_000;
const MAX_SAMPLES = 8;
const MIN_SPACING_M = 15_000;
const CACHE_MS = 15 * 60_000;

/** Maintenant, arrondi aux 10 minutes (la météo n'est pas recalculée à chaque affichage) */
export function roundedNow() {
  return new Date(Math.floor(Date.now() / 600_000) * 600_000);
}

/** Codes météo WMO → pictogramme et libellé */
export function weatherInfo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Ensoleillé' };
  if (code <= 2) return { emoji: '🌤️', label: 'Éclaircies' };
  if (code === 3) return { emoji: '☁️', label: 'Couvert' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Brouillard' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', label: 'Bruine' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧️', label: 'Pluie' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '🌨️', label: 'Neige' };
  if (code >= 95) return { emoji: '⛈️', label: 'Orage' };
  return { emoji: '🌥️', label: 'Nuageux' };
}

/** Points du tracé répartis régulièrement (départ et arrivée compris) */
function sampleRoute(points: LatLng[]): { point: LatLng; alongM: number }[] {
  if (points.length === 0) return [];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distanceM(points[i - 1], points[i]));
  const total = cumulative[cumulative.length - 1];
  const count = Math.max(2, Math.min(MAX_SAMPLES, Math.floor(total / MIN_SPACING_M) + 1));
  const out: { point: LatLng; alongM: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? 0 : (total * k) / (count - 1);
    while (j < points.length - 1 && cumulative[j] < target) j++;
    out.push({ point: points[j], alongM: cumulative[j] });
  }
  return out;
}

type ApiHourly = {
  time: number[];
  temperature_2m: number[];
  precipitation: number[];
  precipitation_probability: (number | null)[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
  weather_code: number[];
};

const cache = new Map<string, { at: number; value: RouteWeather }>();

/**
 * Prévisions le long d'un itinéraire, à l'heure de passage.
 * departAt : heure de départ ; durationS : durée totale estimée du trajet.
 */
export async function fetchRouteWeather(points: LatLng[], durationS: number, departAt: Date): Promise<RouteWeather> {
  const samples = sampleRoute(points);
  if (!samples.length) return { samples: [], alerts: [], tooFar: false };
  const totalM = samples[samples.length - 1].alongM || 1;
  const key = JSON.stringify([
    samples.map((s) => [s.point.latitude.toFixed(2), s.point.longitude.toFixed(2)]),
    Math.round(durationS / 600),
    Math.round(departAt.getTime() / 1800_000),
  ]);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const url =
    `${API}?latitude=${samples.map((s) => s.point.latitude.toFixed(4)).join(',')}` +
    `&longitude=${samples.map((s) => s.point.longitude.toFixed(4)).join(',')}` +
    '&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,weather_code' +
    '&timeformat=unixtime&timezone=GMT&forecast_days=16&wind_speed_unit=kmh';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let json: unknown;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  // Un seul point : objet ; plusieurs : tableau
  const locations = (Array.isArray(json) ? json : [json]) as { hourly?: ApiHourly }[];

  const result: WeatherSample[] = samples.map((s, i) => {
    const at = new Date(departAt.getTime() + durationS * 1000 * (s.alongM / totalM));
    const h = locations[i]?.hourly;
    const t = at.getTime() / 1000;
    let idx = -1;
    if (h?.time.length) {
      // Heure de prévision la plus proche (à moins d'1 h 30)
      let best = Infinity;
      h.time.forEach((x, k) => {
        const d = Math.abs(x - t);
        if (d < best) {
          best = d;
          idx = k;
        }
      });
      if (best > 5400) idx = -1;
    }
    return {
      ...s.point,
      alongM: s.alongM,
      at,
      forecast:
        h && idx >= 0
          ? {
              tempC: h.temperature_2m[idx],
              precipMm: h.precipitation[idx] ?? 0,
              precipProb: h.precipitation_probability[idx] ?? null,
              windKmh: h.wind_speed_10m[idx],
              gustKmh: h.wind_gusts_10m[idx],
              code: h.weather_code[idx],
            }
          : null,
    };
  });
  const value: RouteWeather = {
    samples: result,
    alerts: weatherAlerts(result),
    tooFar: result.every((s) => !s.forecast),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Ce qui mérite une alerte avant de partir à moto */
export function weatherAlerts(samples: WeatherSample[]): string[] {
  const f = samples.map((s) => s.forecast).filter((x): x is NonNullable<WeatherSample['forecast']> => !!x);
  if (!f.length) return [];
  const alerts: string[] = [];
  if (f.some((x) => x.code >= 95)) alerts.push('Orages prévus sur le trajet');
  const rain = f.filter((x) => x.precipMm >= 0.5 || ((x.precipProb ?? 0) >= 60 && x.precipMm > 0));
  if (rain.length) {
    const max = Math.max(...rain.map((x) => x.precipProb ?? 0));
    alerts.push(`Pluie prévue sur le trajet${max ? ` (jusqu’à ${max} %)` : ''}`);
  }
  if (f.some((x) => (x.code >= 71 && x.code <= 77) || x.code === 85 || x.code === 86)) alerts.push('Neige possible');
  const gust = Math.max(...f.map((x) => x.gustKmh));
  if (gust >= 60) alerts.push(`Vent fort : rafales jusqu’à ${Math.round(gust)} km/h`);
  const cold = Math.min(...f.map((x) => x.tempC));
  if (cold <= 3) alerts.push(`Froid : ${Math.round(cold)} °C, verglas possible`);
  if (f.some((x) => x.code === 45 || x.code === 48)) alerts.push('Brouillard');
  return alerts;
}

/** Phrase courte pour l'annonce vocale au départ */
export function spokenWeatherAlert(w: RouteWeather | null) {
  if (!w || !w.alerts.length) return null;
  return `Attention météo : ${w.alerts.slice(0, 2).join('. ').replace(/’/g, "'").replace(/ %/g, ' pour cent')}`;
}

/** Météo d'un tracé, recalculée quand le tracé ou l'heure de départ change. */
export function useRouteWeather(points: LatLng[] | null, durationS: number | null, departAt: Date | null) {
  const [state, setState] = useState<{ key: string; weather: RouteWeather | null; error: boolean } | null>(null);
  const key =
    points && points.length >= 2 && durationS !== null && departAt
      ? `${points.length}:${points[0].latitude},${points[0].longitude}:${points[points.length - 1].latitude}:${Math.round(durationS)}:${Math.round(departAt.getTime() / 600_000)}`
      : null;

  useEffect(() => {
    if (!key || !points || durationS === null || !departAt) return;
    let cancelled = false;
    fetchRouteWeather(points, durationS, departAt)
      .then((weather) => !cancelled && setState({ key, weather, error: false }))
      .catch((e) => {
        console.warn('Météo indisponible', e);
        if (!cancelled) setState({ key, weather: null, error: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state && state.key === key ? state : null;
  return { weather: current?.weather ?? null, loading: !!key && !current, error: current?.error ?? false };
}
