// Prévisions MET Norway (api.met.no, Locationforecast 2.0 « complete »), licences NLOD 2.0 /
// CC BY 4.0 : usage commercial gratuit, crédit « MET Norway ». Conditions d'utilisation respectées :
// User-Agent identifié, coordonnées arrondies (case de 0,1°), réponse gardée jusqu'à son Expires
// (table weather_cache), If-Modified-Since au renouvellement, peu de requêtes en parallèle.
// Utilisé par les Edge Functions `weather` (app) et `ride-weather` (pg_cron, veille des balades).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const API = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const USER_AGENT = 'PasseRyder/1.0 https://passeryder.fr passeryder@gmail.com';
const PARALLEL = 4;
/** Si MET ne donne pas d'Expires : 30 min */
const DEFAULT_TTL_MS = 30 * 60_000;

/** [heure unix (s), °C, mm/h, vent km/h, rafales km/h ou null, symbole, pas en heures (1 ou 6)] */
export type MetRow = [number, number, number, number, number | null, string, number];

/** Case de 0,1° (~10 km) : « 43.3,5.7 » */
export function cellOf(lat: number, lon: number) {
  const f = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/^-0\.0$/, '0.0');
  return `${f(lat)},${f(lon)}`;
}

type MetEntry = {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number; wind_speed_of_gust?: number } };
    next_1_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary: { symbol_code: string }; details?: { precipitation_amount?: number } };
  };
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Réponse MET → heures compactes (pas d'1 h les 2-3 premiers jours, puis 6 h, jusqu'à ~9 jours) */
export function parseMet(json: { properties?: { timeseries?: MetEntry[] } }): MetRow[] {
  const rows: MetRow[] = [];
  for (const e of json.properties?.timeseries ?? []) {
    const d = e.data.instant.details;
    const next = e.data.next_1_hours ?? e.data.next_6_hours;
    if (d.air_temperature === undefined || d.wind_speed === undefined || !next) continue;
    const step = e.data.next_1_hours ? 1 : 6;
    const mm = next.details?.precipitation_amount ?? 0;
    rows.push([
      Math.round(Date.parse(e.time) / 1000),
      r1(d.air_temperature),
      r1(mm / step),
      Math.round(d.wind_speed * 3.6),
      d.wind_speed_of_gust === undefined ? null : Math.round(d.wind_speed_of_gust * 3.6),
      next.summary.symbol_code,
      step,
    ]);
  }
  return rows;
}

type CacheRow = { cell: string; series: MetRow[]; last_modified: string | null; expires_at: string };

async function fetchCell(cell: string, previous: CacheRow | undefined): Promise<CacheRow | null> {
  const [lat, lon] = cell.split(',');
  const res = await fetch(`${API}?lat=${lat}&lon=${lon}`, {
    headers: {
      'User-Agent': USER_AGENT,
      ...(previous?.last_modified ? { 'If-Modified-Since': previous.last_modified } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const expires = Date.parse(res.headers.get('Expires') ?? '');
  const expiresAt = new Date(Number.isFinite(expires) && expires > Date.now() ? expires : Date.now() + DEFAULT_TTL_MS).toISOString();
  if (res.status === 304 && previous) return { ...previous, expires_at: expiresAt };
  if (!res.ok) {
    console.warn(`MET Norway ${res.status} pour ${cell}`);
    return null;
  }
  return { cell, series: parseMet(await res.json()), last_modified: res.headers.get('Last-Modified'), expires_at: expiresAt };
}

/** Prévisions de ces cases : cache d'abord, MET Norway pour les cases absentes ou expirées */
export async function getCells(admin: SupabaseClient, cells: string[]): Promise<Record<string, MetRow[]>> {
  const unique = [...new Set(cells)];
  const out: Record<string, MetRow[]> = {};
  if (!unique.length) return out;
  const { data, error } = await admin.from('weather_cache').select('cell, series, last_modified, expires_at').in('cell', unique);
  if (error) throw new Error(error.message);
  const cached = new Map(((data ?? []) as CacheRow[]).map((r) => [r.cell, r]));
  const stale: string[] = [];
  for (const c of unique) {
    const row = cached.get(c);
    if (row) out[c] = row.series;
    if (!row || Date.parse(row.expires_at) <= Date.now()) stale.push(c);
  }
  const fresh: CacheRow[] = [];
  for (let i = 0; i < stale.length; i += PARALLEL) {
    const batch = await Promise.all(
      stale.slice(i, i + PARALLEL).map((c) =>
        fetchCell(c, cached.get(c)).catch((e) => {
          console.warn('MET Norway injoignable', c, e);
          return null;
        }),
      ),
    );
    for (const row of batch) {
      if (!row) continue;
      out[row.cell] = row.series;
      fresh.push(row);
    }
  }
  if (fresh.length) {
    const { error: upsertError } = await admin
      .from('weather_cache')
      .upsert(fresh.map((r) => ({ ...r, fetched_at: new Date().toISOString() })));
    if (upsertError) console.warn('Cache météo non enregistré', upsertError.message);
  }
  return out;
}

/** Heure de prévision la plus proche de t (s), dans le pas de la prévision */
export function rowAt(rows: MetRow[] | undefined, t: number): MetRow | null {
  if (!rows?.length) return null;
  let best: MetRow | null = null;
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
