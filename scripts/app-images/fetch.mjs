// Photos réelles de l'app (note 24 : présentation au 1er lancement) : Wikimedia Commons, licences
// libres seulement (domaine public, CC0, CC BY, CC BY-SA), 1280 px, WebP < 150 Ko (Pillow), dans
// assets/images/photos/. Écrit scripts/app-images/images.json et la section « Photos de l'app » de
// credits-images.md (reprise par scripts/history/build-seed.mjs).
// Usage : node scripts/app-images/fetch.mjs   (python + Pillow requis)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'assets', 'images', 'photos');
mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'PasseRyder/1.0 (passeryder@gmail.com)' };
const OK_LICENSE = /^(public domain|cc0( 1\.0)?|cc by(-sa)? [1-4]\.[05]( [a-z]{2,3})?)$/i;
const strip = (h = '') =>
  h
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s*Photo portfolio\s*$/i, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();

// Écran de présentation : une photo par diapo (src/guide/contenu.ts BIENVENUE, même ordre)
const PHOTOS = [
  { name: 'potes', file: '03 Gran Canaria adventure - motorcycle tour of Gran Canaria island, Spain.jpg', caption: 'Duo sur une route de montagne, Grande Canarie' },
  { name: 'ensemble', file: 'Col du Lautaret-3133 - Flickr - Ragnhild & Neil Crawford.jpg', caption: 'Motards au col du Lautaret (Hautes-Alpes)' },
  { name: 'commu', file: 'Gita in moto a Castelluccio.jpg', caption: 'Pause en groupe à Castelluccio (Italie)' },
  { name: 'securite', file: 'Auf dem Weg nach Zwickau, Sachsen IMG 2559WI.jpg', caption: 'Balade en groupe en Saxe' },
  { name: 'vie-privee', file: 'Ladakh motorcycling.jpg', caption: 'Route du Ladakh (Inde)' },
];

const images = [];
for (const p of PHOTOS) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent('File:' + p.file)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280`;
  const j = await (await fetch(u, { headers: UA })).json();
  const page = Object.values(j.query.pages)[0];
  const ii = page.imageinfo?.[0];
  if (!ii) throw new Error(`Introuvable : ${p.file}`);
  const m = ii.extmetadata;
  const license = strip(m.LicenseShortName?.value);
  if (!OK_LICENSE.test(license)) throw new Error(`Licence refusée (${license}) : ${p.file}`);
  const author = strip(m.Artist?.value) || 'Auteur inconnu';
  if (author === 'Auteur inconnu' && /^cc by/i.test(license)) throw new Error(`Auteur manquant : ${p.file}`);
  const src = join(OUT, `${p.name}.src`);
  const res = await fetch(ii.thumburl, { headers: UA });
  if (!res.ok) throw new Error(`Téléchargement ${res.status} : ${p.file}`);
  writeFileSync(src, Buffer.from(await res.arrayBuffer()));
  const kb = execFileSync('python', ['-c', `
import sys, os
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
im.thumbnail((1080, 1080))
q = 80
while True:
    im.save(sys.argv[2], 'WEBP', quality=q, method=6)
    if os.path.getsize(sys.argv[2]) < 150_000 or q <= 40: break
    q -= 8
os.remove(sys.argv[1])
print(os.path.getsize(sys.argv[2]) // 1024)
`, src, join(OUT, `${p.name}.webp`)]).toString().trim();
  images.push({
    path: `${p.name}.webp`,
    caption: p.caption,
    author,
    license,
    license_url: m.LicenseUrl?.value ?? null,
    file: page.title.slice(5),
    source_url: ii.descriptionurl,
  });
  console.log(`${p.name}.webp ${kb} Ko · ${license} · ${author}`);
}
writeFileSync(join(ROOT, 'scripts', 'app-images', 'images.json'), JSON.stringify(images, null, 2) + '\n');
// Crédits lus par l'app (affichés sous chaque photo)
const credit = (i) => `${i.author} · ${i.license} · Wikimedia Commons`;
writeFileSync(
  join(OUT, 'credits.json'),
  JSON.stringify(Object.fromEntries(images.map((i) => [i.path.replace('.webp', ''), credit(i)])), null, 2) + '\n',
);

// Section « Photos de l'app » de credits-images.md
let md = `\n## Photos de l’app (assets/images/photos)\n\nPrésentation au premier lancement (welcome.tsx). Wikimedia Commons, licence libre ; l’auteur et la licence\nsont affichés sous chaque photo. Générées par \`scripts/app-images/fetch.mjs\` (données : \`scripts/app-images/images.json\`).\n\n| Fichier | Légende | Auteur | Licence | Source |\n|---|---|---|---|---|\n`;
for (const i of images) {
  const lic = i.license_url ? `[${i.license}](${i.license_url})` : i.license;
  md += `| ${i.path} | ${i.caption} | ${i.author.replace(/\|/g, '/')} | ${lic} | [${i.file.replace(/\|/g, '/')}](${i.source_url}) |\n`;
}
writeFileSync(join(ROOT, 'scripts', 'app-images', 'credits.md'), md);
const credits = join(ROOT, 'credits-images.md');
const current = readFileSync(credits, 'utf8').replace(/\r\n/g, '\n');
const cut = current.indexOf('\n## Photos de l’app');
writeFileSync(credits, (cut >= 0 ? current.slice(0, cut) : current.replace(/\n+$/, '\n')) + md);
console.log('credits-images.md mis à jour');
