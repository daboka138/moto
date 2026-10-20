// Banc : feux tricolores (lib/traffic-signals.ts) en vrai, en LECTURE seule (Overpass, tuiles MapTiler).
// 1) même requête Overpass que l'app sur des cases de Marseille (Prado, Castellane, Canebière), serveur par
//    serveur (temps + nombre de feux), puis regroupement par carrefour (mergeSignals de l'app) ;
// 2) countSignalsOnRoute (code de l'app, mêmes serveurs) sur l'avenue du Prado ;
// 3) capture de la page Leaflet de l'app (leaflet-map.tsx) zoom 16 et 17, carte claire et sombre.
// Usage : npm i --no-save puppeteer-core, puis
//   node --import ./scripts/dev/register.mjs scripts/dev/signals-test.mjs [dossier des captures]
// (BROWSER=chemin de chrome.exe / msedge.exe si besoin ; clé MapTiler lue dans .env)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// pois.ts importe Platform de react-native : remplacé ici
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(s, c, n) { return s === 'react-native' ? { url: 'stub:rn', shortCircuit: true } : n(s, c); }
export async function load(u, c, n) { return u === 'stub:rn' ? { format: 'module', source: 'export const Platform = { OS: "android" };', shortCircuit: true } : n(u, c); }`),
);
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = process.argv[2] || ROOT;
const { mergeSignals, countSignalsOnRoute } = await import(pathToFileURL(join(ROOT, 'src/lib/traffic-signals.ts')).href);
const signalsSrc = readFileSync(join(ROOT, 'src/lib/traffic-signals.ts'), 'utf8');
const SERVERS = [...signalsSrc.matchAll(/'(https:\/\/[^']+interpreter)'/g)].map((m) => m[1]);
const UA = 'PasseRyder/1.0 (https://passeryder.fr)';

// Cases de 0,05° comme l'app : Prado / Castellane / Canebière tiennent dans 43.25-43.30 × 5.35-5.40
const BBOX = '43.250,5.350,43.300,5.400';
const QUERY = `[out:json][timeout:25];node["highway"="traffic_signals"](${BBOX});out skel qt 5000;`;
let points = null;
for (const server of SERVERS) {
  const t0 = Date.now();
  try {
    const res = await fetch(server, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: `data=${encodeURIComponent(QUERY)}`,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
    const els = JSON.parse(text).elements ?? [];
    console.log(`${server} : ${els.length} feux en ${Date.now() - t0} ms`);
    points ??= els.map((e) => ({ latitude: e.lat, longitude: e.lon }));
  } catch (e) {
    console.log(`${server} : ÉCHEC en ${Date.now() - t0} ms (${e.message})`);
  }
}
if (!points) throw new Error('Aucun serveur Overpass ne répond');
const merged = mergeSignals(points);
console.log(`→ ${points.length} feux OSM = ${merged.length} carrefours`);

// Avenue du Prado, du rond-point du Prado à Castellane (points approchés le long de l'avenue)
const prado = [
  [43.2606, 5.3821], [43.2652, 5.3843], [43.2702, 5.3864], [43.2750, 5.3886], [43.2800, 5.3893], [43.2858, 5.3834],
].map(([latitude, longitude]) => ({ latitude, longitude }));
const t1 = Date.now();
const onRoute = await countSignalsOnRoute({ points: prado, distanceM: 3200 });
console.log(`countSignalsOnRoute (Prado → Castellane) : ${onRoute} carrefours à feux en ${Date.now() - t1} ms`);

// ---------- Captures ----------
const puppeteer = (await import('puppeteer-core')).default;
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const key = env.match(/^EXPO_PUBLIC_MAPTILER_KEY=(.*)$/m)?.[1]?.trim() ?? '';
const src = readFileSync(join(ROOT, 'src/components/leaflet-map.tsx'), 'utf8');
const tpl = src.slice(src.indexOf('return `<!DOCTYPE html>') + 8, src.indexOf('</html>`;') + 7);
const { mapCss, TILES, OSM_COPYRIGHT } = await import(pathToFileURL(join(ROOT, 'src/components/map-style.ts')).href);
const { CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } = await import(pathToFileURL(join(ROOT, 'src/lib/map-cluster.ts')).href);
const theme = readFileSync(join(ROOT, 'src/constants/theme.tsx'), 'utf8');
const palette = (dark) => {
  const block = theme.split(/^const |^export const /m).find((b) => b.startsWith(dark ? 'DarkColors' : 'LightColors')) ?? theme;
  const pick = (k) => block.match(new RegExp(`\\b${k}: '([^']+)'`))?.[1] ?? theme.match(new RegExp(`\\b${k}: '([^']+)'`))?.[1];
  return new Proxy({}, { get: (_, k) => (typeof k === 'string' && pick(k)) || '#888888' });
};

const { signalIconSvg } = await import(pathToFileURL(join(ROOT, 'src/constants/map-icons.ts')).href);
const iconBlock = theme.slice(theme.indexOf('export const MapIconColors'));
const IP = Object.fromEntries([...iconBlock.slice(0, iconBlock.indexOf('};')).matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
const signalSvg = signalIconSvg(IP);
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const views = [
  { name: 'castellane-z16', center: [43.2858, 5.3834], zoom: 16 },
  { name: 'prado-z17', center: [43.2728, 5.3876], zoom: 17 },
  { name: 'canebiere-z17', center: [43.2975, 5.3800], zoom: 17 },
];
for (const dark of [false, true]) {
  const Colors = palette(dark);
  const tilesUrl = key ? (dark ? TILES.dark : TILES.light) + encodeURIComponent(key) : '';
  const html = new Function('Colors', 'tilesUrl', 'TILES', 'OSM_COPYRIGHT', 'mapCss', 'SIGN_INK', 'CLUSTER_JS', 'CLUSTER_MAX_ZOOM', 'CLUSTER_RADIUS_PX', 'return `' + tpl + '`')(
    Colors, tilesUrl, TILES, OSM_COPYRIGHT, mapCss, '#000', CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX,
  );
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 760, deviceScaleFactor: 2 });
  await page.setExtraHTTPHeaders({ Referer: 'https://app.passeryder.fr/' });
  page.on('pageerror', (e) => console.log('[erreur page]', e.message));
  await page.setContent(html, { waitUntil: 'networkidle0' });
  for (const v of views) {
    await page.evaluate(
      (v, pins) => {
        map.setView(v.center, v.zoom, { animate: false });
        window.setPins(pins);
      },
      v,
      merged.map((p, i) => ({ id: 'signal:' + i, kind: 'signal', label: '', icon: { svg: signalSvg, width: 14, height: 26 }, latitude: p.latitude, longitude: p.longitude })),
    );
    await new Promise((r) => setTimeout(r, 2500));
    const shown = await page.evaluate(() => {
      const b = map.getBounds();
      return [...document.querySelectorAll('.mapicon')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && b && r.top > 0 && r.top < innerHeight && r.left > 0 && r.left < innerWidth;
      }).length;
    });
    const file = join(OUT, `feux-${v.name}-${dark ? 'sombre' : 'clair'}.png`);
    await page.screenshot({ path: file });
    console.log(`${file} : ${shown} feux visibles à l'écran`);
  }
  await page.close();
}
await browser.close();
