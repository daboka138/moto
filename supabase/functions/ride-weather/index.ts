// Veille au soir (pg_cron « ride-weather », 17 h UTC) : météo des balades de demain le long du
// tracé, à l'heure de passage (MET Norway, cache partagé _shared/met.ts). Si elle est mauvaise
// (pluie, orage, neige, rafales ≥ 50 km/h, gel ≤ 3 °C, forte chaleur ≥ 33 °C), notification + push
// aux inscrits qui ont gardé le réglage « Météo de mes balades » (ride_weather_done, une seule fois
// par balade). Mêmes seuils que src/lib/weather.ts.
// Sans jeton (verify_jwt = false) : ne lit que des prévisions publiques et ne prévient qu'une fois.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { cellOf, getCells, rowAt, type MetRow } from '../_shared/met.ts';

const SAMPLE_M = 20_000;
const MAX_SAMPLES = 12;
/** Départ estimé : un quart d'heure après le RDV */
const START_DELAY_S = 15 * 60;

type Target = {
  id: string;
  title: string;
  meeting_at: string;
  duration_s: number | null;
  route: [number, number][] | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  meeting_lat: number | null;
  meeting_lng: number | null;
  waypoints: { lat: number; lng: number }[] | null;
};

function distM(a: [number, number], b: [number, number]) {
  const kx = 111_320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[1] - a[1]) * kx, (b[0] - a[0]) * 110_540);
}

/** Points du tracé tous les ~20 km (départ et arrivée compris), avec leur part du trajet */
function samples(t: Target): { p: [number, number]; share: number }[] {
  let line: [number, number][] = t.route?.length ? t.route : [];
  if (!line.length) {
    const pts: [number, number][] = [];
    if (t.start_lat !== null && t.start_lng !== null) pts.push([t.start_lat, t.start_lng]);
    else if (t.meeting_lat !== null && t.meeting_lng !== null) pts.push([t.meeting_lat, t.meeting_lng]);
    for (const w of t.waypoints ?? []) pts.push([w.lat, w.lng]);
    if (t.end_lat !== null && t.end_lng !== null) pts.push([t.end_lat, t.end_lng]);
    line = pts;
  }
  if (!line.length) return [];
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  const total = cum[cum.length - 1];
  const count = Math.max(1, Math.min(MAX_SAMPLES, Math.floor(total / SAMPLE_M) + 1));
  const out: { p: [number, number]; share: number }[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? 0 : (total * k) / (count - 1);
    while (j < line.length - 1 && cum[j] < target) j++;
    out.push({ p: line[j], share: total ? cum[j] / total : 0 });
  }
  return out;
}

const isRain = (r: MetRow) => r[2] >= 0.5 || (/rain|sleet|snow|thunder/.test(r[5]) && r[2] >= 0.2);
const gustOf = (r: MetRow) => r[4] ?? Math.round(r[3] * 1.5);
const hour = (t: number) => `${new Date(t * 1000).toLocaleString('fr-FR', { hour: 'numeric', timeZone: 'Europe/Paris' }).replace(/\s/g, '')}`;

async function placeName([lat, lon]: [number, number]): Promise<string | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&lang=fr&limit=1`, {
      headers: { 'User-Agent': 'PasseRyder/1.0 (+https://passeryder.fr)' },
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as { features?: { properties?: { city?: string; name?: string; county?: string } }[] };
    const p = json.features?.[0]?.properties;
    return p?.city ?? p?.name ?? null;
  } catch {
    return null;
  }
}

/** Phrase courte si la météo est mauvaise, sinon null */
async function badWeather(t: Target, cells: Record<string, MetRow[]>): Promise<string | null> {
  const start = Date.parse(t.meeting_at) / 1000 + START_DELAY_S;
  const duration = t.duration_s ?? 3 * 3600;
  const at = samples(t)
    .map((s) => ({ p: s.p, row: rowAt(cells[cellOf(s.p[0], s.p[1])], start + duration * s.share) }))
    .filter((x): x is { p: [number, number]; row: MetRow } => !!x.row);
  if (!at.length) return null;
  const parts: string[] = [];
  const storm = at.find((x) => x.row[5].includes('thunder'));
  const snow = at.find((x) => /snow|sleet/.test(x.row[5]) && x.row[2] >= 0.2);
  const rain = at.find((x) => isRain(x.row));
  const wet = storm ?? snow ?? rain;
  if (wet) {
    const where = await placeName(wet.p);
    const what = storm ? 'orage possible' : snow ? 'neige possible' : 'pluie possible';
    parts.push(`${what}${where ? ` vers ${where}` : ''} vers ${hour(wet.row[0])}`);
  }
  const gust = Math.max(...at.map((x) => gustOf(x.row)));
  if (gust >= 50) parts.push(`rafales jusqu’à ${Math.round(gust / 5) * 5} km/h`);
  const cold = Math.min(...at.map((x) => x.row[1]));
  if (cold <= 3) parts.push(`${Math.round(cold)} °C au plus froid, verglas possible`);
  const hot = Math.max(...at.map((x) => x.row[1]));
  if (hot >= 33) parts.push(`forte chaleur (${Math.round(hot)} °C)`);
  if (!parts.length) return null;
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('ride_weather_targets');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const targets = (data ?? []) as Target[];
  let warned = 0;
  let checked = 0;
  for (const t of targets) {
    const pts = samples(t);
    if (!pts.length) continue;
    let cells: Record<string, MetRow[]>;
    try {
      cells = await getCells(admin, pts.map((s) => cellOf(s.p[0], s.p[1])));
    } catch (e) {
      console.warn('Météo indisponible pour la balade', t.id, e);
      continue;
    }
    // Aucune prévision (MET injoignable) : la balade sera revue au prochain passage
    if (!pts.some((s) => cells[cellOf(s.p[0], s.p[1])]?.length)) continue;
    const body = await badWeather(t, cells);
    const { data: sent, error: doneError } = await admin.rpc('ride_weather_done', { p_ride: t.id, p_body: body });
    if (doneError) console.warn('Notification météo impossible', t.id, doneError.message);
    checked++;
    if (body && sent) warned++;
  }
  return Response.json({ rides: targets.length, checked, warned });
});
