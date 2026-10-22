// Banc : page MapLibre de la navigation 3D (src/components/nav-map-gl-html.ts) dans Edge / Chrome headless
// (WebGL logiciel), 360×640 et 412×915. Trajet simulé (positions toutes les 0,5 s), tracé, repères
// SVG, amis ; mesure des images par seconde et capture. Repli : sans WebGL, message « fallback ».
// Usage : npm i --no-save puppeteer-core, puis
//   node --env-file=.env --import ./scripts/dev/register.mjs scripts/dev/nav-gl-test.mjs [dossier-captures]
// (BROWSER=chemin de chrome.exe / msedge.exe si besoin). Tuiles MapTiler réelles (clé du .env).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = process.argv[2] || join(ROOT, 'scripts/dev/out');
mkdirSync(OUT, { recursive: true });
const src = readFileSync(join(ROOT, 'src/components/nav-map-gl-html.ts'), 'utf8');
const tpl = src.slice(src.indexOf('return `<!DOCTYPE html>') + 8, src.indexOf('</html>`;') + 7);
const consts = Object.fromEntries([...src.matchAll(/export const (NAV_PITCH|GL_ZOOM_OFFSET|MAPLIBRE_VERSION) = '?([-\d.]+)'?;/g)].map((m) => [m[1], m[2]]));
const { mapCss } = await import(pathToFileURL(join(ROOT, 'src/components/map-style.ts')).href);
const C = { me: '#1D9BF0', white: '#ffffff', accent: '#1D9BF0', mapBackground: '#e8e8e8', markerShadow: 'rgba(0,0,0,0.3)', danger: '#DC2626', success: '#16A34A', neutral: '#64748B', text: '#111', textMuted: '#666', textFaint: '#999', surface: '#fff' };
const Colors = new Proxy(C, { get: (t, k) => t[k] ?? '#888888' });
const key = process.env.EXPO_PUBLIC_MAPTILER_KEY;
const html = (styleUrl) =>
  new Function('Colors', 'styleUrl', 'mapCss', 'MAPLIBRE', 'NAV_PITCH', 'GL_ZOOM_OFFSET', 'return `' + tpl + '`')(
    Colors, styleUrl, mapCss, `https://unpkg.com/maplibre-gl@${consts.MAPLIBRE_VERSION}/dist/maplibre-gl`, consts.NAV_PITCH, consts.GL_ZOOM_OFFSET,
  );

// Trajet : une route sinueuse au nord de Marseille
const route = [];
for (let i = 0; i <= 200; i++) route.push([43.30 + i * 0.00025, 5.38 + Math.sin(i / 18) * 0.004]);
const signal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 30"><rect x="1" y="1" width="12" height="28" rx="4" fill="#222" stroke="#fff" stroke-width="2"/><circle cx="7" cy="8" r="3" fill="#e33"/><circle cx="7" cy="15" r="3" fill="#fb0"/><circle cx="7" cy="22" r="3" fill="#3c3"/></svg>`;
const report = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 36"><path d="M16 34 L4 20 A13 13 0 1 1 28 20 Z" fill="#DC2626" stroke="#fff" stroke-width="2"/><text x="16" y="21" font-size="14" text-anchor="middle" fill="#fff">!</text></svg>`;

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});

async function run(name, w, h, styleUrl, opts = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const msgs = [];
  page.on('pageerror', (e) => console.log('[erreur page]', e.message));
  await page.exposeFunction('__post', (m) => msgs.push(JSON.parse(m)));
  // setContent : pas de evaluateOnNewDocument, le pont est écrit en tête de page
  const shim = `<script>window.ReactNativeWebView = { postMessage: (m) => window.__post(m) };${opts.noWebgl ? 'HTMLCanvasElement.prototype.getContext = function () { return null; };' : ''}</script>`;
  await page.setContent(html(styleUrl).replace('<head>', '<head>' + shim), { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  while (!msgs.some((m) => m.type === 'ready' || m.type === 'fallback') && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100));
  const fb = msgs.find((m) => m.type === 'fallback');
  if (fb) {
    console.log(`${name} : repli Leaflet → « ${fb.reason} »`);
    await page.close();
    return;
  }
  const ready = msgs.find((m) => m.type === 'ready');
  if (!ready) { console.log(name, ': pas prête en 20 s', JSON.stringify(msgs).slice(0, 500)); await page.close(); return; }
  console.log(`${name} : prête en ${Date.now() - t0} ms, WebGL ${ready.gl?.version} (${ready.gl?.renderer || '?'})`);
  await page.evaluate(
    (route, signal, report) => {
      window.setRoutes([{ id: 'nav', points: route }, { id: 'z', points: route.slice(60, 90), color: 'rgba(220,38,38,0.5)', zone: true }]);
      const pins = [];
      for (let i = 10; i < 200; i += 15) pins.push({ id: 's' + i, kind: 'signal', label: '', latitude: route[i][0] + 0.00005, longitude: route[i][1] + 0.00005, icon: { svg: signal, width: 14, height: 30, anchor: 'center' } });
      pins.push({ id: 'r1', kind: 'report', label: '', latitude: route[40][0], longitude: route[40][1], icon: { svg: report, width: 34, height: 38, anchor: 'bottom' } });
      pins.push({ id: 'end', kind: 'end', label: 'B', latitude: route[200][0], longitude: route[200][1] });
      window.setPins(pins);
      window.setMarkers([{ id: 'f1', latitude: route[30][0], longitude: route[30][1] + 0.0003, photoUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', badge: '🚩' }], null);
      window.setNavZoom(17);
    },
    route, signal, report,
  );
  // 12 s de trajet, une position toutes les 0,5 s, en comptant les images
  await page.evaluate(() => {
    window.__frames = 0;
    const tick = () => { window.__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const bearing = (a, b) => (Math.atan2((b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), b[0] - a[0]) * 180) / Math.PI;
  const start = Date.now();
  for (let i = 0; i < 24; i++) {
    const k = 20 + i * 2;
    await page.evaluate((p, h) => window.setPosition({ latitude: p[0], longitude: p[1], accuracy: 5, heading: (h + 360) % 360 }, true, true), route[k], bearing(route[k], route[k + 1]));
    await new Promise((r) => setTimeout(r, 500));
  }
  const fps = (await page.evaluate(() => window.__frames)) / ((Date.now() - start) / 1000);
  const state = await page.evaluate(() => ({ pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()), zoom: +map.getZoom().toFixed(2) }));
  console.log(`  ${Math.round(fps)} images/s (WebGL logiciel, sans GPU), caméra :`, state);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await page.close();
}

const light = 'https://api.maptiler.com/maps/streets-v2/style.json?key=' + encodeURIComponent(key);
const dark = 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key=' + encodeURIComponent(key);
await run('nav3d-360x640', 360, 640, light);
await run('nav3d-412x915-sombre', 412, 915, dark);
await run('sans-webgl', 360, 640, light, { noWebgl: true });
await run('sans-cle', 360, 640, '');
await browser.close();
