// Zones de danger « points noirs » à partir des accidents corporels OFFICIELS (ONISR, data.gouv.fr,
// « Bases de données annuelles des accidents corporels de la circulation routière », Licence Ouverte Etalab).
// LÉGAL (France, art. R413-15) : uniquement de vrais dangers routiers. JAMAIS de fichier « radars » ni de
// contrôle : ce script ne lit que les 4 fichiers caractéristiques / lieux / véhicules / usagers.
//
// 1. récupère la liste des fichiers du jeu de données (API data.gouv.fr) et garde les 5 dernières années complètes ;
// 2. France métropolitaine (Corse comprise) : accidents avec coordonnées GPS ;
// 3. poids d'un accident : 1, +1 si un deux-roues motorisé est impliqué, +1 si blessé hospitalisé ou tué, +1 si tué ;
// 4. regroupement : point noir = au moins 3 accidents à moins de 150 m (5 ans), score = somme des poids,
//    seuil plus haut en ville (sinon une alerte à chaque carrefour) ; type de route (ville / route / voie rapide)
//    = majorité des accidents du groupe (agg, catr, vma) → longueur de zone annoncée dans l'appli ;
// 5. --push : remplace toutes les zones 'onisr' en base (table danger_zones), en une seule transaction finale.
//
// Mise à jour : une fois par an, quand l'ONISR publie l'année suivante (octobre-novembre) :
//   node scripts/danger-zones/build.mjs           (calcul + statistiques, rien n'est envoyé)
//   set -a; . <(sed 's/\r$//' .env.supabase); set +a; node scripts/danger-zones/build.mjs --push
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATASET = 'https://www.data.gouv.fr/api/1/datasets/53698f4ca3a729239d2036df/';
const YEARS = 5;
const RADIUS_M = 150;
const MIN_ACCIDENTS = 3;
/** Score minimal d'un point noir (poids cumulés) : en ville il y a des accidents à presque chaque carrefour,
 *  et sur voie rapide le trafic en crée partout (sinon tout le trajet serait « zone de danger ») */
const MIN_SCORE = { urban: 20, rural: 8, expressway: 30 };
const PROJECT = 'yfewldnhnnrzzscmfjsd';
const CACHE = join(tmpdir(), 'passeryder-baac');
const PUSH = process.argv.includes('--push');

// Deux-roues motorisés (catv) : cyclomoteur, scooters, motos (toutes cylindrées)
const MOTO_CATV = new Set(['02', '2', '30', '31', '32', '33', '34']);
const KINDS = ['caract', 'lieux', 'vehicules', 'usagers'];

// ---------- Fichiers ----------
const dataset = await (await fetch(DATASET)).json();
/** { 2024: { caract: url, lieux: url, … } } */
const files = {};
for (const r of dataset.resources) {
  const name = `${r.title} ${r.url}`.toLowerCase();
  if (name.includes('immatric') || !name.includes('.csv')) continue;
  const year = Number(r.url.match(/(20\d\d)\.csv$/)?.[1]);
  const kind = /carac|carct|caract/.test(name) ? 'caract' : name.includes('lieux') ? 'lieux' : name.includes('vehicules') ? 'vehicules' : name.includes('usagers') ? 'usagers' : null;
  if (!year || !kind) continue;
  files[year] ??= {};
  files[year][kind] ??= r.url;
}
const years = Object.keys(files)
  .map(Number)
  .filter((y) => KINDS.every((k) => files[y][k]))
  .sort((a, b) => b - a)
  .slice(0, YEARS)
  .sort();
if (years.length < YEARS) throw new Error(`Seulement ${years.length} années complètes`);
console.log(`Années : ${years.join(', ')} (licence ${dataset.license})`);

mkdirSync(CACHE, { recursive: true });
async function download(url) {
  const file = join(CACHE, url.split('/').slice(-2).join('_'));
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file, 'utf8').replace(/^﻿/, '');
}

/** CSV « ; » avec guillemets → objets (en-têtes en minuscules) */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const split = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ';' && !quoted) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => {
    const v = split(l);
    return Object.fromEntries(head.map((h, i) => [h, v[i]]));
  });
}
const accId = (r) => r.num_acc ?? r.accident_id;
const num = (s) => Number(String(s ?? '').replace(',', '.'));

// ---------- Accidents ----------
/** id → { lat, lon, agg, catr, vma, moto, severe, killed } */
const accidents = new Map();
for (const year of years) {
  const [caract, lieux, vehicules, usagers] = await Promise.all(KINDS.map((k) => download(files[year][k]).then(parseCsv)));
  let kept = 0;
  for (const r of caract) {
    const lat = num(r.lat);
    const lon = num(r.long);
    const dep = String(r.dep ?? '').replace(/^0/, '');
    // Métropole (Corse comprise) : départements 1 à 95, 2A / 2B, et coordonnées plausibles
    if (!(lat > 41 && lat < 51.3 && lon > -5.3 && lon < 9.7) || /^97|^98/.test(dep)) continue;
    accidents.set(accId(r), { lat, lon, agg: r.agg, catr: null, vma: null, moto: false, severe: false, killed: false });
    kept++;
  }
  for (const r of lieux) {
    const a = accidents.get(accId(r));
    if (a && a.catr === null) {
      a.catr = r.catr;
      a.vma = num(r.vma);
    }
  }
  for (const r of vehicules) {
    const a = accidents.get(accId(r));
    if (a && MOTO_CATV.has(String(r.catv).trim())) a.moto = true;
  }
  for (const r of usagers) {
    const a = accidents.get(accId(r));
    if (!a) continue;
    if (r.grav === '2') a.killed = a.severe = true;
    if (r.grav === '3') a.severe = true;
  }
  console.log(`${year} : ${kept} accidents en métropole avec position`);
}

const all = [...accidents.values()];
const weight = (a) => 1 + (a.moto ? 1 : 0) + (a.severe ? 1 : 0) + (a.killed ? 1 : 0);
const roadOf = (a) => (a.catr === '1' || a.vma >= 110 ? 'expressway' : a.agg === '2' ? 'urban' : 'rural');

// ---------- Regroupement (grille de 150 m) ----------
const KY = 110_540;
const kx = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);
const cellOf = (a) => `${Math.floor((a.lat * KY) / RADIUS_M)}:${Math.floor((a.lon * kx(46.5)) / RADIUS_M)}`;
const grid = new Map();
for (const a of all) {
  const k = cellOf(a);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(a);
}
const dist = (a, b) => Math.hypot((a.lon - b.lon) * kx(a.lat), (a.lat - b.lat) * KY);
function neighbours(a) {
  const ci = Math.floor((a.lat * KY) / RADIUS_M);
  const cj = Math.floor((a.lon * kx(46.5)) / RADIUS_M);
  const out = [];
  // kx(46,5) est faux de quelques % aux extrémités : 2 cases de chaque côté en longitude
  for (let i = ci - 1; i <= ci + 1; i++)
    for (let j = cj - 2; j <= cj + 2; j++) for (const b of grid.get(`${i}:${j}`) ?? []) if (!b.taken && dist(a, b) <= RADIUS_M) out.push(b);
  return out;
}

// Graines : les accidents au voisinage le plus lourd d'abord
for (const a of all) a.around = neighbours(a).reduce((s, b) => s + weight(b), 0);
const seeds = [...all].sort((a, b) => b.around - a.around);
const zones = [];
for (const seed of seeds) {
  if (seed.taken) continue;
  const group = neighbours(seed);
  if (group.length < MIN_ACCIDENTS) continue;
  const score = group.reduce((s, b) => s + weight(b), 0);
  const roads = {};
  for (const b of group) roads[roadOf(b)] = (roads[roadOf(b)] ?? 0) + 1;
  const road = Object.entries(roads).sort((x, y) => y[1] - x[1])[0][0];
  if (score < MIN_SCORE[road]) continue;
  for (const b of group) b.taken = true;
  const w = group.reduce((s, b) => s + weight(b), 0);
  const center = {
    lat: group.reduce((s, b) => s + b.lat * weight(b), 0) / w,
    lon: group.reduce((s, b) => s + b.lon * weight(b), 0) / w,
  };
  const radius = Math.max(30, Math.min(RADIUS_M, Math.round(Math.max(...group.map((b) => dist(center, b))))));
  zones.push({ lat: +center.lat.toFixed(6), lon: +center.lon.toFixed(6), radius, road, accidents: group.length, score });
}

const byRoad = zones.reduce((s, z) => ({ ...s, [z.road]: (s[z.road] ?? 0) + 1 }), {});
console.log(`${all.length} accidents → ${zones.length} zones de danger (${JSON.stringify(byRoad)})`);
const paca = zones.filter((z) => z.lat > 42.9 && z.lat < 45.2 && z.lon > 4.2 && z.lon < 7.8).length;
console.log(`dont environ ${paca} en PACA (cadre approché)`);
writeFileSync(join(CACHE, 'zones.json'), JSON.stringify(zones));
console.log(`Zones écrites dans ${join(CACHE, 'zones.json')}`);

// ---------- Envoi ----------
if (!PUSH) process.exit(0);
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('Charger .env.supabase avant --push');
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status} : ${text.slice(0, 500)}`);
  return text;
}
await sql('truncate public.danger_zones_import;');
const CHUNK = 3000;
for (let i = 0; i < zones.length; i += CHUNK) {
  const values = zones
    .slice(i, i + CHUNK)
    .map((z) => `(${z.lat},${z.lon},${z.radius},'${z.road}',${z.accidents},${z.score})`)
    .join(',');
  await sql(`insert into public.danger_zones_import (lat, lon, radius_m, road, accidents, score) values ${values};`);
  process.stdout.write(`\r${Math.min(i + CHUNK, zones.length)} / ${zones.length}`);
}
console.log();
await sql(`begin;
delete from public.danger_zones where source = 'onisr';
insert into public.danger_zones (source, lat, lon, radius_m, road, accidents, score)
  select 'onisr', lat, lon, radius_m, road, accidents, score from public.danger_zones_import;
truncate public.danger_zones_import;
insert into public.danger_zone_imports (source, years, zones, accidents)
  values ('onisr', '${years[0]}-${years.at(-1)}', ${zones.length}, ${all.length});
commit;`);
console.log(await sql(`select road, count(*) from public.danger_zones group by road order by road;`));
