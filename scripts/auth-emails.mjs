// Emails d'authentification PasseRyder (Supabase Auth).
//
//   node scripts/auth-emails.mjs           → génère supabase/templates/*.html
//   node scripts/auth-emails.mjs --push    → génère, puis envoie au projet Supabase (API de gestion) :
//                                            modèles + sujets, Site URL, Redirect URLs, limite d'envoi.
//   (bash : set -a; . <(sed 's/\r$//' .env.supabase); set +a  → SUPABASE_ACCESS_TOKEN)
//
// Ne touche JAMAIS au SMTP, à « Confirm email » (mailer_autoconfirm) ni aux limites d'envoi :
// ces réglages se font à la main dans le dashboard (voir PLAY_STORE.md § 5.1).
//
// Liens : token_hash vers nos propres pages (pas {{ .ConfirmationURL }}). Le lien ne dépend ni de
// l'appareil ni du navigateur qui a fait la demande (pas de PKCE), et il n'est consommé que par
// notre page (un antivirus qui « prévisualise » le lien ne le grille pas).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'templates');
const PROJECT_REF = 'yfewldnhnnrzzscmfjsd';

const SITE = 'https://passeryder.fr';
const APP = 'https://app.passeryder.fr';
const BLUE = '#0EA5E9';
const INK = '#18181B';
const MUTED = '#71717A';
const BG = '#F4F4F5';

export const AUTH_URLS = {
  site_url: SITE,
  uri_allow_list: [`${APP}/**`, `${SITE}/**`, 'passeryder://**'],
  /** Emails d'auth par heure (exige le SMTP personnalisé, 2 par défaut) */
  rate_limit_email_sent: 30,
};

const TEMPLATES = {
  confirmation: {
    subject: 'Confirme ton adresse email PasseRyder',
    title: 'Bienvenue sur PasseRyder 🏍️',
    text: 'Encore une étape : confirme ton adresse email pour activer ton compte.',
    button: 'Confirmer mon email',
    url: `${SITE}/email-confirme?token_hash={{ .TokenHash }}&type=email`,
    note: 'Tu n’as pas créé de compte ? Ignore simplement cet email.',
  },
  recovery: {
    subject: 'Réinitialise ton mot de passe PasseRyder',
    title: 'Nouveau mot de passe',
    text: 'Tu as demandé à changer le mot de passe de ton compte PasseRyder. Appuie sur le bouton pour en choisir un nouveau.',
    button: 'Choisir un nouveau mot de passe',
    url: `${APP}/auth-callback?token_hash={{ .TokenHash }}&type=recovery`,
    note: 'Tu n’as rien demandé ? Ignore cet email : ton mot de passe ne change pas.',
  },
  email_change: {
    subject: 'Confirme ta nouvelle adresse email',
    title: 'Changement d’adresse email',
    text: 'Tu as demandé à remplacer <strong>{{ .Email }}</strong> par <strong>{{ .NewEmail }}</strong> sur ton compte PasseRyder.',
    button: 'Confirmer le changement',
    url: `${SITE}/email-confirme?token_hash={{ .TokenHash }}&type=email_change`,
    note: 'Tu n’as rien demandé ? N’appuie pas sur le bouton et écris-nous : passeryder@gmail.com.',
  },
  magic_link: {
    subject: 'Ton lien de connexion PasseRyder',
    title: 'Connexion à PasseRyder',
    text: 'Appuie sur le bouton pour te connecter, sans mot de passe.',
    button: 'Me connecter',
    url: `${APP}/auth-callback?token_hash={{ .TokenHash }}&type=magiclink`,
    note: 'Tu n’as rien demandé ? Ignore cet email : personne ne peut se connecter sans ce lien.',
  },
};

function render(t) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${t.subject}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:20px;border-top:5px solid ${BLUE};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <tr><td align="center" style="padding:28px 24px 8px;">
      <img src="${SITE}/email/logo.png" width="56" height="56" alt="" style="display:block;border:0;border-radius:12px;">
      <div style="margin-top:10px;font-size:22px;font-weight:800;letter-spacing:.3px;">Passe<span style="color:${BLUE};">Ryder</span></div>
    </td></tr>
    <tr><td style="padding:16px 28px 0;">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:800;">${t.title}</h1>
      <p style="margin:0;font-size:16px;line-height:1.55;">${t.text}</p>
    </td></tr>
    <tr><td align="center" style="padding:24px 28px;">
      <a href="${t.url}" style="display:inline-block;background:${BLUE};color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:800;padding:15px 26px;border-radius:14px;">${t.button}</a>
      <p style="margin:14px 0 0;font-size:13px;color:${MUTED};">Lien valable 1 heure, utilisable une seule fois.</p>
    </td></tr>
    <tr><td style="padding:0 28px 8px;">
      <p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};">Le bouton ne marche pas ? Copie ce lien dans ton navigateur :<br>
      <a href="${t.url}" style="color:${BLUE};word-break:break-all;">${t.url}</a></p>
    </td></tr>
    <tr><td style="padding:16px 28px 28px;">
      <p style="margin:0;padding-top:16px;border-top:1px solid #E4E4E7;font-size:13px;line-height:1.5;color:${MUTED};">${t.note}</p>
    </td></tr>
  </table>
  <p style="margin:16px 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};">
    PasseRyder · l’app des motards qui roulent ensemble · <a href="${SITE}" style="color:${MUTED};">passeryder.fr</a>
  </p>
</td></tr>
</table>
</body>
</html>
`;
}

mkdirSync(OUT, { recursive: true });
const body = {};
for (const [name, t] of Object.entries(TEMPLATES)) {
  const html = render(t);
  writeFileSync(join(OUT, `${name}.html`), html);
  body[`mailer_subjects_${name}`] = t.subject;
  body[`mailer_templates_${name}_content`] = html;
}
console.log(`supabase/templates : ${Object.keys(TEMPLATES).map((n) => `${n}.html`).join(', ')}`);

if (process.argv.includes('--push')) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN manquant (charger .env.supabase)');
  const api = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Redirect URLs : on ajoute les nôtres sans retirer celles déjà présentes
  const current = await (await fetch(api, { headers })).json();
  const allow = new Set(String(current.uri_allow_list ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  AUTH_URLS.uri_allow_list.forEach((u) => allow.add(u));
  const res = await fetch(api, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      ...body,
      site_url: AUTH_URLS.site_url,
      uri_allow_list: [...allow].join(','),
      rate_limit_email_sent: AUTH_URLS.rate_limit_email_sent,
    }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} : ${await res.text()}`);
  const after = await res.json();
  console.log('Supabase mis à jour :');
  console.log('  site_url        =', after.site_url);
  console.log('  uri_allow_list  =', after.uri_allow_list);
  console.log('  rate_limit_email_sent =', after.rate_limit_email_sent);
  console.log('  mailer_autoconfirm (Confirm email désactivé si true) =', after.mailer_autoconfirm);
  for (const name of Object.keys(TEMPLATES)) console.log(`  ${name.padEnd(13)} → « ${after[`mailer_subjects_${name}`]} »`);
}
