// Banc : zones de danger sur de vrais itinéraires (lib/danger-zone-segments.ts), en LECTURE seule.
// Zones : fichier calculé par scripts/danger-zones/build.mjs (dossier temporaire passeryder-baac/zones.json) ;
// itinéraires : OSRM public. Affiche les portions et les annonces, puis capture la page Leaflet de l'app
// (tracé + portions surlignées + triangles). Usage : npm i --no-save puppeteer-core, puis
//   node --import ./scripts/dev/register.mjs scripts/dev/danger-zones-test.mjs [dossier des captures]
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = process.argv[2] || ROOT;
const { zoneSegments, zoneAnnouncement, segmentPoints } = await import(pathToFileURL(join(ROOT, 'src/lib/danger-zone-segments.ts')).href);
const zones = JSON.parse(readFileSync(join(tmpdir(), 'passeryder-baac', 'zones.json'), 'utf8')).map((z, i) => ({
  id: i,
  latitude: z.lat,
  longitude: z.lon,
  radiusM: z.radius,
  road: z.road,
}));

const TRIPS = [
  { name: 'castellane-aubagne', label: 'Castellane → Aubagne (A50)', from: [5.3834, 43.2858], to: [5.5665, 43.2925] },
  { name: 'marseille-aix', label: 'Marseille → Aix-en-Provence (A51)', from: [5.3698, 43.3026], to: [5.4474, 43.5297] },
  { name: 'cassis-gineste', label: 'Marseille → Cassis par la Gineste (D559)', from: [5.4007, 43.2553], to: [5.5376, 43.2148] },
];

async function route([lon1, lat1], [lon2, lat2], extra = '') {
  const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson${extra}`;
  const json = await (await fetch(url)).json();
  const points = json.routes[0].geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const kx = 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    cumulative.push(cumulative[i - 1] + Math.hypot((b.longitude - a.longitude) * kx, (b.latitude - a.latitude) * 110_540));
  }
  return { points, cumulative, distanceM: cumulative.at(-1) };
}

const results = [];
for (const t of TRIPS) {
  const r = await route(t.from, t.to);
  const segs = zoneSegments(r, zones, []);
  console.log(`\n${t.label} : ${(r.distanceM / 1000).toFixed(1)} km, ${segs.length} zones`);
  for (const s of segs)
    console.log(`  km ${(s.fromM / 1000).toFixed(1)} → ${(s.toM / 1000).toFixed(1)} (${s.road}) : « ${zoneAnnouncement(s)} »`);
  results.push({ t, r, segs });
}
console.log(`\nZones en France métropolitaine : ${zones.length}`);

// ---------- Capture ----------
const puppeteer = (await import('puppeteer-core')).default;
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const key = env.match(/^EXPO_PUBLIC_MAPTILER_KEY=(.*)$/m)?.[1]?.trim() ?? '';
const src = readFileSync(join(ROOT, 'src/components/leaflet-map-html.ts'), 'utf8');
const tpl = src.slice(src.indexOf('return `<!DOCTYPE html>') + 8, src.indexOf('</html>`;') + 7);
const { mapCss, TILES, OSM_COPYRIGHT } = await import(pathToFileURL(join(ROOT, 'src/components/map-style.ts')).href);
const { CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } = await import(pathToFileURL(join(ROOT, 'src/lib/map-cluster.ts')).href);
const icons = await import(pathToFileURL(join(ROOT, 'src/constants/map-icons.ts')).href);
const theme = readFileSync(join(ROOT, 'src/constants/theme.tsx'), 'utf8');
const block = theme.slice(theme.indexOf('export const MapIconColors'));
const P = Object.fromEntries([...block.slice(0, block.indexOf('};')).matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
P.ink = theme.match(/SIGN_INK = '([^']+)'/)[1];
const ZONE_ROUTE = theme.match(/DANGER_ZONE_ROUTE = '([^']+)'/)[1];
const light = theme.slice(theme.indexOf('export const LightColors'));
const Colors = new Proxy({}, { get: (_, k) => (typeof k === 'string' && light.match(new RegExp(`\\b${k}: '([^']+)'`))?.[1]) || '#0EA5E9' });
const html = new Function('Colors', 'tilesUrl', 'TILES', 'OSM_COPYRIGHT', 'mapCss', 'SIGN_INK', 'CLUSTER_JS', 'CLUSTER_MAX_ZOOM', 'CLUSTER_RADIUS_PX', 'return `' + tpl + '`')(
  Colors, key ? TILES.light + encodeURIComponent(key) : '', TILES, OSM_COPYRIGHT, mapCss, '#000', CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX,
);
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
for (const { t, r, segs } of results) {
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 760, deviceScaleFactor: 2 });
  await page.setExtraHTTPHeaders({ Referer: 'https://app.passeryder.fr/' });
  page.on('pageerror', (e) => console.log('[erreur page]', e.message));
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const line = (pts) => pts.map((p) => [p.latitude, p.longitude]);
  const routes = [
    ...segs.map((s, i) => ({ id: 'zone:' + i, points: line(segmentPoints(r, s)), color: ZONE_ROUTE, zone: true })),
    { id: 'nav', points: line(r.points), color: '#0EA5E9' },
  ];
  const pins = segs
    .map((s, i) => {
      const at = segmentPoints(r, s)[0];
      return at && { id: 'zone:' + i, kind: 'zone', label: '', icon: { svg: icons.zoneIconSvg(P), width: 26, height: 26, anchor: 'bottom' }, latitude: at.latitude, longitude: at.longitude };
    })
    .filter(Boolean);
  await page.evaluate(
    (routes, pins, pts) => {
      window.setRoutes(routes);
      window.setPins(pins);
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    },
    routes,
    pins,
    line(r.points),
  );
  await new Promise((res) => setTimeout(res, 3000));
  const file = join(OUT, `zones-${t.name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await page.close();
}
await browser.close();
