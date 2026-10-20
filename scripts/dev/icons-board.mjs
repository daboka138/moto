// Planche avant / après des icônes de la carte (note 32) : signalements, spots, parkings moto, feux,
// zones de danger, sur fond de carte clair et sombre, en taille carte (32 px) et grille (64 px).
// Usage : npm i --no-save puppeteer-core, puis
//   node --import ./scripts/dev/register.mjs scripts/dev/icons-board.mjs [capture.png]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = process.argv[2] || join(ROOT, 'icons-board.png');
const I = await import(pathToFileURL(join(ROOT, 'src/constants/map-icons.ts')).href);
const theme = readFileSync(join(ROOT, 'src/constants/theme.tsx'), 'utf8');
const block = theme.slice(theme.indexOf('export const MapIconColors'));
const P = Object.fromEntries([...block.slice(0, block.indexOf('};')).matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
P.ink = theme.match(/SIGN_INK = '([^']+)'/)[1];

// ---------- Avant (dessin de la note 30 : panneaux + émojis) ----------
const OLD_SIGNS = {
  accident: ['triangle', '#DC2626', '#FFFFFF', '💥'],
  danger: ['triangle', '#FFFFFF', '#DC2626', '!'],
  gravel: ['triangle', '#FACC15', '#DC2626', '🪨'],
  oil: ['triangle', '#FACC15', '#DC2626', '🛢️'],
  roadworks: ['triangle', '#FACC15', '#DC2626', '🚧'],
  object: ['triangle', '#FB923C', '#FFFFFF', '📦'],
  animal: ['triangle', '#FFFFFF', '#DC2626', '🦌'],
  traffic_jam: ['diamond', '#F97316', '#FFFFFF', '🚗'],
  stopped_vehicle: ['diamond', '#FACC15', '#18181B', '🚙'],
};
const oldSign = ([shape, fill, stroke, glyph]) =>
  `<svg viewBox="0 0 46 46"><path d="${shape === 'diamond' ? 'M23 2 L44 23 L23 44 L2 23 Z' : 'M23 3 L44 41 L2 41 Z'}" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>` +
  `<text x="23" y="${shape === 'diamond' ? 30 : 35}" font-size="${glyph === '!' ? 24 : 17}" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="#18181B">${glyph}</text></svg>`;
const OLD_PLACES = { biker_cafe: '☕', viewpoint: '🏞️', road: '🛣️', fuel: '⛽', garage: '🔧', parking: '🅿️' };
const oldPin = (txt, bg, extra = '') =>
  `<div style="min-width:32px;height:32px;border-radius:16px;border:2px solid #fff;background:${bg};color:#fff;font:700 15px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35);box-sizing:border-box;${extra}">${txt}</div>`;
const OLD_SIGNAL =
  '<svg viewBox="0 0 12 22" style="width:12px;height:22px"><rect x="0.5" y="0.5" width="11" height="21" rx="3" fill="#27272A" stroke="#fff"/><circle cx="6" cy="5" r="2.4" fill="#EF4444"/><circle cx="6" cy="11" r="2.4" fill="#F59E0B"/><circle cx="6" cy="17" r="2.4" fill="#22C55E"/></svg>';

const LABELS = {
  danger: 'Danger',
  accident: 'Accident',
  gravel: 'Gravillons',
  oil: 'Huile / glissant',
  roadworks: 'Travaux',
  object: 'Objet',
  animal: 'Animal',
  traffic_jam: 'Bouchon',
  stopped_vehicle: 'Véhicule arrêté',
};
const PLACES = { biker_cafe: 'Café motard', viewpoint: 'Point de vue', road: 'Belle route', fuel: 'Station', garage: 'Garage', parking: 'Parking (spot)' };

const rows = [
  ...Object.keys(LABELS).map((t) => ({ label: LABELS[t], old: oldSign(OLD_SIGNS[t]), neu: I.reportIconSvg(t, P) })),
  ...Object.keys(PLACES).map((k) => ({ label: PLACES[k], old: oldPin(OLD_PLACES[k], '#EA580C'), neu: I.placeIconSvg(k, P), html: true })),
  {
    label: 'Parking moto OSM',
    old: oldPin('P<span style="font-size:9px;align-self:flex-end;margin-bottom:3px">🏍</span>', '#1D4ED8', 'border-radius:6px;font:900 15px sans-serif;width:30px'),
    neu: I.parkingIconSvg(P),
    html: true,
  },
  { label: 'Feu tricolore', old: OLD_SIGNAL, neu: I.signalIconSvg(P), small: true },
  { label: 'Zone de danger', old: '<span style="font:12px sans-serif;color:#888">(nouveau)</span>', neu: I.zoneIconSvg(P), html: true },
];

const cell = (svg, size, small) =>
  `<div class="ic" style="width:${size}px;height:${size}px">${small ? svg.replace('<svg', `<svg style="height:${size * 0.8}px"`) : svg.replace('<svg', `<svg style="width:${size}px;height:${size}px"`)}</div>`;
const oldCell = (html, size) => `<div class="ic" style="width:${size}px;height:${size}px">${html.startsWith('<svg') ? html.replace('<svg', `<svg style="width:${size}px;height:${size}px"`) : html}</div>`;

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:14px system-ui,sans-serif;background:#fff;color:#18181B}
h1{font-size:20px;margin:16px 20px 4px} p{margin:0 20px 12px;color:#555}
table{border-collapse:collapse;margin:0 20px 20px}
th{font-size:13px;text-align:center;padding:6px 10px;color:#444}
td{padding:6px 10px;text-align:center;vertical-align:middle;border-top:1px solid #eee}
td.l{text-align:left;font-weight:600;white-space:nowrap}
.light{background:#EDE9E0}.dark{background:#2B3440}
.ic{display:inline-flex;align-items:center;justify-content:center}
.ic svg{overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}
.sep{border-left:3px solid #18181B}
</style>
<h1>Icônes de la carte — avant / après (note 32)</h1>
<p>Taille carte (32 px) sur fond de carte clair et sombre, et taille grille de signalement (64 px).</p>
<table><tr><th></th><th colspan="3">Avant</th><th class="sep" colspan="3">Après</th></tr>
<tr><th></th><th>clair</th><th>sombre</th><th>64 px</th><th class="sep">clair</th><th>sombre</th><th>64 px</th></tr>
${rows
  .map(
    (r) => `<tr><td class="l">${r.label}</td>
<td class="light">${oldCell(r.old, 32)}</td><td class="dark">${oldCell(r.old, 32)}</td><td>${oldCell(r.old, 64)}</td>
<td class="light sep">${cell(r.neu, 32, r.small)}</td><td class="dark">${cell(r.neu, 32, r.small)}</td><td>${cell(r.neu, 64, r.small)}</td></tr>`,
  )
  .join('')}
</table>`;

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 400, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(OUT);
