// Outils de dessin communs à export.mjs (icônes) et telecharger.mjs (QR code, affiche).
// Le texte est converti en tracés (opentype.js + Saira de Fontsource, licence OFL) : aucun PNG
// ni SVG final ne dépend d'une police installée.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { BLUE, VARIANTS, f, geometry, symbolBody } from './generate.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
export const BLUE_DARK = '#0284C7'; // ACCENT_DARK de src/constants/theme.tsx
export const V = VARIANTS.find((v) => v.id === 'b');

export const loadFont = (weight) => {
  const buf = readFileSync(join(HERE, `node_modules/@fontsource/saira/files/saira-latin-${weight}-normal.woff`));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
export const BOLD = loadFont(700);
export const MEDIUM = loadFont(500);

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
export function textPaths(font, segments, x, baseline, size) {
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
export const textWidth = (font, str, size) => font.getAdvanceWidth(str, size);

// Symbole centré dans un carré de `size`, mis à l'échelle pour que son point le plus éloigné
// du centre soit à radiusFrac × size (zones de sécurité des icônes rondes / adaptatives).
export function placedSymbol(mode, cx, cy, radius) {
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

export function iconSvg({ size, bg = null, shape = 'square', mode = 'bleu', radiusFrac }) {
  let back = '';
  if (bg && shape === 'square') back = `<rect width="${size}" height="${size}" fill="${bg}"/>`;
  if (bg && shape === 'rounded') back = `<rect width="${size}" height="${size}" rx="${f(size * 0.22)}" fill="${bg}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${back}${placedSymbol(mode, size / 2, size / 2, size * radiusFrac)}</svg>`;
}

export function png(svg, out) {
  const data = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  writeFileSync(join(ROOT, out), data);
  console.log('✓', out);
}

export { BLUE };
