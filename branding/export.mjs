// Exporte la variante retenue (B · Évidé) vers toutes les icônes de l'app, du web et du store.
// Usage : cd branding && npm install && node export.mjs
// Le texte est converti en tracés (opentype.js + Saira de Fontsource, licence OFL) : aucun PNG
// ni SVG final ne dépend d'une police installée.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { BLUE, INK, WHITE, MODES, VARIANTS, f, geometry, symbolBody } from './generate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BLUE_DARK = '#0284C7'; // ACCENT_DARK de src/constants/theme.tsx
const V = VARIANTS.find((v) => v.id === 'b');
MODES.mono = { arms: WHITE, pin: WHITE }; // icône monochrome Android / notifications (seul l'alpha compte)

const loadFont = (weight) => {
  const buf = readFileSync(join(HERE, `node_modules/@fontsource/saira/files/saira-latin-${weight}-normal.woff`));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const BOLD = loadFont(700);
const MEDIUM = loadFont(500);

// Texte → <path>, segments de couleurs différentes à la suite.
// Données SVG écrites ici : Path.toPathData d'opentype.js écrit parfois « NaN » (arrondi des flottants).
const n2 = (v) => (Math.round(v * 100) / 100).toString();
function pathData(path) {
  return path.commands.map((c) => {
    if (c.type === 'M' || c.type === 'L') return `${c.type}${n2(c.x)} ${n2(c.y)}`;
    if (c.type === 'Q') return `Q${n2(c.x1)} ${n2(c.y1)} ${n2(c.x)} ${n2(c.y)}`;
    if (c.type === 'C') return `C${n2(c.x1)} ${n2(c.y1)} ${n2(c.x2)} ${n2(c.y2)} ${n2(c.x)} ${n2(c.y)}`;
    return 'Z';
  }).join('');
}

// Glyphes placés un par un, avec le crénage
function textPaths(font, segments, x, baseline, size) {
  const scale = size / font.unitsPerEm;
  let cx = x;
  let prev = null;
  return segments.map(([str, color]) => {
    let d = '';
    for (const glyph of font.stringToGlyphs(str)) {
      const kern = prev ? font.getKerningValue(prev, glyph) : 0;
      if (Number.isFinite(kern)) cx += kern * scale;
      d += pathData(glyph.getPath(cx, baseline, size));
      cx += glyph.advanceWidth * scale;
      prev = glyph;
    }
    if (d.includes('NaN')) throw new Error(`Tracé invalide pour « ${str} »`);
    return `<path d="${d}" fill="${color}"/>`;
  }).join('');
}
const textWidth = (font, str, size) => font.getAdvanceWidth(str, size);

// Symbole centré dans un carré de `size`, mis à l'échelle pour que son point le plus éloigné
// du centre soit à radiusFrac × size (zones de sécurité des icônes rondes / adaptatives).
function placedSymbol(mode, cx, cy, radius) {
  const g = geometry(V);
  const { body } = symbolBody(V, mode);
  const mx = (g.minX + g.maxX) / 2, my = (g.minY + g.maxY) / 2;
  const o = V.sw / 2;
  const far = Math.max(
    Math.hypot(g.tipR[0] - mx, g.tipR[1] - my) + o,
    Math.hypot(0 - mx, g.maxY - my),
    Math.hypot(0 - mx, 0 - my) + V.R,
  );
  const s = radius / far;
  return `<g transform="translate(${f(cx)} ${f(cy)}) scale(${f(s * 1000) / 1000}) translate(${f(-mx)} ${f(-my)})">${body}</g>`;
}

function iconSvg({ size, bg = null, shape = 'square', mode = 'bleu', radiusFrac }) {
  let back = '';
  if (bg && shape === 'square') back = `<rect width="${size}" height="${size}" fill="${bg}"/>`;
  if (bg && shape === 'rounded') back = `<rect width="${size}" height="${size}" rx="${f(size * 0.22)}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${back}${placedSymbol(mode, size / 2, size / 2, size * radiusFrac)}</svg>`;
}

function png(svg, out) {
  const data = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  writeFileSync(join(ROOT, out), data);
  console.log('✓', out);
}

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
