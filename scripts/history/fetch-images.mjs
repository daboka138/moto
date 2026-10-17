// Images libres de « Histoire de la moto » (note 22) : métadonnées Wikimedia Commons (auteur, licence,
// source), téléchargement en 1280 px, conversion WebP < 200 Ko (Pillow), puis scripts/history/images.json.
// Licences acceptées : domaine public, CC0, CC BY, CC BY-SA (jamais de logo : photos de motos / machines).
// Usage : node scripts/history/fetch-images.mjs <dossier de sortie> (python3 + Pillow requis : PYTHONPATH)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import chapitres from './content/chapitres.mjs';
import m1 from './content/marques-1.mjs';
import m2 from './content/marques-2.mjs';
import m3 from './content/marques-3.mjs';
import m4 from './content/marques-4.mjs';

const OUT = process.argv[2];
if (!OUT) throw new Error('Dossier de sortie manquant');
mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'PasseRyder-history/1.0 (passeryder@gmail.com)' };
const OK_LICENSE = /^(public domain|cc0( 1\.0)?|cc by(-sa)? [1-4]\.[05]( [a-z]{2,3})?)$/i;
const strip = (h = '') => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function info(file) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent('File:' + file)}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1280`;
  const j = await (await fetch(u, { headers: UA })).json();
  const p = Object.values(j.query.pages)[0];
  if (!p.imageinfo) {
    // Titre tronqué : recherche par le début du nom
    const s = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=1&srsearch=${encodeURIComponent('intitle:"' + file.slice(0, 60) + '"')}`, { headers: UA })).json();
    const t = s.query.search[0]?.title;
    if (!t || t === 'File:' + file) throw new Error(`Introuvable : ${file}`);
    return info(t.slice(5));
  }
  return { title: p.title.slice(5), ...p.imageinfo[0] };
}

const items = [
  ...chapitres.map((c) => ({ kind: 'chapter', slug: c.slug, images: c.images })),
  ...[...m1, ...m2, ...m3, ...m4].map((b) => ({ kind: 'brand', slug: b.slug, images: b.images })),
];
const out = [];
for (const it of items) {
  for (const [n, img] of it.images.entries()) {
    const i = await info(img.file);
    const m = i.extmetadata;
    const license = strip(m.LicenseShortName?.value);
    if (!OK_LICENSE.test(license)) throw new Error(`Licence refusée (${license}) : ${i.title}`);
    let author = strip(m.Artist?.value) || 'Auteur inconnu';
    if (/unknown author/i.test(author)) author = 'Auteur inconnu';
    // CC BY / BY-SA : l'auteur doit être cité
    if (author === 'Auteur inconnu' && /^cc by/i.test(license)) throw new Error(`Auteur manquant (${license}) : ${i.title}`);
    const name = `${it.slug}-${n + 1}.webp`;
    const jpg = join(OUT, `${it.slug}-${n + 1}.src`);
    const res = await fetch(i.thumburl ?? i.url, { headers: UA });
    if (!res.ok) throw new Error(`Téléchargement ${res.status} : ${i.title}`);
    writeFileSync(jpg, Buffer.from(await res.arrayBuffer()));
    const kb = execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
im.thumbnail((1280, 1280))
q = 80
while True:
    im.save(sys.argv[2], 'WEBP', quality=q, method=6)
    if os.path.getsize(sys.argv[2]) < 195000: break
    if q > 56:
        q -= 8
    else:
        # Photo très détaillée : plus petite plutôt que trop compressée
        im.thumbnail((int(im.width * 0.85), int(im.height * 0.85)))
print(os.path.getsize(sys.argv[2]) // 1024)
`, jpg, join(OUT, name)]).toString().trim();
    out.push({
      kind: it.kind,
      slug: it.slug,
      sort_order: n,
      path: name,
      caption: img.caption,
      author,
      license: license.replace(/^public domain$/i, 'Domaine public'),
      license_url: m.LicenseUrl?.value?.replace(/^http:/, 'https:') || null,
      source_url: i.descriptionurl,
      file: i.title,
    });
    console.log(`${name} ${kb} Ko · ${license} · ${author.slice(0, 40)}`);
    await sleep(300);
  }
}
writeFileSync(join(import.meta.dirname, 'images.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${out.length} images`);
