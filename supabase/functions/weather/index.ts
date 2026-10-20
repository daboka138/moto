// Météo pour l'app : prévisions MET Norway des points demandés (trajet, ma position), par case de
// 0,1° gardée en cache côté serveur (_shared/met.ts) : l'app n'appelle jamais api.met.no.
// Entrée : { points: [[lat, lon], ...] } (30 max). Sortie : { keys: [case de chaque point], cells }.
// Rien n'est enregistré sur le membre : seules des cases arrondies sont gardées, sans lien avec lui.
// verify_jwt = false (config.toml) : le jeton de session est vérifié ici (auth.getUser).
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { cellOf, getCells } from '../_shared/met.ts';

const WEB_ORIGINS = ['https://app.passeryder.fr', 'http://localhost:8081'];
const MAX_POINTS = 30;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin || !WEB_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const response = await handle(req);
  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
  return response;
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Méthode non autorisée' }, { status: 405 });
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'Non connecté' }, { status: 401 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: 'Session invalide' }, { status: 401 });

  let points: unknown;
  try {
    points = ((await req.json()) as { points?: unknown }).points;
  } catch {
    return Response.json({ error: 'Requête invalide' }, { status: 400 });
  }
  if (!Array.isArray(points) || !points.length || points.length > MAX_POINTS) {
    return Response.json({ error: `Entre 1 et ${MAX_POINTS} points` }, { status: 400 });
  }
  const keys: string[] = [];
  for (const p of points) {
    const [lat, lon] = Array.isArray(p) ? p : [];
    if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return Response.json({ error: 'Point invalide' }, { status: 400 });
    }
    keys.push(cellOf(lat, lon));
  }
  try {
    const cells = await getCells(admin, keys);
    return Response.json({ keys, cells, source: 'MET Norway' });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
