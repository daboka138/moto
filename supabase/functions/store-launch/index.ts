// « Préviens-moi » : l'appli est sortie sur iPhone (App Store) ou Android (Google Play public).
// Appelée depuis Console › Sorties stores, avec le jeton de session : { platform: 'ios' | 'android', test?: boolean }
//
// 1. Vérifie que l'appelant est admin (app_admins) : personne d'autre ne déclenche d'envoi.
// 2. store_launch_dispatch : notification (onglet Notifs) + push aux membres inscrits pas encore
//    prévenus (notified_at, une seule fois), puis liste des emails à envoyer.
// 3. Emails Brevo (noreply@passeryder.fr) un par un, chaque ligne marquée AVANT l'envoi
//    (claim_store_email) : jamais deux emails ; envoi raté = remis en attente pour un prochain clic.
// test = l'admin seul (notification + push + email à l'adresse de son compte), rien n'est marqué.
//
// verify_jwt = false (config.toml) : jeton vérifié ici. Clé Brevo : secret BREVO_API_KEY (comme send-sms).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const UNSUBSCRIBE_URL = 'https://passeryder.fr/desinscription';
const CONCURRENCY = 4;

// Console web (app.passeryder.fr) : appel depuis le navigateur, donc CORS
const WEB_ORIGINS = ['https://app.passeryder.fr', 'http://localhost:8081'];

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

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function buildEmail(platform: 'ios' | 'android', link: string, token: string | null) {
  const label = platform === 'ios' ? 'iPhone' : 'Android';
  const store = platform === 'ios' ? 'l’App Store' : 'Google Play';
  const unsub = token ? `${UNSUBSCRIBE_URL}?t=${token}` : UNSUBSCRIBE_URL;
  const subject = `PasseRyder est dispo sur ${label} !`;
  const text =
    `Salut,\n\nTu nous avais demandé de te prévenir : PasseRyder est maintenant disponible sur ${label}.\n\n` +
    `Télécharge-la sur ${store} : ${link}\n\nTu as déjà un compte sur la version web ? Il reste le même : connecte-toi avec la même adresse.\n\n` +
    `À bientôt sur la route,\nDimitri, PasseRyder\n\n` +
    `Tu reçois cet email une seule fois, parce que tu t’es inscrit(e) à « Préviens-moi ». Ne plus rien recevoir : ${unsub}`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 24px 8px;text-align:center"><img src="https://passeryder.fr/icon.png" width="72" height="72" alt="PasseRyder" style="border-radius:16px"></td></tr>
<tr><td style="padding:8px 24px;text-align:center"><h1 style="font-size:24px;margin:0">PasseRyder est dispo sur ${label} !</h1></td></tr>
<tr><td style="padding:8px 24px;font-size:16px;line-height:1.5">Salut,<br><br>Tu nous avais demandé de te prévenir : PasseRyder est maintenant disponible sur ${label}.</td></tr>
<tr><td style="padding:16px 24px;text-align:center"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:14px 26px;border-radius:999px">Télécharger sur ${store}</a></td></tr>
<tr><td style="padding:8px 24px 24px;font-size:15px;line-height:1.5;color:#334155">Tu as déjà un compte sur la version web ? Il reste le même : connecte-toi avec la même adresse.<br><br>À bientôt sur la route,<br>Dimitri, PasseRyder</td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#64748b;margin:16px auto 0">Tu reçois cet email une seule fois, parce que tu t’es inscrit(e) à « Préviens-moi ».<br><a href="${escapeHtml(unsub)}" style="color:#64748b">Ne plus rien recevoir</a></p>
</td></tr></table></body></html>`;
  return { subject, text, html, unsub };
}

async function sendEmail(apiKey: string, to: string, mail: ReturnType<typeof buildEmail>): Promise<string | null> {
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'PasseRyder', email: 'noreply@passeryder.fr' },
        to: [{ email: to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        headers: { 'List-Unsubscribe': `<${mail.unsub}>` },
        tags: ['store-launch'],
      }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return `Brevo ${res.status} : ${String(body.message ?? body.code ?? '')}`.slice(0, 300);
  } catch (e) {
    return `Brevo injoignable : ${e instanceof Error ? e.message : String(e)}`;
  }
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
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: 'Session invalide' }, { status: 401 });
  const { data: isAdmin } = await admin.from('app_admins').select('user_id').eq('user_id', auth.user.id).maybeSingle();
  if (!isAdmin) return Response.json({ error: 'Accès refusé' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const platform = body?.platform;
  if (platform !== 'ios' && platform !== 'android') return Response.json({ error: 'Plateforme inconnue' }, { status: 400 });
  const test = body?.test === true;

  try {
    const { data: setting } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', platform === 'ios' ? 'app_store_url' : 'play_store_url')
      .maybeSingle();
    const link = setting?.value ?? '';

    const { data: targets, error } = await admin.rpc('store_launch_dispatch', {
      p_platform: platform,
      p_test_user: test ? auth.user.id : null,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    const rows = (targets ?? []) as { id: string | null; email: string; unsubscribe_token: string | null }[];

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (rows.length && !apiKey) {
      return Response.json({ error: 'Notifications envoyées, mais clé Brevo absente des secrets (BREVO_API_KEY) : aucun email' }, { status: 500 });
    }

    let emailed = 0;
    let failed = 0;
    let lastError: string | null = null;
    const queue = [...rows];
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        if (row.id) {
          const { data: claimed } = await admin.rpc('claim_store_email', { p_id: row.id, p_sent: true });
          if (!claimed) continue;
        }
        const err = await sendEmail(apiKey!, row.email, buildEmail(platform, link, row.unsubscribe_token));
        if (err) {
          failed++;
          lastError = err;
          if (row.id) await admin.rpc('claim_store_email', { p_id: row.id, p_sent: false });
        } else emailed++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    return Response.json({ test, emailed, failed, error: lastError });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
