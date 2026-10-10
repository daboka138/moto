// SMS automatiques d'alerte (Brevo) : SOS, chute, « Je rentre » (départ et retard).
//
// Deux façons de l'appeler :
// 1. Depuis l'app, avec le jeton de session (vérifié ici avec auth.getUser) :
//    { type: 'sos' | 'chute' | 'je_rentre', phones: string[], latitude?, longitude?, eta? }
//    (je_rentre = SMS de départ, eta = heure d'arrivée prévue)
// 2. Par pg_cron (check_homecomings), pour un « Je rentre » en retard : { homecoming_id }.
//    Les numéros et la position sont relus en base (claim_homecoming_sms), une seule fois et
//    seulement pour un « Je rentre » passé en alerte : l'appel n'expose rien.
//
// Le texte est construit ici (jamais fourni par l'app) : impossible de s'en servir pour envoyer
// n'importe quel message. Quota : 10 SMS par utilisateur sur 24 h (reserve_sms).
// Journal : sms_log, numéro masqué (336****78).
//
// verify_jwt = false (config.toml) : jeton vérifié dans la fonction. Clé Brevo : secret BREVO_API_KEY.
import { createClient } from 'jsr:@supabase/supabase-js@2';

type SmsType = 'sos' | 'chute' | 'je_rentre';
type Variant = SmsType | 'je_rentre_retard';

const MAX_PHONES = 5;
const BREVO_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

/** 06 12 34 56 78 / +33 6… / 0033 6… → 33612345678 (international sans +) ; null si invalide */
export function toInternational(raw: string): string | null {
  let n = raw.replace(/[\s.\-()]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (/^0[1-9]\d{8}$/.test(n)) n = '33' + n.slice(1);
  return /^[1-9]\d{7,14}$/.test(n) ? n : null;
}

/** 33612345678 → 336****78 */
const mask = (n: string) => `${n.slice(0, 3)}****${n.slice(-2)}`;

const clock = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d).replace(':', 'h');

const mapLink = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;

// Alphabet GSM 7 bits : un SMS = 160 caractères (70 seulement avec un seul caractère hors GSM)
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
function toGsm(text: string) {
  return [...text.replace(/[’‘]/g, "'").replace(/[«»“”]/g, '"')]
    .map((c) => (GSM.includes(c) ? c : c.normalize('NFD').replace(/[̀-ͯ]/g, '')))
    .map((c) => (GSM.includes(c) ? c : ''))
    .join('');
}

function buildText(v: Variant, who: string, pos: { lat: number; lng: number; at: Date } | null, eta: Date | null) {
  const where = pos ? `Position (${clock(pos.at)}) : ${mapLink(pos.lat, pos.lng)}` : 'Position inconnue.';
  switch (v) {
    case 'sos':
      return `SOS PasseRyder : ${who} demande de l'aide. ${where}`;
    case 'chute':
      return `SOS PasseRyder : chute détectée pour ${who}, sans réponse. ${where}`;
    case 'je_rentre':
      return `PasseRyder : ${who} rentre, arrivée prévue vers ${clock(eta ?? new Date())}. Vous serez prévenu en cas de retard.`;
    case 'je_rentre_retard':
      return `ALERTE PasseRyder : ${who} n'est pas arrivé(e) à l'heure prévue (${clock(eta ?? new Date())}). Dernière ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
  }
}

async function sendOne(apiKey: string, recipient: string, content: string): Promise<string | null> {
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: 'PasseRyder', recipient, content, type: 'transactional', tag: 'alerte' }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return `Brevo ${res.status} : ${body.message ?? body.code ?? 'erreur'}`.slice(0, 300);
  } catch (e) {
    return `Brevo injoignable : ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
  }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Envoie le même texte à chaque numéro, dans la limite du quota ; journalise chaque envoi */
async function deliver(userId: string, type: SmsType, numbers: string[], content: string) {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const { data: slots, error } = await admin.rpc('reserve_sms', {
    p_user: userId,
    p_type: type,
    p_recipients: numbers.map(mask),
  });
  if (error) throw new Error(error.message);
  const rows = slots as { id: string; recipient: string; allowed: boolean }[];

  const results = await Promise.all(
    numbers.map(async (n, i) => {
      const slot = rows[i];
      if (!slot.allowed) return { recipient: slot.recipient, status: 'refused' as const };
      const err = apiKey ? await sendOne(apiKey, n, content) : 'Clé Brevo absente';
      await admin
        .from('sms_log')
        .update({ status: err ? 'error' : 'sent', error: err })
        .eq('id', slot.id);
      return { recipient: slot.recipient, status: err ? ('error' as const) : ('sent' as const), error: err };
    }),
  );
  return {
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'error').length,
    refused: results.filter((r) => r.status === 'refused').length,
    results,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Méthode non autorisée' }, { status: 405 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'Requête invalide' }, { status: 400 });

  try {
    // ---------- « Je rentre » en retard (pg_cron) ----------
    if (typeof body.homecoming_id === 'string') {
      const { data, error } = await admin.rpc('claim_homecoming_sms', { p_homecoming: body.homecoming_id });
      if (error) throw new Error(error.message);
      const row = (data as {
        user_id: string;
        username: string;
        phones: string[];
        deadline: string;
        latitude: number | null;
        longitude: number | null;
        position_at: string | null;
      }[])[0];
      if (!row) return Response.json({ sent: 0, failed: 0, refused: 0 });
      const numbers = [...new Set(row.phones.map(toInternational).filter((n): n is string => !!n))];
      const pos =
        row.latitude != null && row.longitude != null
          ? { lat: row.latitude, lng: row.longitude, at: new Date(row.position_at ?? Date.now()) }
          : null;
      const text = toGsm(buildText('je_rentre_retard', row.username, pos, new Date(row.deadline)));
      const r = await deliver(row.user_id, 'je_rentre', numbers, text);
      return Response.json({ sent: r.sent, failed: r.failed, refused: r.refused });
    }

    // ---------- Depuis l'app : utilisateur connecté uniquement ----------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return Response.json({ error: 'Non connecté' }, { status: 401 });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return Response.json({ error: 'Session invalide' }, { status: 401 });
    const userId = auth.user.id;

    const type = body.type as SmsType;
    if (!['sos', 'chute', 'je_rentre'].includes(type)) return Response.json({ error: 'Type inconnu' }, { status: 400 });
    if (!Array.isArray(body.phones) || !body.phones.length) return Response.json({ error: 'Aucun numéro' }, { status: 400 });
    if (body.phones.length > MAX_PHONES) return Response.json({ error: `${MAX_PHONES} numéros maximum` }, { status: 400 });
    // Pas de dédoublonnage : les résultats sont renvoyés dans l'ordre des numéros reçus
    const numbers = (body.phones as unknown[]).map((p) => (typeof p === 'string' ? toInternational(p) : null));
    if (numbers.some((n) => !n)) return Response.json({ error: 'Numéro de téléphone invalide' }, { status: 400 });

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const pos =
      body.latitude != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
        ? { lat, lng, at: new Date() }
        : null;
    const eta = typeof body.eta === 'string' && !Number.isNaN(Date.parse(body.eta)) ? new Date(body.eta) : null;
    if (type === 'je_rentre' && !eta) return Response.json({ error: 'Heure d’arrivée manquante' }, { status: 400 });

    const { data: profile } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle();
    const who = profile?.username ? `@${profile.username}` : 'Un motard';
    const text = toGsm(buildText(type, who, pos, eta));

    const r = await deliver(userId, type, numbers as string[], text);
    // Quota dépassé ou erreur Brevo : réponse 200 avec le détail (l'app bascule sur le SMS manuel)
    return Response.json({ sent: r.sent, failed: r.failed, refused: r.refused, results: r.results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
