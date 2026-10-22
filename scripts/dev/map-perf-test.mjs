// Banc de fluidité des pages de carte (Leaflet 2D, MapLibre 3D) : version du disque comparée à une
// version git (par défaut HEAD), dans Edge / Chrome headless (WebGL logiciel : chiffres relatifs).
// Scénarios de 8 s : en roulant (positions toutes les 0,5 s), à l'arrêt en navigation, faisceau de la
// boussole (je tourne sur ma chaise à 45°/s). Mesures : images/s, temps du fil principal de la page
// (CDP TaskDuration) en ms par seconde, messages de l'app vers la page par seconde, et pour le
// faisceau : nombre d'angles différents affichés par seconde (fluidité).
// Usage : npm i --no-save puppeteer-core, puis
//   node --env-file=.env --import ./scripts/dev/register.mjs scripts/dev/map-perf-test.mjs [ref-git]
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(import.meta.dirname, '..', '..');
const REF = process.argv[2] || 'HEAD';
const read = (file, ref) => (ref ? execSync(`git show ${ref}:${file}`, { cwd: ROOT, encoding: 'utf8' }) : readFileSync(join(ROOT, file), 'utf8'));
const tpl = (src) => src.slice(src.indexOf('return `<!DOCTYPE html>') + 8, src.indexOf('</html>`;') + 7);
const { TILES, OSM_COPYRIGHT } = await import(pathToFileURL(join(ROOT, 'src/components/map-style.ts')).href);
const { CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } = await import(pathToFileURL(join(ROOT, 'src/lib/map-cluster.ts')).href);
const Colors = new Proxy({}, { get: (_, k) => (k === 'me' ? '#1D9BF0' : k === 'white' ? '#ffffff' : '#888888') });
const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;

// mapCss de la même version que la page (le faisceau y est défini)
async function mapCssOf(ref) {
  const src = read('src/components/map-style.ts', ref).replace(/import type[^\n]*\n/g, '').replace(/: Palette/g, '');
  const mod = await import('data:text/javascript,' + encodeURIComponent(src.replace(/process\.env\.EXPO_PUBLIC_MAPTILER_KEY \?\? ''/, "''")));
  return mod.mapCss;
}
async function pages(ref) {
  const mapCss = await mapCssOf(ref);
  const leaflet = new Function('Colors', 'tilesUrl', 'TILES', 'OSM_COPYRIGHT', 'mapCss', 'CLUSTER_JS', 'CLUSTER_MAX_ZOOM', 'CLUSTER_RADIUS_PX', 'return `' + tpl(read('src/components/leaflet-map-html.ts', ref)) + '`')(
    Colors, TILES.light + key, TILES, OSM_COPYRIGHT, mapCss, CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX,
  );
  const glSrc = read('src/components/nav-map-gl-html.ts', ref);
  const c = Object.fromEntries([...glSrc.matchAll(/export const (NAV_PITCH|GL_ZOOM_OFFSET|MAPLIBRE_VERSION) = '?([-\d.]+)'?;/g)].map((m) => [m[1], m[2]]));
  const gl = new Function('Colors', 'styleUrl', 'sky', 'mapCss', 'MAPLIBRE', 'NAV_PITCH', 'GL_ZOOM_OFFSET', 'return `' + tpl(glSrc) + '`')(
    Colors, 'https://api.maptiler.com/maps/streets-v2/style.json?key=' + encodeURIComponent(key), { sky: '#BFE3FF', horizon: '#EAF6FF' }, mapCss,
    `https://unpkg.com/maplibre-gl@${c.MAPLIBRE_VERSION}/dist/maplibre-gl`, c.NAV_PITCH, c.GL_ZOOM_OFFSET,
  );
  return { leaflet, gl };
}

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const route = [];
for (let i = 0; i <= 300; i++) route.push([43.3 + i * 0.00012, 5.38 + Math.sin(i / 30) * 0.003]);
const bearing = (a, b) => ((Math.atan2((b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), b[0] - a[0]) * 180) / Math.PI + 360) % 360;

async function run(html, scenario, isNew) {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 800, isMobile: true, hasTouch: true });
  const shim = '<script>window.ReactNativeWebView = { postMessage: function (m) { (window.__msgs = window.__msgs || []).push(JSON.parse(m)); } };</script>';
  await page.setContent(html.replace('<head>', '<head>' + shim), { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 150 && !(await page.evaluate(() => (window.__msgs || []).some((m) => m.type === 'ready'))); i++) await wait(100);
  await page.evaluate((r) => { window.setRoutes([{ id: 'nav', points: r }]); window.setNavZoom && window.setNavZoom(17); }, route);
  let sent = 0;
  const call = async (code) => { sent++; await page.evaluate(code); };
  const fix = (k, nav) => `window.setPosition({ latitude: ${route[k][0]}, longitude: ${route[k][1]}, accuracy: 5, heading: ${bearing(route[k], route[k + 1]).toFixed(1)} }, true, ${nav})`;
  // Mise en place, puis mesure
  await call(fix(10, scenario !== 'faisceau'));
  await wait(2500);
  sent = 0;
  await page.evaluate(() => {
    window.__frames = 0;
    window.__angles = new Set();
    window.__perSec = [];
    (function tick() {
      window.__frames++;
      const b = document.querySelector('.me .beam');
      if (b) window.__angles.add(getComputedStyle(b).transform + getComputedStyle(b).display);
      requestAnimationFrame(tick);
    })();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])).TaskDuration;
  const task0 = await metric();
  const t0 = Date.now();
  const SECONDS = 8;
  if (scenario === 'roulant') {
    for (let i = 0; i < SECONDS * 2; i++) {
      const k = 12 + i * 2;
      await call(fix(k, true));
      // Avant : la carte de l'app envoyait aussi le cap dans un 2e message (setHeading)
      if (!isNew) await call(`window.setHeading(${bearing(route[k], route[k + 1]).toFixed(1)})`);
      await wait(500);
    }
  } else if (scenario === 'arret') {
    for (let i = 0; i < SECONDS * 2; i++) {
      await call(fix(10, true));
      await wait(500);
    }
  } else {
    // Je tourne sur ma chaise à 45°/s. Avant : faisceau envoyé par paliers (≥ 15°, ~2 fois/s, re-rendu
    // React à chaque fois) ; après : boussole lissée envoyée ≈ 15 fois/s, animée par la page
    let deg = 0;
    for (let ms = 0; ms < SECONDS * 1000; ms += 66) {
      deg = (ms / 1000) * 45;
      if (isNew) await call(`window.setCompass(${deg.toFixed(1)}, 'beam')`);
      else if (ms % 528 < 66) await call(`window.setBeam(${deg.toFixed(1)})`);
      await wait(66);
    }
  }
  const s = (Date.now() - t0) / 1000;
  const task1 = await metric();
  const res = await page.evaluate(() => ({ frames: window.__frames, angles: window.__angles.size }));
  await page.close();
  return {
    fps: Math.round(res.frames / s),
    filPrincipal: `${Math.round(((task1 - task0) * 1000) / s)} ms/s`,
    messages: +(sent / s).toFixed(1),
    ...(scenario === 'faisceau' ? { anglesParSeconde: Math.round(res.angles / s) } : {}),
  };
}

const before = await pages(REF);
const after = await pages(null);
const rows = {};
for (const [name, key2] of [['2D Leaflet', 'leaflet'], ['3D MapLibre', 'gl']]) {
  for (const sc of ['roulant', 'arret', 'faisceau']) {
    if (sc === 'faisceau' && key2 === 'gl') continue;
    rows[`${name} · ${sc} · avant (${REF})`] = await run(before[key2], sc, false);
    rows[`${name} · ${sc} · après`] = await run(after[key2], sc, true);
  }
}
console.table(rows);
await browser.close();
