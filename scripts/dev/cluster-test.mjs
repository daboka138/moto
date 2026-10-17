// Banc d'essai du regroupement des repères (src/lib/map-cluster.ts, même code que la carte de l'app et du web).
// Points SIMULÉS en mémoire (aucune donnée en base) : 1000 puis 5000 repères autour de Lyon, projection
// Web Mercator comme Leaflet (map.project), zooms 6 à 16.
// node --import ./scripts/dev/register.mjs scripts/dev/cluster-test.mjs
import assert from 'node:assert/strict';

const { CLUSTER_JS, CLUSTER_RADIUS_PX, CLUSTER_MAX_ZOOM } = await import('../../src/lib/map-cluster.ts');
const clusterPoints = new Function(`${CLUSTER_JS}; return clusterPoints;`)();
const clusterLabel = new Function(`${CLUSTER_JS}; return clusterLabel;`)();

/** Leaflet map.project (EPSG:3857, tuiles 256 px) */
function project(lat, lng, zoom) {
  const scale = 256 * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

// Générateur pseudo-aléatoire reproductible
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function simulate(n) {
  const pins = [];
  for (let i = 0; i < n; i++) {
    // 70 % en ville (Lyon ± 5 km), 30 % dans la région (± 80 km)
    const spread = rand() < 0.7 ? 0.05 : 0.8;
    pins.push({ id: 'p' + i, latitude: 45.76 + (rand() - 0.5) * spread * 2, longitude: 4.84 + (rand() - 0.5) * spread * 2.8 });
  }
  return pins;
}

for (const n of [1000, 5000]) {
  const pins = simulate(n);
  console.log(`\n${n} repères simulés`);
  for (const zoom of [6, 8, 10, 12, 13, 14, 15]) {
    const items = pins.map((p) => ({ ...project(p.latitude, p.longitude, zoom), p }));
    const t = performance.now();
    const groups = clusterPoints(items, CLUSTER_RADIUS_PX);
    const ms = performance.now() - t;
    // Chaque repère dans exactement un groupe
    const ids = groups.flat().map((o) => o.p.id);
    assert.equal(ids.length, n);
    assert.equal(new Set(ids).size, n);
    // Membres à moins de radius du premier du groupe (sur chaque axe)
    for (const g of groups) for (const o of g) assert.ok(Math.abs(o.x - g[0].x) <= CLUSTER_RADIUS_PX && Math.abs(o.y - g[0].y) <= CLUSTER_RADIUS_PX);
    // Deux pastilles affichées ne se chevauchent presque jamais : centres des groupes assez écartés
    const shown = groups.length;
    const biggest = Math.max(...groups.map((g) => g.length));
    console.log(
      `  zoom ${String(zoom).padStart(2)} : ${String(shown).padStart(4)} pastilles (au lieu de ${n}), plus gros groupe ${clusterLabel(biggest).padStart(4)}, ${ms.toFixed(1)} ms`,
    );
    assert.ok(ms < 50, 'trop lent pour un téléphone');
    if (zoom <= 8) assert.ok(shown < n / 10, 'pas assez regroupé en vue large');
    // Pastilles qui se chevauchent (centres à moins de 20 px) : doivent rester rares
    const centers = groups.map((g) => ({ x: g.reduce((s, o) => s + o.x, 0) / g.length, y: g.reduce((s, o) => s + o.y, 0) / g.length }));
    let overlaps = 0;
    for (let i = 0; i < centers.length; i++)
      for (let j = i + 1; j < centers.length; j++) if (Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y) < 20) overlaps++;
    if (overlaps) console.log(`           ${overlaps} chevauchement(s) < 20 px`);
    assert.ok(overlaps <= shown * 0.05, 'trop de pastilles superposées');
  }
}
assert.equal(clusterLabel(12), '12');
assert.equal(clusterLabel(2400), '2k');
assert.ok(CLUSTER_MAX_ZOOM >= 15);
console.log('\nTout est bon');
