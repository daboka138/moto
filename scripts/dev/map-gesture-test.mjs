// Banc : page Leaflet de l'app (leaflet-map-html.ts) dans Edge / Chrome headless, écran tactile 400×800.
// Usage : npm i --no-save puppeteer-core pngjs, puis
//   node --import ./scripts/dev/register.mjs scripts/dev/map-gesture-test.mjs [fichier.tsx] [capture.png]
// (BROWSER=chemin de chrome.exe / msedge.exe si besoin)
// Référence = le même tracé dessiné DANS LES TUILES (rouge) ; tracé de l'app en bleu par-dessus.
// Geste à 2 doigts (rotation + pincement) simulé par CDP ; on mesure la part du tracé bleu qui
// n'est plus sur le rouge pendant le geste, puis après.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const ROOT = join(import.meta.dirname, '..', '..');
const file = process.argv[2] || join(ROOT, 'src/components/leaflet-map-html.ts');
const src = readFileSync(file, 'utf8');
const tpl = src.slice(src.indexOf('return `<!DOCTYPE html>') + 8, src.indexOf('</html>`;') + 7);
const { mapCss, TILES, OSM_COPYRIGHT } = await import(pathToFileURL(join(ROOT, 'src/components/map-style.ts')).href);
const { CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } = await import(pathToFileURL(join(ROOT, 'src/lib/map-cluster.ts')).href);
const Colors = new Proxy({}, { get: (_, k) => (k === 'accent' || k === 'route' ? '#0000ff' : k === 'white' ? '#ffffff' : '#888888') });
const html = new Function('Colors', 'tilesUrl', 'TILES', 'OSM_COPYRIGHT', 'mapCss', 'SIGN_INK', 'CLUSTER_JS', 'CLUSTER_MAX_ZOOM', 'CLUSTER_RADIUS_PX', 'return `' + tpl + '`')(
  Colors, '', TILES, OSM_COPYRIGHT, mapCss, '#000', CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX,
);

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--touch-events=enabled'],
});
const page = await browser.newPage();
await page.setViewport({ width: 400, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await page.setRequestInterception(true);
const blank = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
page.on('request', (r) => (r.url().includes('tile.openstreetmap.org') ? r.respond({ status: 200, contentType: 'image/png', body: blank }) : r.continue()));
page.on('pageerror', (e) => console.log('[erreur page]', e.message));
page.on('console', (m) => process.env.VERBOSE && console.log('[page]', m.text()));
await page.setContent(html, { waitUntil: 'networkidle0' });

// Route en zigzag autour de Marseille
const pts = [];
for (let i = 0; i <= 40; i++) pts.push([43.29 + i * 0.0006, 5.37 + Math.sin(i / 3) * 0.003]);
await page.evaluate((pts) => {
  map.setView([43.302, 5.37], 15, { animate: false });
  var Ref = L.GridLayer.extend({
    createTile: function (c) {
      var t = document.createElement('canvas');
      t.width = t.height = 256;
      var ctx = t.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 22; ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(function (p, i) {
        var q = map.project(p, c.z).subtract(c.scaleBy(L.point(256, 256)));
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.stroke();
      return t;
    },
  });
  new Ref({ zIndex: 5 }).addTo(map);
  window.setRoutes([{ id: 'nav', points: pts, color: '#0000ff' }]);
}, pts);
await new Promise((r) => setTimeout(r, 800));

const cdp = await page.createCDPSession();
const C = { x: 200, y: 400 };
const fingers = (angleDeg, dist) => {
  const a = (angleDeg * Math.PI) / 180;
  return [
    { x: C.x + Math.cos(a) * dist, y: C.y + Math.sin(a) * dist, id: 1 },
    { x: C.x - Math.cos(a) * dist, y: C.y - Math.sin(a) * dist, id: 2 },
  ];
};

function misaligned(buf) {
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  const at = (x, y) => (y * w + x) * 4;
  const isBlue = (i) => data[i + 2] > 180 && data[i] < 80 && data[i + 1] < 80;
  const isRed = (i) => data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80;
  let blue = 0, off = 0;
  for (let y = 12; y < h - 12; y += 2)
    for (let x = 12; x < w - 12; x += 2) {
      if (!isBlue(at(x, y))) continue;
      blue++;
      let near = false;
      for (let dy = -10; dy <= 10 && !near; dy += 2) for (let dx = -10; dx <= 10 && !near; dx += 2) if (isRed(at(x + dx, y + dy))) near = true;
      if (!near) off++;
    }
  return { blue, offPct: blue ? Math.round((off / blue) * 100) : null };
}

const results = [];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0, 100) });
const steps = 30;
for (let i = 1; i <= steps; i++) {
  // 70° de rotation et léger écartement des doigts (zoom ×1,25)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers((70 * i) / steps, 100 + (25 * i) / steps) });
  await new Promise((r) => setTimeout(r, 30));
  if (i % 10 === 0) {
    const shot = await page.screenshot();
    if (i === steps) writeFileSync(process.argv[3] || 'during.png', shot);
    results.push({ moment: `pendant le geste ${i}/${steps}`, bearing: Math.round(await page.evaluate(() => map.getBearing())), ...misaligned(shot) });
  }
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await new Promise((r) => setTimeout(r, 800));
const after = await page.screenshot();
results.push({ moment: 'après le geste', bearing: Math.round(await page.evaluate(() => map.getBearing())), ...misaligned(after) });
// Déplacement d'un grand bout après le geste : la zone sort du dessin, le tracé doit être redessiné
await page.evaluate(() => map.panBy([250, -500], { animate: false }));
await new Promise((r) => setTimeout(r, 500));
results.push({ moment: 'après un déplacement de 560 px', bearing: Math.round(await page.evaluate(() => map.getBearing())), ...misaligned(await page.screenshot()) });
await page.evaluate(() => map.panBy([-250, 500], { animate: false }));
// Pincement pour dézoomer + rotation inverse
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(0, 150) });
for (let i = 1; i <= 20; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers((-40 * i) / 20, 150 - (80 * i) / 20) });
  await new Promise((r) => setTimeout(r, 30));
}
results.push({ moment: 'pendant un dézoom à 2 doigts', bearing: Math.round(await page.evaluate(() => map.getBearing())), ...misaligned(await page.screenshot()) });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await new Promise((r) => setTimeout(r, 800));
results.push({ moment: 'après le dézoom', bearing: Math.round(await page.evaluate(() => map.getBearing())), ...misaligned(await page.screenshot()) });
// Navigation suivie, cap en haut : la carte tourne et se déplace à chaque image
const draws = await page.evaluate(async (pts) => {
  map.setView(pts[10], 16, { animate: false });
  var n = 0, raw = L.Canvas.prototype._redraw;
  L.Canvas.prototype._redraw = function () { n++; return raw.apply(this, arguments); };
  for (var i = 10; i < 30; i++) {
    var p = pts[i], q = pts[i + 1];
    var heading = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    window.setPosition({ latitude: p[0], longitude: p[1], accuracy: 5, heading: (heading + 360) % 360 }, true, true);
    await new Promise((r) => setTimeout(r, 120));
  }
  return n;
}, pts);
results.push({ moment: `navigation suivie (redessins canvas : ${draws} en 2,4 s)`, bearing: Math.round(await page.evaluate(() => map.getBearing())), ...misaligned(await page.screenshot()) });
const orient = await page.evaluate(async (pts) => {
  var out = [];
  for (var mode of ['north', 'heading']) {
    window.setOrientation(mode);
    for (var i = 30; i < 38; i++) {
      window.setPosition({ latitude: pts[i][0], longitude: pts[i][1], accuracy: 5, heading: 90 }, true, true);
      await new Promise((r) => setTimeout(r, 200));
    }
    out.push(mode + ' → cap carte ' + Math.round(map.getBearing()));
  }
  return out.join(' ; ');
}, pts);
console.log('Orientation (cap GPS 90°) :', orient);
console.table(results);
await browser.close();
