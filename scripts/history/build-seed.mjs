// Génère la migration du contenu initial de « Histoire de la moto » (note 22) et credits-images.md.
// Inséré une seule fois (on conflict do nothing) : ensuite, tout se modifie dans Console › Histoire.
// Usage : node scripts/history/build-seed.mjs  (après fetch-images.mjs, qui écrit images.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import chapitres from './content/chapitres.mjs';
import m1 from './content/marques-1.mjs';
import m2 from './content/marques-2.mjs';
import m3 from './content/marques-3.mjs';
import m4 from './content/marques-4.mjs';

const root = join(import.meta.dirname, '..', '..');
const brands = [...m1, ...m2, ...m3, ...m4];
const images = JSON.parse(readFileSync(join(import.meta.dirname, 'images.json'), 'utf8'));

const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (s.includes('$h$')) throw new Error('Texte contenant $h$');
  return `$h$${s}$h$`;
};
const json = (v) => `${q(JSON.stringify(v))}::jsonb`;
const timeline = (t) => t.map(([year, text]) => ({ year, text }));
const models = (m) => m.map(([name, year, text]) => ({ name, year, text }));

const slugs = new Set();
for (const x of [...chapitres, ...brands]) {
  if (slugs.has(x.slug)) throw new Error(`Slug en double : ${x.slug}`);
  slugs.add(x.slug);
}

let sql = `-- Contenu initial de « Histoire de la moto » (note 22), généré par scripts/history/build-seed.mjs.
-- Inséré une seule fois : les corrections se font ensuite dans Console › Histoire (jamais écrasées ici).
-- Images : Wikimedia Commons (domaine public, CC0, CC BY, CC BY-SA), fichiers dans le bucket public history.

-- Husqvarna remonte à 1689 (manufacture d'armes) : année de création acceptée dès 1600
alter table public.history_brands drop constraint if exists history_brands_founded_year_check;
alter table public.history_brands add constraint history_brands_founded_year_check check (founded_year between 1600 and 2100);

`;
for (const c of chapitres) {
  sql += `insert into public.history_chapters (slug, title, subtitle, body, timeline, sort_order) values (${q(c.slug)}, ${q(c.title)}, ${q(c.subtitle)}, ${q(c.body)}, ${json(timeline(c.timeline))}, ${c.sort_order})
on conflict (slug) do nothing;

`;
}
for (const b of brands) {
  sql += `insert into public.history_brands (slug, name, country, founded_year, founded_place, founders, tagline, body, timeline, models, anecdotes, today, sort_order) values (${q(b.slug)}, ${q(b.name)}, ${q(b.country)}, ${b.founded_year}, ${q(b.founded_place)}, ${q(b.founders)}, ${q(b.tagline)}, ${q(b.body)}, ${json(timeline(b.timeline))}, ${json(models(b.models))}, ${json(b.anecdotes)}, ${q(b.today)}, ${b.sort_order})
on conflict (slug) do nothing;

`;
}
for (const i of images) {
  const owner = i.kind === 'chapter' ? 'chapter_id' : 'brand_id';
  const table = i.kind === 'chapter' ? 'history_chapters' : 'history_brands';
  sql += `insert into public.history_images (${owner}, path, caption, author, license, license_url, source_url, sort_order)
select t.id, ${q(i.path)}, ${q(i.caption)}, ${q(i.author)}, ${q(i.license)}, ${q(i.license_url)}, ${q(i.source_url)}, ${i.sort_order}
from public.${table} t where t.slug = ${q(i.slug)}
  and not exists (select 1 from public.history_images x where x.path = ${q(i.path)});

`;
}
writeFileSync(join(root, 'supabase', 'migrations', '20261028000200_moto_history_content.sql'), sql);

// Crédits des images
const nameOf = (i) => (i.kind === 'chapter' ? chapitres.find((c) => c.slug === i.slug).title : brands.find((b) => b.slug === i.slug).name);
let md = `# Crédits des images — Histoire de la moto

Toutes les images viennent de [Wikimedia Commons](https://commons.wikimedia.org) et sont sous licence libre
(domaine public, CC0, CC BY ou CC BY-SA). Aucun logo de marque. Elles sont recadrées / réduites et converties
en WebP (< 200 Ko) puis stockées dans le bucket Supabase public \`history\`. L'auteur et la licence sont affichés
sous chaque image dans l'app (obligatoire pour CC BY / CC BY-SA). Les images converties restent sous la même
licence que l'original.

Généré par \`scripts/history/build-seed.mjs\` (données : \`scripts/history/images.json\`).

| Fichier | Sujet | Légende | Auteur | Licence | Source |
|---|---|---|---|---|---|
`;
for (const i of images) {
  const lic = i.license_url ? `[${i.license}](${i.license_url})` : i.license;
  md += `| ${i.path} | ${nameOf(i)} | ${i.caption} | ${i.author.replace(/\|/g, '/')} | ${lic} | [${i.file.replace(/\|/g, '/')}](${i.source_url}) |\n`;
}
writeFileSync(join(root, 'credits-images.md'), md);

const words = (s) => s.split(/\s+/).filter(Boolean).length;
for (const b of brands) {
  const w = words(b.body) + words(b.today) + b.timeline.reduce((a, t) => a + words(t[1]), 0) + b.models.reduce((a, m) => a + words(m[2]), 0) + b.anecdotes.reduce((a, x) => a + words(x), 0);
  console.log(`${b.name.padEnd(18)} ${w} mots ≈ ${Math.round(w / 200)} min`);
}
console.log(`Migration : ${chapitres.length} chapitre(s), ${brands.length} marques, ${images.length} images`);
