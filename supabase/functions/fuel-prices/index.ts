// Prix des carburants en France : flux instantané officiel (data.economie.gouv.fr, Licence Ouverte
// v2.0 Etalab), importé dans fuel_stations (RPC fuel_import, ne réécrit que ce qui change).
// Appelée toutes les 30 min par pg_cron (migration fuel_prices), sans jeton : elle ne lit qu'un
// flux public et ne repasse pas avant 10 min.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FEED =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/json?select=' +
  [
    'id', 'geom', 'cp', 'ville', 'adresse', 'horaires', 'horaires_automate_24_24', 'carburants_rupture_temporaire',
    'gazole_prix', 'gazole_maj', 'sp95_prix', 'sp95_maj', 'e10_prix', 'e10_maj', 'sp98_prix', 'sp98_maj',
    'e85_prix', 'e85_maj', 'gplc_prix', 'gplc_maj',
  ].join(',');
const MIN_GAP_MS = 10 * 60_000;
const CHUNK = 2500;
const FUELS = ['e10', 'sp95', 'sp98', 'gazole', 'e85', 'gplc'] as const;

type Raw = Record<string, unknown> & {
  id: number;
  geom?: { lat: number; lon: number } | null;
  horaires?: string | null;
  horaires_automate_24_24?: string | null;
  carburants_rupture_temporaire?: string | null;
};

type Slot = { '@ouverture'?: string; '@fermeture'?: string };
type Day = { '@id'?: string; '@ferme'?: string; horaire?: Slot | Slot[] };

const HHMM = /^\d{2}\.\d{2}$/;

/** Horaires du flux → {"1": [["07.00","20.00"]], "7": null} (null = fermé), null si inconnus */
function parseHours(raw: string | null | undefined): Record<string, [string, string][] | null> | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as { jour?: Day | Day[] };
    const days = Array.isArray(h.jour) ? h.jour : h.jour ? [h.jour] : [];
    if (!days.length) return null;
    const out: Record<string, [string, string][] | null> = {};
    for (const d of days) {
      const id = d['@id'];
      if (!id || !/^[1-7]$/.test(id)) continue;
      if (d['@ferme'] === '1') {
        out[id] = null;
        continue;
      }
      const slots = (Array.isArray(d.horaire) ? d.horaire : d.horaire ? [d.horaire] : [])
        .map((s) => [s['@ouverture'] ?? '', s['@fermeture'] ?? ''] as [string, string])
        .filter(([a, b]) => HHMM.test(a) && HHMM.test(b) && a !== b);
      // Jour ouvert sans horaires donnés : inconnu
      if (slots.length) out[id] = slots;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

const num = (v: unknown) => (typeof v === 'number' && v > 0 && v < 10 ? v : null);
const date = (v: unknown) => (typeof v === 'string' && v ? v : null);

function toRow(r: Raw) {
  if (!r.geom || typeof r.id !== 'number') return null;
  const row: Record<string, unknown> = {
    id: r.id,
    lat: r.geom.lat,
    lon: r.geom.lon,
    address: typeof r.adresse === 'string' ? r.adresse.trim() : null,
    city: typeof r.ville === 'string' ? r.ville.trim() : null,
    cp: typeof r.cp === 'string' ? r.cp : null,
    shortages: (r.carburants_rupture_temporaire ?? '').split(';').map((s) => s.trim()).filter(Boolean),
    automate24: r.horaires_automate_24_24 === 'Oui',
    hours: parseHours(r.horaires),
  };
  for (const f of FUELS) {
    const price = num(r[`${f}_prix`]);
    row[f] = price;
    row[`${f}_at`] = price === null ? null : date(r[`${f}_maj`]);
  }
  return row;
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: last } = await admin.from('fuel_imports').select('ran_at').order('ran_at', { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(last.ran_at) < MIN_GAP_MS) return Response.json({ skipped: true });

  let raw: Raw[];
  try {
    const res = await fetch(FEED, {
      headers: { 'User-Agent': 'PasseRyder/1.0 (+https://passeryder.fr)', Accept: 'application/json' },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = (await res.json()) as Raw[];
  } catch (e) {
    return Response.json({ error: `Flux des carburants injoignable : ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
  const rows = raw.map(toRow).filter((r): r is Record<string, unknown> => !!r);
  // Flux vide ou tronqué : on ne touche à rien (sinon les stations disparaîtraient au bout de 7 jours)
  if (rows.length < 5000) return Response.json({ error: `Flux incomplet (${rows.length} stations)` }, { status: 502 });

  let changed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await admin.rpc('fuel_import', { p_rows: rows.slice(i, i + CHUNK) });
    if (error) return Response.json({ error: error.message, done: i }, { status: 500 });
    changed += (data as number) ?? 0;
  }
  return Response.json({ stations: rows.length, changed });
});
