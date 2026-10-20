import { useEffect, useRef, useState } from 'react';

import { distanceM, type LatLng } from '@/lib/geo';
import { speak } from '@/lib/voice';
import { useCanUse } from '@/lib/features';
import { supabase } from '@/lib/supabase';

// Météo sur le trajet : prévisions MET Norway (Locationforecast, licences NLOD 2.0 / CC BY 4.0,
// usage commercial gratuit), demandées à NOTRE serveur (Edge Function `weather`, cache par case de
// ~10 km) : l'app n'appelle jamais api.met.no. Un point tous les ~20 km, chacun à son heure de
// passage estimée (départ + part de la durée). Résumé gratuit pour tous ; détail heure par heure =
// fonction weather_detail (canUse).

export const WEATHER_CREDIT = 'Météo : MET Norway (CC BY 4.0)';

export type Forecast = {
  tempC: number;
  /** mm par heure (moyenne sur le pas de la prévision) */
  precipMm: number;
  windKmh: number;
  /** Rafales : données par MET quand le modèle les a, sinon estimées (vent × 1,5) */
  gustKmh: number;
  gustEstimated: boolean;
  /** Symbole MET (« rain », « partlycloudy_day »…) */
  symbol: string;
};

export type WeatherSample = LatLng & {
  /** Distance depuis le départ (m) */
  alongM: number;
  /** Heure de passage estimée */
  at: Date;
  /** null : trop loin dans le futur pour les prévisions (~9 jours) */
  forecast: Forecast | null;
};

export type RouteWeather = {
  samples: WeatherSample[];
  /** Alertes à afficher avant de partir (pluie, vent fort, froid…) */
  alerts: string[];
  /** Les prévisions ne couvrent pas encore la date (balade dans plus de ~9 jours) */
  tooFar: boolean;
};

/** Ligne compacte renvoyée par le serveur : [heure unix, °C, mm/h, vent, rafales | null, symbole, pas (h)] */
type Row = [number, number, number, number, number | null, string, number];

const MAX_SAMPLES = 15;
const SAMPLE_EVERY_M = 20_000;
const CACHE_MS = 15 * 60_000;
/** Seuils des alertes (mêmes valeurs dans supabase/functions/ride-weather) */
const GUST_ALERT_KMH = 50;
const FROST_C = 3;
const HEAT_C = 33;
const RAIN_MM = 0.5;

/** Maintenant, arrondi aux 10 minutes (la météo n'est pas recalculée à chaque affichage) */
export function roundedNow() {
  return new Date(Math.floor(Date.now() / 600_000) * 600_000);
}

const base = (symbol: string) => symbol.replace(/_(day|night|polartwilight)$/, '');
const isStorm = (f: Forecast) => f.symbol.includes('thunder');
const isSnow = (f: Forecast) => /snow|sleet/.test(f.symbol) && f.precipMm >= 0.2;
const isRain = (f: Forecast) => f.precipMm >= RAIN_MM || (/rain|sleet|snow|thunder/.test(f.symbol) && f.precipMm >= 0.2);
const isFog = (f: Forecast) => base(f.symbol) === 'fog';

/** Symboles MET → pictogramme et libellé */
export function weatherInfo(symbol: string): { emoji: string; label: string } {
  const s = base(symbol);
  const night = symbol.endsWith('_night');
  if (s === 'clearsky') return { emoji: night ? '🌙' : '☀️', label: 'Ciel dégagé' };
  if (s === 'fair') return { emoji: night ? '🌙' : '🌤️', label: 'Beau temps' };
  if (s === 'partlycloudy') return { emoji: '⛅', label: 'Éclaircies' };
  if (s === 'cloudy') return { emoji: '☁️', label: 'Couvert' };
  if (s === 'fog') return { emoji: '🌫️', label: 'Brouillard' };
  if (s.includes('thunder')) return { emoji: '⛈️', label: 'Orage' };
  if (s.includes('snow')) return { emoji: '🌨️', label: 'Neige' };
  if (s.includes('sleet')) return { emoji: '🌨️', label: 'Pluie et neige' };
  if (s.includes('showers')) return { emoji: '🌦️', label: 'Averses' };
  if (s.includes('rain')) return { emoji: '🌧️', label: s.startsWith('light') ? 'Pluie faible' : s.startsWith('heavy') ? 'Forte pluie' : 'Pluie' };
  return { emoji: '🌥️', label: 'Nuageux' };
}

function toForecast(r: Row): Forecast {
  return {
    tempC: r[1],
    precipMm: r[2],
    windKmh: r[3],
    gustKmh: r[4] ?? Math.round(r[3] * 1.5),
    gustEstimated: r[4] === null,
    symbol: r[5],
  };
}

/** Prévision la plus proche de cette heure (dans le pas de la prévision), sinon null */
function rowAt(rows: Row[] | undefined, t: number): Row | null {
  if (!rows?.length) return null;
  let best: Row | null = null;
  let bestD = Infinity;
  for (const r of rows) {
    const d = Math.abs(r[0] + (r[6] * 3600) / 2 - t);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best && bestD <= best[6] * 1800 + 3600 ? best : null;
}

/** Points du tracé tous les ~20 km (départ et arrivée compris) */
function sampleRoute(points: LatLng[]): { point: LatLng; alongM: number }[] {
  if (points.length === 0) return [];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distanceM(points[i - 1], points[i]));
  const total = cumulative[cumulative.length - 1];
  const count = Math.max(2, Math.min(MAX_SAMPLES, Math.floor(total / SAMPLE_EVERY_M) + 1));
  const out: { point: LatLng; alongM: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? 0 : (total * k) / (count - 1);
    while (j < points.length - 1 && cumulative[j] < target) j++;
    out.push({ point: points[j], alongM: cumulative[j] });
  }
  return out;
}

/** Prévisions brutes de ces points (une série par point), via notre serveur */
async function fetchRows(points: LatLng[]): Promise<(Row[] | undefined)[]> {
  const { data, error } = await supabase.functions.invoke<{ keys: string[]; cells: Record<string, Row[]>; error?: string }>('weather', {
    body: { points: points.map((p) => [Math.round(p.latitude * 1e4) / 1e4, Math.round(p.longitude * 1e4) / 1e4]) },
  });
  if (error || !data?.keys) throw new Error(data?.error ?? error?.message ?? 'Météo indisponible');
  return data.keys.map((k) => data.cells[k]);
}

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

  const rows = await fetchRows(samples.map((s) => s.point));
  const result: WeatherSample[] = samples.map((s, i) => {
    const at = new Date(departAt.getTime() + durationS * 1000 * (s.alongM / totalM));
    const row = rowAt(rows[i], at.getTime() / 1000);
    return { ...s.point, alongM: s.alongM, at, forecast: row ? toForecast(row) : null };
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
  const f = samples.map((s) => s.forecast).filter((x): x is Forecast => !!x);
  if (!f.length) return [];
  const alerts: string[] = [];
  if (f.some(isStorm)) alerts.push('Orages prévus sur le trajet');
  if (f.some(isSnow)) alerts.push('Neige possible');
  else if (f.some(isRain)) alerts.push('Pluie prévue sur le trajet');
  const gust = f.reduce((m, x) => (x.gustKmh > m.gustKmh ? x : m));
  if (gust.gustKmh >= GUST_ALERT_KMH) alerts.push(`Vent fort : rafales ${gust.gustEstimated ? 'estimées à' : 'jusqu’à'} ${Math.round(gust.gustKmh)} km/h`);
  const cold = Math.min(...f.map((x) => x.tempC));
  if (cold <= FROST_C) alerts.push(`Risque de gel : ${Math.round(cold)} °C, verglas possible`);
  const hot = Math.max(...f.map((x) => x.tempC));
  if (hot >= HEAT_C) alerts.push(`Forte chaleur : jusqu’à ${Math.round(hot)} °C, hydrate-toi`);
  if (f.some(isFog)) alerts.push('Brouillard');
  return alerts;
}

const hourLabel = (d: Date) => `${d.getHours()}h${d.getMinutes() >= 30 ? '30' : ''}`;

/** Nom de la commune la plus proche (Photon, position arrondie ~1 km), pour le résumé */
async function nearbyTown(p: LatLng): Promise<string | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${p.latitude.toFixed(2)}&lon=${p.longitude.toFixed(2)}&lang=fr&limit=1`);
    const json = (await res.json()) as { features?: { properties?: { city?: string; name?: string } }[] };
    const props = json.features?.[0]?.properties;
    return props?.city ?? props?.name ?? null;
  } catch {
    return null;
  }
}

export type WeatherSummary = { emoji: string; text: string; bad: boolean };

/**
 * Résumé en une ligne : « ☀️ Sec, 18-22 °C » ou « 🌧️ Pluie possible vers Gémenos vers 15h, rafales
 * 60 km/h ». town : commune du premier point mouillé (facultatif, voir useWeatherSummary).
 */
export function weatherSummary(w: RouteWeather | null, town?: string | null): WeatherSummary | null {
  const list = (w?.samples ?? []).filter((s): s is WeatherSample & { forecast: Forecast } => !!s.forecast);
  if (!list.length) return null;
  const temps = list.map((s) => s.forecast.tempC);
  const lo = Math.round(Math.min(...temps));
  const hi = Math.round(Math.max(...temps));
  const range = lo === hi ? `${lo} °C` : `${lo}-${hi} °C`;
  const gust = Math.max(...list.map((s) => s.forecast.gustKmh));
  const wet = list.find((s) => isStorm(s.forecast)) ?? list.find((s) => isSnow(s.forecast)) ?? list.find((s) => isRain(s.forecast));
  const parts: string[] = [];
  let emoji: string;
  if (wet) {
    const kind = isStorm(wet.forecast) ? 'Orage possible' : isSnow(wet.forecast) ? 'Neige possible' : 'Pluie possible';
    emoji = weatherInfo(wet.forecast.symbol).emoji;
    parts.push(`${kind}${town ? ` vers ${town}` : ''} vers ${hourLabel(wet.at)}`);
  } else {
    // Le ciel le plus fréquent sur le trajet
    const counts = new Map<string, number>();
    for (const s of list) counts.set(weatherInfo(s.forecast.symbol).emoji, (counts.get(weatherInfo(s.forecast.symbol).emoji) ?? 0) + 1);
    emoji = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    parts.push(`Sec, ${range}`);
  }
  if (gust >= GUST_ALERT_KMH) parts.push(`rafales ${Math.round(gust / 5) * 5} km/h`);
  if (lo <= FROST_C) parts.push('verglas possible');
  else if (hi >= HEAT_C) parts.push('forte chaleur');
  if (wet) parts.push(range);
  return { emoji, text: parts.join(', '), bad: !!wet || gust >= GUST_ALERT_KMH || lo <= FROST_C || hi >= HEAT_C };
}

/** Résumé d'une météo de trajet, avec le nom de la commune où la pluie est attendue */
export function useWeatherSummary(w: RouteWeather | null): WeatherSummary | null {
  const wet = w?.samples.find((s) => s.forecast && (isStorm(s.forecast) || isSnow(s.forecast) || isRain(s.forecast))) ?? null;
  const wetKey = wet ? `${wet.latitude.toFixed(2)},${wet.longitude.toFixed(2)}` : null;
  const [town, setTown] = useState<{ key: string; name: string | null } | null>(null);
  useEffect(() => {
    if (!wet || !wetKey) return;
    let cancelled = false;
    nearbyTown(wet).then((name) => !cancelled && setTown({ key: wetKey, name }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wetKey]);
  return weatherSummary(w, town && town.key === wetKey ? town.name : null);
}

// ---------- Pendant la navigation : ce qui arrive devant moi ----------

export type WeatherHazard = 'storm' | 'rain' | 'snow' | 'wind' | 'frost' | 'heat' | 'fog';

export type WeatherAhead = {
  hazard: WeatherHazard;
  emoji: string;
  /** « Pluie prévue dans ~40 km » */
  text: string;
  /** Distance jusqu'au point concerné (m), 0 = déjà sur place */
  inM: number;
};

function hazardOf(f: Forecast): { hazard: WeatherHazard; emoji: string; label: string; extra: string } | null {
  if (isStorm(f)) return { hazard: 'storm', emoji: '⛈️', label: 'Orage prévu', extra: '' };
  if (isSnow(f)) return { hazard: 'snow', emoji: '🌨️', label: 'Neige prévue', extra: '' };
  if (isRain(f)) return { hazard: 'rain', emoji: '🌧️', label: 'Pluie prévue', extra: '' };
  if (f.gustKmh >= GUST_ALERT_KMH) return { hazard: 'wind', emoji: '💨', label: 'Vent fort', extra: ` (rafales ${Math.round(f.gustKmh)} km/h)` };
  if (f.tempC <= FROST_C) return { hazard: 'frost', emoji: '🧊', label: 'Risque de gel', extra: ` (${Math.round(f.tempC)} °C)` };
  if (f.tempC >= HEAT_C) return { hazard: 'heat', emoji: '🥵', label: 'Forte chaleur', extra: ` (${Math.round(f.tempC)} °C)` };
  if (isFog(f)) return { hazard: 'fog', emoji: '🌫️', label: 'Brouillard', extra: '' };
  return null;
}

function aboutKm(m: number) {
  const km = m / 1000;
  return km < 10 ? `${Math.max(1, Math.round(km))} km` : `${Math.round(km / 5) * 5} km`;
}

/** Premier phénomène météo à surveiller devant moi sur l'itinéraire (fonction pure) */
export function weatherAhead(weather: RouteWeather | null, alongM: number): WeatherAhead | null {
  if (!weather) return null;
  for (const s of weather.samples) {
    if (s.alongM < alongM - 2000 || !s.forecast) continue;
    const h = hazardOf(s.forecast);
    if (!h) continue;
    const inM = Math.max(0, s.alongM - alongM);
    const text = inM < 3000 ? `${h.label.replace(' prévue', '').replace(' prévu', '')} sur ta route${h.extra}` : `${h.label} dans ~${aboutKm(inM)}${h.extra}`;
    return { hazard: h.hazard, emoji: h.emoji, text, inM };
  }
  return null;
}

/** Nouvelle prévision pendant la navigation toutes les 30 min (le cache évite de rappeler le serveur) */
const NAV_REFRESH_MS = 30 * 60_000;

/**
 * Météo devant moi pendant une navigation : prévisions le long de l'itinéraire (heure de passage
 * estimée), rafraîchies toutes les 30 min ou après un recalcul d'itinéraire. Annonce vocale une
 * fois par phénomène.
 */
export function useNavWeather(input: { points: LatLng[]; durationS: number; distanceM: number } | null, alongM: number | null) {
  const route = useCanUse('route_weather') ? input : null;
  const [state, setState] = useState<{ key: string; weather: RouteWeather } | null>(null);
  const progress = useRef(alongM ?? 0);
  const announced = useRef(new Set<WeatherHazard>());
  const routeKey = route ? `${route.points.length}:${Math.round(route.distanceM)}` : null;

  useEffect(() => {
    progress.current = alongM ?? 0;
  });

  useEffect(() => {
    if (!route || !routeKey) {
      announced.current.clear();
      return;
    }
    let cancelled = false;
    const load = () => {
      // Départ « virtuel » : maintenant moins le temps déjà roulé, pour garder les heures de passage justes
      const doneS = route.durationS * (progress.current / Math.max(route.distanceM, 1));
      const departAt = new Date(Date.now() - doneS * 1000);
      fetchRouteWeather(route.points, route.durationS, new Date(Math.floor(departAt.getTime() / 600_000) * 600_000))
        .then((w) => !cancelled && setState({ key: routeKey, weather: w }))
        .catch((e) => console.warn('Météo de navigation indisponible', e));
    };
    load();
    const timer = setInterval(load, NAV_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const weather = state && state.key === routeKey ? state.weather : null;
  const ahead = route ? weatherAhead(weather, alongM ?? 0) : null;
  const hazard = ahead?.hazard ?? null;
  const spokenText = ahead?.text ?? null;
  useEffect(() => {
    if (!hazard || !spokenText || announced.current.has(hazard)) return;
    announced.current.add(hazard);
    speak(`Météo : ${spokenText.replace('~', 'environ ')}`, false, 'info');
  }, [hazard, spokenText]);
  return ahead;
}

/** Phrase courte pour l'annonce vocale au départ */
export function spokenWeatherAlert(w: RouteWeather | null) {
  if (!w || !w.alerts.length) return null;
  return `Attention météo : ${w.alerts.slice(0, 2).join('. ').replace(/’/g, "'").replace(/ %/g, ' pour cent')}`;
}

/** Météo d'un tracé, recalculée quand le tracé ou l'heure de départ change. */
export function useRouteWeather(input: LatLng[] | null, durationS: number | null, departAt: Date | null) {
  const points = useCanUse('route_weather') ? input : null;
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

// ---------- Météo actuelle (coin de la carte) ----------

export type HourForecast = Forecast & { at: Date };

/** Maintenant + les 12 prochaines heures à cet endroit */
export async function fetchLocalWeather(p: LatLng): Promise<HourForecast[]> {
  const [rows] = await fetchRows([p]);
  const now = Date.now() / 1000;
  const out: HourForecast[] = [];
  for (let h = 0; h <= 12; h++) {
    const t = Math.floor(now / 3600) * 3600 + h * 3600;
    const row = rowAt(rows, t + 1800);
    if (row) out.push({ ...toForecast(row), at: new Date(t * 1000) });
  }
  return out;
}

const LOCAL_REFRESH_MS = 30 * 60_000;

/** Météo de l'endroit (position arrondie ~10 km : on ne recharge qu'en changeant de case ou toutes les 30 min) */
export function useLocalWeather(p: LatLng | null, enabled: boolean) {
  const cell = p && enabled ? `${(Math.round(p.latitude * 10) / 10).toFixed(1)},${(Math.round(p.longitude * 10) / 10).toFixed(1)}` : null;
  const [state, setState] = useState<{ cell: string; hours: HourForecast[] } | null>(null);
  useEffect(() => {
    if (!cell) return;
    let cancelled = false;
    const [lat, lng] = cell.split(',').map(Number);
    const load = () =>
      fetchLocalWeather({ latitude: lat, longitude: lng })
        .then((hours) => !cancelled && setState({ cell, hours }))
        .catch((e) => console.warn('Météo locale indisponible', e));
    load();
    const timer = setInterval(load, LOCAL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cell]);
  return state && state.cell === cell ? state.hours : null;
}
