// Banc : sens de ma flèche et du faisceau sur les deux cartes (page Leaflet 2D leaflet-map-html.ts,
// page MapLibre 3D nav-map-gl-html.ts), dans Edge / Chrome headless. Pour chaque cap (N, E, S, O) :
// - navigation « cap en haut » et « nord en haut », cap GPS en mouvement ;
// - navigation à l'arrêt, flèche sur la boussole (la carte, elle, garde le cap de déplacement) ;
// - hors navigation, faisceau de la boussole.
// On compare la direction de la flèche À L'ÉCRAN avec la direction du cap projetée par la carte
// (un point 60 m plus loin). Aucun réseau pour la 3D (style vide), aucune base.
// Usage : npm i --no-save puppeteer-core, puis
//   node --import ./scripts/dev/register.mjs scripts/dev/arrow-direction-test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(import.meta.dirname, '..', '..');
const tplOf = (file) => {
  const src = readFileSync(join(ROOT, file), 'utf8');
  return { src, tpl: src.slice(src.indexOf('return `<!DOCTYPE html>') + 8, src.indexOf('</html>`;') + 7) };
};
const { mapCss, TILES, OSM_COPYRIGHT } = await import(pathToFileURL(join(ROOT, 'src/components/map-style.ts')).href);
const { CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } = await import(pathToFileURL(join(ROOT, 'src/lib/map-cluster.ts')).href);
const Colors = new Proxy({}, { get: (_, k) => (k === 'me' ? '#1D9BF0' : k === 'white' ? '#ffffff' : '#888888') });

const leaflet = tplOf('src/components/leaflet-map-html.ts');
const leafletHtml = new Function('Colors', 'tilesUrl', 'TILES', 'OSM_COPYRIGHT', 'mapCss', 'CLUSTER_JS', 'CLUSTER_MAX_ZOOM', 'CLUSTER_RADIUS_PX', 'return `' + leaflet.tpl + '`')(
  Colors, '', TILES, OSM_COPYRIGHT, mapCss, CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX,
);
const gl = tplOf('src/components/nav-map-gl-html.ts');
const consts = Object.fromEntries([...gl.src.matchAll(/export const (NAV_PITCH|GL_ZOOM_OFFSET|MAPLIBRE_VERSION) = '?([-\d.]+)'?;/g)].map((m) => [m[1], m[2]]));
const blankStyle = 'data:application/json,' + encodeURIComponent(JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#dddddd' } }] }));
const glHtml = new Function('Colors', 'styleUrl', 'sky', 'mapCss', 'MAPLIBRE', 'NAV_PITCH', 'GL_ZOOM_OFFSET', 'return `' + gl.tpl + '`')(
  Colors, blankStyle, { sky: '#BFE3FF', horizon: '#EAF6FF' }, mapCss, `https://unpkg.com/maplibre-gl@${consts.MAPLIBRE_VERSION}/dist/maplibre-gl`, consts.NAV_PITCH, consts.GL_ZOOM_OFFSET,
);

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const P = { latitude: 43.3, longitude: 5.37 };
const NAMES = { 0: 'nord', 90: 'est', 180: 'sud', 270: 'ouest' };

// Dans la page : angle à l'écran (0 = haut, sens horaire) de la flèche / du faisceau et du cap projeté
const MEASURE = `(function (deg, which, isGl) {
  function ensureProbe(parent, cls, x, y) {
    var p = parent.querySelector(':scope > .' + cls);
    if (!p) { p = document.createElement('div'); p.className = cls; p.style.cssText = 'position:absolute;width:2px;height:2px;margin:-1px 0 0 -1px;pointer-events:none'; parent.appendChild(p); }
    p.style.left = x + 'px'; p.style.top = y + 'px';
    var r = p.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  var meEl = document.querySelector('.me');
  var box = which === 'beam' ? meEl.querySelector('.beam') : meEl;
  var size = box.getBoundingClientRect ? (which === 'beam' ? box.offsetWidth : meEl.offsetWidth) : 40;
  var c = ensureProbe(box, 'probe-c', size / 2, size / 2);
  var t = ensureProbe(box, 'probe-t', size / 2, size * (which === 'beam' ? 0.1 : 0.08));
  var a = Math.atan2(t.x - c.x, -(t.y - c.y)) * 180 / Math.PI;
  var R = 6371000, d = 60 / R, lat = ${P.latitude} * Math.PI / 180, lng = ${P.longitude} * Math.PI / 180, b = deg * Math.PI / 180;
  var lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b));
  var lng2 = lng + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
  var p0, p1;
  if (isGl) { p0 = map.project([${P.longitude}, ${P.latitude}]); p1 = map.project([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]); }
  else { p0 = map.latLngToContainerPoint([${P.latitude}, ${P.longitude}]); p1 = map.latLngToContainerPoint([lat2 * 180 / Math.PI, lng2 * 180 / Math.PI]); }
  var e = Math.atan2(p1.x - p0.x, -(p1.y - p0.y)) * 180 / Math.PI;
  return { screen: (a + 360) % 360, expected: (e + 360) % 360 };
})`;

async function open(html, isGl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 800, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('[erreur page]', e.message));
  const shim = '<script>window.ReactNativeWebView = { postMessage: function (m) { (window.__msgs = window.__msgs || []).push(JSON.parse(m)); } };</script>';
  await page.setContent(html.replace('<head>', '<head>' + shim), { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => (window.__msgs || []).some((m) => m.type === 'ready' || m.type === 'fallback'))) break;
    await wait(100);
  }
  const fb = await page.evaluate(() => (window.__msgs || []).find((m) => m.type === 'fallback'));
  if (fb) throw new Error((isGl ? '3D' : '2D') + ' : ' + fb.reason);
  return page;
}

let failures = 0;
async function check(page, isGl, label, setup, deg, which) {
  await page.evaluate(setup);
  await wait(1600);
  const m = await page.evaluate(`${MEASURE}(${deg}, '${which}', ${isGl})`);
  const err = Math.abs(((m.screen - m.expected + 540) % 360) - 180);
  const ok = err <= 6;
  if (!ok) failures++;
  if (!ok && process.env.DEBUG) console.log(await page.evaluate(() => JSON.stringify({ h: me.heading, c: me.course, t: me.targetHeading, tr: me.el.style.transform, cls: me.el.className, nav: me.nav, b: map.getBearing ? map.getBearing() : 0 })));
  console.log(`  ${ok ? '✓' : '✗'} ${label} ${NAMES[deg]} : à l'écran ${Math.round(m.screen)}°, attendu ${Math.round(m.expected)}° (écart ${err.toFixed(1)}°)`);
}

for (const [name, html, isGl] of [['2D (Leaflet)', leafletHtml, false], ['3D (MapLibre)', glHtml, true]]) {
  console.log(name);
  const page = await open(html, isGl);
  const pos = (h, follow, nav) => `window.setPosition({ latitude: ${P.latitude}, longitude: ${P.longitude}, accuracy: 5, heading: ${h} }, ${follow}, ${nav})`;
  for (const deg of [0, 90, 180, 270]) {
    await check(page, isGl, 'navigation cap en haut, flèche', `window.setCompass(null, null); window.setOrientation('heading'); ${pos(deg, true, true)}`, deg, 'arrow');
    await check(page, isGl, 'navigation nord en haut, flèche', `window.setOrientation('north'); ${pos(deg, true, true)}`, deg, 'arrow');
    // À l'arrêt : cap de déplacement figé à 30°, la boussole donne deg
    await check(page, isGl, 'navigation à l’arrêt, flèche = boussole', `window.setOrientation('heading'); ${pos(30, true, true)}; window.setCompass(${deg}, 'arrow')`, deg, 'arrow');
    const bearing = await page.evaluate(isGl ? '(360 - map.getBearing()) % 360' : 'map.getBearing()');
    assert.ok(Math.abs(((bearing - 330 + 540) % 360) - 180) < 3, `la carte reste sur le cap de déplacement (${bearing})`);
    if (!isGl)
      await check(page, isGl, 'hors navigation, faisceau', `window.setCompass(null, null); ${pos(null, true, false)}; window.setCompass(${deg}, 'beam')`, deg, 'beam');
  }
  await page.close();
}
await browser.close();
assert.equal(failures, 0, `${failures} direction(s) fausse(s)`);
console.log('Tout est bon.');
