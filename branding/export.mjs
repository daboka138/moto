// Exporte la variante retenue (B · Évidé) vers toutes les icônes de l'app, du web et du store.
// Usage : cd branding && npm install && node export.mjs
// (QR code et affiche de la page /telecharger : node telecharger.mjs)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLUE, INK, WHITE, MODES, f, geometry, symbolBody } from './generate.mjs';
import { BLUE_DARK, BOLD, HERE, MEDIUM, V, iconSvg, placedSymbol, png, textPaths, textWidth } from './draw.mjs';

MODES.mono = { arms: WHITE, pin: WHITE }; // icône monochrome Android / notifications (seul l'alpha compte)

// ---------- App Android (app.json) ----------
// Icône adaptative : premier plan dans la zone de sécurité (cercle de 66/108 du canevas)
png(iconSvg({ size: 1024, mode: 'bleu', radiusFrac: 0.235 }), 'assets/images/android-icon-foreground.png');
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="${BLUE}"/></svg>`, 'assets/images/android-icon-background.png');
png(iconSvg({ size: 1024, mode: 'mono', radiusFrac: 0.235 }), 'assets/images/android-icon-monochrome.png');
png(iconSvg({ size: 1024, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }), 'assets/images/icon.png');
// Splash : fond bleu fourni par expo-splash-screen, image transparente (imageWidth 160)
png(iconSvg({ size: 512, mode: 'bleu', radiusFrac: 0.48 }), 'assets/images/splash-icon.png');
png(iconSvg({ size: 48, bg: BLUE, shape: 'rounded', mode: 'bleu', radiusFrac: 0.36 }), 'assets/images/favicon.png');

// ---------- PWA app.passeryder.fr (public/) ----------
png(iconSvg({ size: 192, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }), 'public/icons/icon-192.png');
png(iconSvg({ size: 512, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }), 'public/icons/icon-512.png');
png(iconSvg({ size: 512, bg: BLUE, mode: 'bleu', radiusFrac: 0.28 }), 'public/icons/icon-maskable-512.png');
png(iconSvg({ size: 180, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }), 'public/icons/apple-touch-icon.png');

// ---------- Site passeryder.fr (site/) ----------
png(iconSvg({ size: 48, bg: BLUE, shape: 'rounded', mode: 'bleu', radiusFrac: 0.36 }), 'site/favicon.png');
png(iconSvg({ size: 1024, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }), 'site/icon.png');
// Emails d'authentification (supabase/templates) : icône 2x, affichée en 56 px
png(iconSvg({ size: 112, bg: BLUE, shape: 'rounded', mode: 'bleu', radiusFrac: 0.34 }), 'site/email/logo.png');

// ---------- Play Store (store/) ----------
png(iconSvg({ size: 512, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }), 'store/icon-512.png');

{
  const W = 1024, H = 500;
  const title = 'PasseRyder';
  const lines = ['L’app communautaire des motards', 'Balades · Carte en direct · Sécurité'];
  const textX = 440;
  const titleSize = Math.min(104, (W - 56 - textX) / (textWidth(BOLD, title, 1)));
  const subSize = Math.min(30, (W - 56 - textX) / Math.max(...lines.map((l) => textWidth(MEDIUM, l, 1))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_DARK}"/></linearGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#g)"/>`
    + placedSymbol('bleu', 230, 250, 175)
    + textPaths(BOLD, [['Passe', WHITE], ['Ryder', INK]], textX, 240, titleSize)
    + textPaths(MEDIUM, [[lines[0], WHITE]], textX + 4, 300, subSize)
    + textPaths(MEDIUM, [[lines[1], WHITE]], textX + 4, 300 + subSize * 1.45, subSize)
    + `</svg>`;
  png(svg, 'store/feature-graphic-1024x500.png');
}

// ---------- Logos vectoriels finaux (texte en tracés) ----------
function finalLogo(mode) {
  const g = geometry(V);
  const { body } = symbolBody(V, mode);
  const m = MODES[mode];
  const h = g.maxY - g.minY;
  const pad = h * 0.08;
  const size = h * 0.5;
  const x = g.maxX + h * 0.16;
  const baseline = g.minY + h * 0.5 + size * 0.36;
  const w = textWidth(BOLD, 'PasseRyder', size);
  const vbX = g.minX - pad, vbY = g.minY - pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vbX)} ${f(vbY)} ${f(x + w + pad - vbX)} ${f(h + 2 * pad)}">`
    + body + textPaths(BOLD, [['Passe', m.text1], ['Ryder', m.text2]], x, baseline, size) + `</svg>\n`;
}
writeFileSync(join(HERE, 'passeryder-logo.svg'), finalLogo('clair'));
writeFileSync(join(HERE, 'passeryder-logo-sombre.svg'), finalLogo('sombre'));
writeFileSync(join(HERE, 'passeryder-symbole.svg'), iconSvg({ size: 512, mode: 'clair', radiusFrac: 0.48 }) + '\n');
writeFileSync(join(HERE, 'passeryder-icone.svg'), iconSvg({ size: 512, bg: BLUE, mode: 'bleu', radiusFrac: 0.33 }) + '\n');
console.log('✓ branding/passeryder-logo(-sombre).svg, passeryder-symbole.svg, passeryder-icone.svg');
