// Visuels de la page https://passeryder.fr/telecharger (pour Facebook, Insta, impression) :
//   store/qr-telecharger.png   QR code 1200 px, logo au centre, « Scanne pour rouler avec nous »
//   store/affiche-facebook.png post 1080×1350 : logo, accroche, 4 fonctions, QR code
//   site/telecharger/          QR code de la page (ordinateur), captures allégées, image de partage
// Usage : cd branding && node telecharger.mjs, puis republier le site.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { INK, WHITE, f } from './generate.mjs';
import { BLUE, BLUE_DARK, BOLD, MEDIUM, ROOT, placedSymbol, png, textPaths, textWidth } from './draw.mjs';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator'); // dépendance de l'app (écran invite.tsx)
const Jimp = require('jimp-compact');

const URL = 'https://passeryder.fr/telecharger';
const TAGLINE = 'Scanne pour rouler avec nous';

// Texte centré sur cx
const centered = (font, segments, cx, baseline, size) =>
  textPaths(font, segments, cx - textWidth(font, segments.map((s) => s[0]).join(''), size) / 2, baseline, size);

// QR code (correction H : 30 % des modules peuvent manquer → logo au centre) dans un carré de `size`
// placé en (x, y), sans marge. Les modules sous le logo sont retirés plutôt que recouverts.
function qrGroup(x, y, size) {
  const qr = qrcode(0, 'H');
  qr.addData(URL);
  qr.make();
  const n = qr.getModuleCount();
  const m = size / n;
  const hole = Math.round(n * 0.24) | 1; // côté (impair) de la zone du logo, en modules
  const h0 = (n - hole) / 2;
  const inHole = (r, c) => r >= h0 && r < h0 + hole && c >= h0 && c < h0 + hole;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || inHole(r, c)) continue;
      let run = 1;
      while (c + run < n && qr.isDark(r, c + run) && !inHole(r, c + run)) run++;
      d += `M${f(x + c * m)} ${f(y + r * m)}h${f(run * m + 0.3)}v${f(m + 0.3)}h${f(-(run * m + 0.3))}Z`;
      c += run - 1;
    }
  }
  const logo = hole * m * 0.86;
  const lx = x + size / 2, ly = y + size / 2;
  return `<path d="${d}" fill="${INK}"/>`
    + `<rect x="${f(lx - logo / 2)}" y="${f(ly - logo / 2)}" width="${f(logo)}" height="${f(logo)}" rx="${f(logo * 0.22)}" fill="${BLUE}"/>`
    + placedSymbol('bleu', lx, ly, logo * 0.33);
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

mkdirSync(join(ROOT, 'site/telecharger'), { recursive: true });

// ---------- QR code imprimable 1200 px ----------
{
  const W = 1200, H = 1420, Q = 1000;
  png(svg(W, H,
    `<rect width="${W}" height="${H}" fill="${WHITE}"/>`
    + qrGroup((W - Q) / 2, 100, Q)
    + centered(BOLD, [[TAGLINE, INK]], W / 2, 1210, 72)
    + centered(MEDIUM, [['passeryder.fr/', INK], ['telecharger', BLUE_DARK]], W / 2, 1300, 48),
  ), 'store/qr-telecharger.png');
}

// ---------- QR code de la page (affiché sur ordinateur) ----------
{
  const S = 480, P = 24;
  png(svg(S + 2 * P, S + 2 * P, `<rect width="${S + 2 * P}" height="${S + 2 * P}" fill="${WHITE}"/>` + qrGroup(P, P, S)), 'site/telecharger/qr.png');
}

// ---------- Affiche Facebook / Insta 1080×1350 ----------
{
  const W = 1080, H = 1350;
  // Icônes 48×48 dessinées en tracés (pas d'emoji : aucune police installée)
  const ICONS = {
    map: `<path d="M24 45C24 45 9 30 9 19a15 15 0 0 1 30 0C39 30 24 45 24 45Z" fill="${BLUE}"/><circle cx="24" cy="19" r="6" fill="${WHITE}"/>`,
    flag: `<path d="M13 44V6" stroke="${BLUE}" stroke-width="5" stroke-linecap="round"/><path d="M15 8h24l-6 8 6 8H15Z" fill="${BLUE}"/>`,
    curve: `<path d="M8 42c0-14 32-6 32-20S16 16 16 8" fill="none" stroke="${BLUE}" stroke-width="5.5" stroke-linecap="round"/>`,
    sos: `<circle cx="24" cy="24" r="21" fill="#DC2626"/>` + centered(BOLD, [['SOS', WHITE]], 24, 30.5, 17),
  };
  const FEATURES = [
    ['map', 'Tes potes en direct sur la carte'],
    ['flag', 'Balades en convoi avec serre-file'],
    ['curve', 'Boucles sinueuses, itinéraire Plaisir'],
    ['sos', 'SOS, détection de chute, Je rentre'],
  ];

  // En-tête : symbole + PasseRyder
  const titleSize = 104;
  const titleW = textWidth(BOLD, 'PasseRyder', titleSize);
  const symR = 62, gap = 22;
  const x0 = (W - (symR * 2 + gap + titleW)) / 2;
  let body = `<defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_DARK}"/></linearGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#g)"/>`
    + placedSymbol('bleu', x0 + symR, 140, symR)
    + textPaths(BOLD, [['Passe', WHITE], ['Ryder', INK]], x0 + symR * 2 + gap, 176, titleSize)
    + centered(BOLD, [['L’app des motards', WHITE]], W / 2, 320, 62)
    + centered(BOLD, [['qui roulent ensemble', INK]], W / 2, 394, 62);

  // 4 fonctions
  const cardX = 90, cardW = W - 2 * cardX, cardH = 84, top = 450, step = 100;
  FEATURES.forEach(([icon, label], i) => {
    const y = top + i * step;
    body += `<rect x="${cardX}" y="${y}" width="${cardW}" height="${cardH}" rx="22" fill="${WHITE}" fill-opacity="0.16"/>`
      + `<circle cx="${cardX + 46}" cy="${y + cardH / 2}" r="30" fill="${WHITE}"/>`
      + `<g transform="translate(${cardX + 46 - 18} ${y + cardH / 2 - 18}) scale(0.75)">${ICONS[icon]}</g>`
      + textPaths(MEDIUM, [[label, WHITE]], cardX + 96, y + cardH / 2 + 13, 36);
  });

  // QR code
  const Q = 300, cardQW = 460, cardQH = 410, qy = 870;
  body += `<rect x="${(W - cardQW) / 2}" y="${qy}" width="${cardQW}" height="${cardQH}" rx="32" fill="${WHITE}"/>`
    + qrGroup((W - Q) / 2, qy + 30, Q)
    + centered(BOLD, [[TAGLINE, INK]], W / 2, qy + 30 + Q + 50, 30);

  // Bas : un seul bandeau (le QR code est déjà très bas)
  body += centered(BOLD, [['Android dès maintenant · iPhone via le web', WHITE]], W / 2, 1325, 34);
  png(svg(W, H, body), 'store/affiche-facebook.png');
}

// ---------- Captures allégées pour la page (540×960, JPEG) ----------
for (const name of ['capture-1-carte', 'capture-2-sorties', 'capture-3-balade-carte']) {
  const img = await Jimp.read(join(ROOT, `store/${name}.jpg`));
  await img.resize(540, 960).quality(78).writeAsync(join(ROOT, `site/telecharger/${name}.jpg`));
  console.log('✓', `site/telecharger/${name}.jpg`);
}

// Image d'aperçu des liens partagés (Facebook, WhatsApp : format 1,91:1)
copyFileSync(join(ROOT, 'store/feature-graphic-1024x500.png'), join(ROOT, 'site/telecharger/partage.png'));
console.log('✓ site/telecharger/partage.png');
