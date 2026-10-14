// Génère les variantes du logo « V-épingle » + apercu.html
// Usage : node branding/generate.mjs
// Le V (salut motard) : ses deux branches sont les tangentes de la tête d'une épingle GPS ;
// la pointe du V est la pointe de l'épingle.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
export const BLUE = '#0EA5E9'; // ACCENT de src/constants/theme.tsx
export const INK = '#18181B';
export const WHITE = '#FFFFFF';
const FONT = 'Saira'; // Google Fonts, licence SIL Open Font License

// Palettes : arms = branches du V, pin = épingle
export const MODES = {
  clair: { arms: INK, pin: BLUE, text1: INK, text2: BLUE },
  sombre: { arms: WHITE, pin: BLUE, text1: WHITE, text2: BLUE },
  bleu: { arms: WHITE, pin: INK, text1: WHITE, text2: INK }, // sur fond bleu (icône d'app)
};

export const VARIANTS = [
  { id: 'a', name: 'A · Plein', desc: 'Traits épais, V serré, épingle pleine', alpha: 21, R: 16, sw: 11, arm: 64, style: 'solid' },
  { id: 'b', name: 'B · Évidé', desc: 'Traits épais, V serré, épingle évidée', alpha: 21, R: 16, sw: 11, arm: 64, style: 'hollow' },
  { id: 'c', name: 'C · Ouvert', desc: 'Traits fins, V ouvert, épingle évidée', alpha: 27, R: 17, sw: 7.5, arm: 66, style: 'hollow' },
  { id: 'd', name: 'D · Monoline', desc: 'Traits moyens, tête en anneau', alpha: 23, R: 16, sw: 8.5, arm: 64, style: 'ring' },
];

export const f = (n) => Math.round(n * 100) / 100;

export function geometry(v) {
  const a = (v.alpha * Math.PI) / 180;
  const s = Math.sin(a), c = Math.cos(a);
  const o = v.sw / 2;
  const d = v.R / s; // centre de la tête (0,0) → pointe de l'épingle (0,d)
  const tl = Math.sqrt(d * d - v.R * v.R);
  const tL = [-tl * s, d - tl * c]; // points de tangence
  const tR = [tl * s, d - tl * c];
  const P2 = [0, d + o / s]; // sommet du V (axe des branches décalé vers l'extérieur)
  const tipL = [P2[0] - v.arm * s, P2[1] - v.arm * c];
  const tipR = [P2[0] + v.arm * s, P2[1] - v.arm * c];
  const bottom = P2[1] + o / s; // pointe du raccord en onglet
  const minX = tipL[0] - o, maxX = tipR[0] + o;
  const minY = Math.min(tipL[1] - o, -v.R), maxY = bottom;
  return { d, tL, tR, P2, tipL, tipR, minX, maxX, minY, maxY };
}

export function symbolBody(v, mode) {
  const g = geometry(v);
  const m = MODES[mode];
  const parts = [];
  if (v.style === 'ring') {
    parts.push(`<circle cx="0" cy="0" r="${f(v.R - v.sw / 2)}" fill="none" stroke="${m.pin}" stroke-width="${f(v.sw)}"/>`);
  } else {
    let d = `M0 ${f(g.d)} L${f(g.tL[0])} ${f(g.tL[1])} A${v.R} ${v.R} 0 1 1 ${f(g.tR[0])} ${f(g.tR[1])} Z`;
    if (v.style === 'hollow') {
      const h = v.R * 0.42;
      d += ` M${f(-h)} 0 A${f(h)} ${f(h)} 0 1 0 ${f(h)} 0 A${f(h)} ${f(h)} 0 1 0 ${f(-h)} 0 Z`;
    }
    parts.push(`<path d="${d}" fill="${m.pin}" fill-rule="evenodd"/>`);
  }
  parts.push(
    `<path d="M${f(g.tipL[0])} ${f(g.tipL[1])} L${f(g.P2[0])} ${f(g.P2[1])} L${f(g.tipR[0])} ${f(g.tipR[1])}" fill="none" stroke="${m.arms}" stroke-width="${f(v.sw)}" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="6"/>`,
  );
  return { g, body: parts.join('') };
}

export function symbolSvg(v, mode) {
  const { g, body } = symbolBody(v, mode);
  const w = g.maxX - g.minX, h = g.maxY - g.minY;
  const side = Math.max(w, h) * 1.12;
  const cx = (g.minX + g.maxX) / 2, cy = (g.minY + g.maxY) / 2;
  const vb = `${f(cx - side / 2)} ${f(cy - side / 2)} ${f(side)} ${f(side)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="512" height="512">${body}</svg>`;
}

function logoSvg(v, mode) {
  const { g, body } = symbolBody(v, mode);
  const m = MODES[mode];
  const h = g.maxY - g.minY;
  const pad = h * 0.08;
  const fontSize = h * 0.5;
  const textX = g.maxX + h * 0.16;
  const textW = fontSize * 5.7;
  const vbX = g.minX - pad, vbY = g.minY - pad;
  const vbW = textX + textW + pad - vbX, vbH = h + 2 * pad;
  const baseline = g.minY + h * 0.5 + fontSize * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vbX)} ${f(vbY)} ${f(vbW)} ${f(vbH)}" height="160">`
    + `<style>@import url('https://fonts.googleapis.com/css2?family=${FONT}:wght@700&amp;display=swap');</style>`
    + body
    + `<text x="${f(textX)}" y="${f(baseline)}" font-family="${FONT}, 'Segoe UI', Arial, sans-serif" font-weight="700" font-size="${f(fontSize)}" letter-spacing="${f(-fontSize * 0.01)}">`
    + `<tspan fill="${m.text1}">Passe</tspan><tspan fill="${m.text2}">Ryder</tspan></text></svg>`;
}

function main() {
const files = {};
for (const v of VARIANTS) {
  for (const mode of ['clair', 'sombre']) {
    const suffix = mode === 'clair' ? '' : '-sombre';
    files[`variante-${v.id}${suffix}.svg`] = symbolSvg(v, mode);
    files[`variante-${v.id}-logo${suffix}.svg`] = logoSvg(v, mode);
  }
  files[`variante-${v.id}-fond-bleu.svg`] = symbolSvg(v, 'bleu');
}
for (const [name, svg] of Object.entries(files)) writeFileSync(join(OUT, name), svg + '\n');

// ---------- apercu.html ----------
const inline = (svg, cls = '') => svg.replace('<svg ', `<svg class="${cls}" `).replace(/ width="512" height="512"| height="160"/, '');

const cards = VARIANTS.map((v) => `
<section class="variant">
  <header><h2>${v.name}</h2><p>${v.desc}</p></header>
  <div class="row">
    <div class="tile light big">${inline(symbolSvg(v, 'clair'))}</div>
    <div class="tile dark big">${inline(symbolSvg(v, 'sombre'))}</div>
    <div class="tile accent big">${inline(symbolSvg(v, 'bleu'))}</div>
  </div>
  <div class="row">
    <div class="tile light wide">${inline(logoSvg(v, 'clair'))}</div>
    <div class="tile dark wide">${inline(logoSvg(v, 'sombre'))}</div>
  </div>
  <div class="row small">
    <span class="label">48 px</span>
    <div class="s48 light">${inline(symbolSvg(v, 'clair'))}</div>
    <div class="s48 dark">${inline(symbolSvg(v, 'sombre'))}</div>
    <div class="s48 round accent">${inline(symbolSvg(v, 'bleu'), 'pad')}</div>
    <span class="label">24 px</span>
    <div class="s24 light">${inline(symbolSvg(v, 'clair'))}</div>
    <div class="s24 dark">${inline(symbolSvg(v, 'sombre'))}</div>
    <span class="label">16 px</span>
    <div class="s16 light">${inline(symbolSvg(v, 'clair'))}</div>
  </div>
</section>`).join('\n');

const fakeApps = ['Photos', 'Maps', 'Agenda', 'Météo', 'Musique', 'Notes'];
const phones = VARIANTS.map((v) => `
<div class="phone">
  <div class="status"><span>12:30</span><span>▲ ● ▮</span></div>
  <div class="grid">
    ${fakeApps.slice(0, 3).map((n, i) => `<div class="app"><div class="ic fake f${i}"></div><span>${n}</span></div>`).join('')}
    <div class="app"><div class="ic accent">${inline(symbolSvg(v, 'bleu'), 'pad')}</div><span>PasseRyder</span></div>
    ${fakeApps.slice(3).map((n, i) => `<div class="app"><div class="ic fake f${i + 3}"></div><span>${n}</span></div>`).join('')}
    <div class="app"><div class="ic light">${inline(symbolSvg(v, 'clair'), 'pad')}</div><span>PasseRyder</span></div>
  </div>
  <p class="cap">${v.name}</p>
</div>`).join('\n');

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Logo PasseRyder</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=${FONT}:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --blue: ${BLUE}; --ink: ${INK}; --bg: #F4F4F5; --card: #FFFFFF; --muted: #71717A; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--ink); font-family: '${FONT}', 'Segoe UI', sans-serif; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .intro { color: var(--muted); margin: 0 0 24px; }
  .variant { background: var(--card); border-radius: 16px; padding: 20px; margin-bottom: 24px; max-width: 1100px; }
  .variant header { display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
  .variant h2 { margin: 0; font-size: 22px; } .variant header p { margin: 0; color: var(--muted); }
  .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; align-items: center; }
  .tile { border-radius: 12px; display: flex; align-items: center; justify-content: center; }
  .tile.big { width: 200px; height: 200px; } .tile.big svg { width: 150px; height: 150px; }
  .tile.wide { flex: 1 1 320px; height: 120px; padding: 16px; } .tile.wide svg { height: 80px; max-width: 100%; }
  .light { background: #FFFFFF; border: 1px solid #E4E4E7; } .dark { background: var(--ink); } .accent { background: var(--blue); }
  .small .label { color: var(--muted); font-size: 13px; margin-left: 8px; }
  .s48, .s24, .s16 { display: flex; align-items: center; justify-content: center; border-radius: 8px; padding: 6px; }
  .s48 svg { width: 48px; height: 48px; } .s24 svg { width: 24px; height: 24px; } .s16 svg { width: 16px; height: 16px; }
  .round { border-radius: 50%; width: 60px; height: 60px; } .round svg.pad { width: 38px; height: 38px; }
  h2.section { max-width: 1100px; margin: 40px 0 16px; }
  .phones { display: flex; gap: 20px; flex-wrap: wrap; }
  .phone { width: 260px; border-radius: 28px; padding: 14px 14px 18px; color: #fff;
    background: linear-gradient(160deg, #1e3a5f, #0f172a 55%, #3b2f4a); border: 6px solid #000; }
  .status { display: flex; justify-content: space-between; font-size: 12px; opacity: .85; margin-bottom: 26px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px 6px; }
  .app { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 10.5px; font-family: Roboto, 'Segoe UI', sans-serif; }
  .ic { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .ic svg.pad { width: 32px; height: 32px; }
  .fake.f0 { background: linear-gradient(135deg,#f59e0b,#ef4444); } .fake.f1 { background: #34a853; } .fake.f2 { background: #4285f4; }
  .fake.f3 { background: linear-gradient(#60a5fa,#facc15); } .fake.f4 { background: #ec4899; } .fake.f5 { background: #fbbf24; }
  .cap { text-align: center; margin: 22px 0 0; font-size: 14px; opacity: .9; }
  @media (max-width: 520px) { .tile.big { width: calc(33% - 8px); height: auto; aspect-ratio: 1; } .tile.big svg { width: 75%; height: 75%; } }
</style>
</head>
<body>
<h1>Logo PasseRyder · « V-épingle »</h1>
<p class="intro">Le V du salut motard dont la pointe devient une épingle GPS. 4 variantes : fond clair, fond sombre, fond bleu (icône d'app), avec le nom, et en petit. Police : ${FONT} (Google Fonts, licence libre OFL).</p>
${cards}
<h2 class="section">Sur un écran d'accueil Android (icônes rondes)</h2>
<div class="phones">${phones}</div>
</body>
</html>
`;
writeFileSync(join(OUT, 'apercu.html'), html);
console.log(`${Object.keys(files).length} SVG + apercu.html`);
}

// Exécuté directement (pas importé par export.mjs)
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
