// Actus moto : récupère les flux RSS des sources actives (table news_sources), garde les nouveaux
// articles moto (titre, 1-2 phrases du résumé du flux, lien, image du flux) et efface ceux de plus
// de 30 jours. Appelée toutes les 3 h par pg_cron (migration moto_news), sans jeton : elle ne lit
// que des flux publics et ne repasse pas avant 30 min. Un admin (jeton vérifié) peut forcer un passage.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { feedCharset, isMotoNews, parseFeed } from './rss.ts';

const WEB_ORIGINS = ['https://app.passeryder.fr', 'http://localhost:8081'];
const MIN_GAP_MS = 30 * 60_000;
const KEEP_DAYS = 30;
const PER_SOURCE = 15;

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
  for (const s of sources as Source[]) {
    let status = 'ok';
    let added = 0;
    try {
      const entries = parseFeed(await readFeed(s.feed_url), s.feed_url)
        .filter((e) => isMotoNews(e.title, e.summary))
        .filter((e) => !e.publishedAt || Date.parse(e.publishedAt) > since)
        .slice(0, PER_SOURCE);
      if (entries.length) {
        const rows = entries.map((e) => ({
          source_id: s.id,
          guid: e.guid,
          url: e.url,
          title: e.title,
          summary: e.summary,
          image_url: e.imageUrl,
          published_at: e.publishedAt ?? new Date().toISOString(),
        }));
        const { data, error: insertError } = await admin
          .from('news_items')
          .upsert(rows, { onConflict: 'source_id,guid', ignoreDuplicates: true })
          .select('id');
        if (insertError) throw insertError;
        added = data?.length ?? 0;
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

  // 30 jours max (J'aime et commentaires partent avec, en cascade)
  await admin.from('news_items').delete().lt('published_at', new Date(since).toISOString());

  return Response.json({ sources: report }, { headers });
});
