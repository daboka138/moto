// Actus moto : récupère les flux RSS des sources actives (table news_sources), garde les nouveaux
// articles moto (titre, 1-2 phrases du résumé du flux, lien, image du flux) et efface ceux de plus
// de 30 jours. Appelée toutes les 3 h par pg_cron (migration moto_news), sans jeton : elle ne lit
// que des flux publics et ne repasse pas avant 30 min. Un admin (jeton vérifié) peut forcer un passage.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { probeImageSize } from './probe.ts';
import { feedCharset, isMotoNews, parseFeed } from './rss.ts';

const WEB_ORIGINS = ['https://app.passeryder.fr', 'http://localhost:8081'];
const MIN_GAP_MS = 30 * 60_000;
const KEEP_DAYS = 30;
const PER_SOURCE = 15;
/** Mesures d'images pour rattraper les actus déjà en base, par passage */
const MAX_PROBES = 60;

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': WEB_ORIGINS.includes(origin) ? origin : WEB_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

type Source = { id: string; name: string; feed_url: string; last_fetch_at: string | null };

async function readFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PasseRyder/1.0 (+https://passeryder.fr)', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = new TextDecoder('ascii').decode(buf.slice(0, 200));
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(feedCharset(res.headers.get('content-type'), head));
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  return decoder.decode(buf);
}

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Jeton d'un admin : passage forcé (Console › Actus)
  let forced = false;
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ') && auth.split('.').length === 3) {
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data } = await user.rpc('is_admin');
    forced = data === true;
  }

  const { data: sources, error } = await admin
    .from('news_sources')
    .select('id, name, feed_url, last_fetch_at')
    .eq('enabled', true)
    .order('sort_order');
  if (error) return Response.json({ error: error.message }, { status: 500, headers });

  const last = Math.max(0, ...(sources as Source[]).map((s) => (s.last_fetch_at ? Date.parse(s.last_fetch_at) : 0)));
  if (!forced && Date.now() - last < MIN_GAP_MS) return Response.json({ skipped: true }, { headers });

  const since = Date.now() - KEEP_DAYS * 86400_000;
  const report: Record<string, string> = {};
  let probes = 0;
  for (const s of sources as Source[]) {
    let status = 'ok';
    let added = 0;
    try {
      const entries = parseFeed(await readFeed(s.feed_url), s.feed_url)
        .filter((e) => isMotoNews(e.title, e.summary))
        .filter((e) => !e.publishedAt || Date.parse(e.publishedAt) > since)
        .slice(0, PER_SOURCE);
      if (entries.length) {
        const { data: known, error: knownError } = await admin
          .from('news_items')
          .select('id, guid, image_width')
          .eq('source_id', s.id)
          .in('guid', entries.map((e) => e.guid));
        if (knownError) throw knownError;
        const byGuid = new Map((known ?? []).map((k) => [k.guid as string, k as { id: string; image_width: number | null }]));
        const fresh = entries.filter((e) => !byGuid.has(e.guid));
        if (fresh.length) {
          const rows = [];
          for (const e of fresh) {
            const size = e.image ? await probeImageSize(e.image.url) : null;
            rows.push({
              source_id: s.id,
              guid: e.guid,
              url: e.url,
              title: e.title,
              summary: e.summary,
              image_url: e.image?.url ?? null,
              image_width: size?.width ?? null,
              image_height: size?.height ?? null,
              published_at: e.publishedAt ?? new Date().toISOString(),
            });
          }
          const { data, error: insertError } = await admin
            .from('news_items')
            .upsert(rows, { onConflict: 'source_id,guid', ignoreDuplicates: true })
            .select('id');
          if (insertError) throw insertError;
          added = data?.length ?? 0;
        }
        // Actus déjà en base sans taille d'image (avant la note 26) : meilleure image du flux + taille réelle
        for (const e of entries) {
          const row = byGuid.get(e.guid);
          if (!row || row.image_width || probes >= MAX_PROBES) continue;
          probes++;
          const size = e.image ? await probeImageSize(e.image.url) : null;
          await admin
            .from('news_items')
            .update({ image_url: e.image?.url ?? null, image_width: size?.width ?? null, image_height: size?.height ?? null })
            .eq('id', row.id);
        }
      }
    } catch (e) {
      status = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    }
    report[s.name] = status === 'ok' ? `+${added}` : status;
    await admin
      .from('news_sources')
      .update({ last_fetch_at: new Date().toISOString(), last_status: status, last_new: added })
      .eq('id', s.id);
  }

  // Plus dans les flux mais encore en base, image sans taille : on mesure l'image gardée
  if (probes < MAX_PROBES) {
    const { data: rest } = await admin
      .from('news_items')
      .select('id, image_url')
      .not('image_url', 'is', null)
      .is('image_width', null)
      .gte('published_at', new Date(since).toISOString())
      .limit(MAX_PROBES - probes);
    for (const r of (rest ?? []) as { id: string; image_url: string }[]) {
      const size = await probeImageSize(r.image_url);
      if (size) await admin.from('news_items').update({ image_width: size.width, image_height: size.height }).eq('id', r.id);
    }
  }

  // 30 jours max (J'aime et commentaires partent avec, en cascade)
  await admin.from('news_items').delete().lt('published_at', new Date(since).toISOString());

  return Response.json({ sources: report }, { headers });
});
