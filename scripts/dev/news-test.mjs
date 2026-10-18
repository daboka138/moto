// Actus moto : teste le lecteur RSS et le filtre (supabase/functions/fetch-news/rss.ts) sur des
// exemples, puis sur les vrais flux (lecture seule, rien n'est écrit en base) et le mélange du Mur.
// node --import ./scripts/dev/register.mjs scripts/dev/news-test.mjs [--offline]
import assert from 'node:assert/strict';

import { probeImageSize } from '../../supabase/functions/fetch-news/probe.ts';
import { feedCharset, imageSize, isMotoNews, LARGE_IMAGE_MIN, parseFeed, pickImage, shortSummary, toText } from '../../supabase/functions/fetch-news/rss.ts';
import { mixNews } from '../../src/lib/feed.ts';

// ---------- Filtre ----------
assert.equal(isMotoNews('Trail Kawasaki KLE500 SE Smartride', 'Kawasaki étend sa gamme A2'), true);
assert.equal(isMotoNews('Nouvelle Ducati Panigale V4', null), true);
assert.equal(isMotoNews('Radars : 200 nouveaux appareils sur les routes', 'Les motards visés'), false);
assert.equal(isMotoNews('Moto : retrait de permis pour excès de vitesse', null), false);
assert.equal(isMotoNews('Contrôle technique moto : ce qui change', null), false);
assert.equal(isMotoNews('La gendarmerie lance une opération moto', null), false);
assert.equal(isMotoNews('Recette de la tarte aux pommes', 'Un dessert facile'), false);
assert.equal(isMotoNews('Salon de Milan 2026 : les nouveautés Honda', null), true);

// ---------- Résumé ----------
assert.equal(shortSummary('Court.'), null);
assert.equal(
  shortSummary('Première phrase assez longue pour compter. Deuxième phrase. Troisième phrase qui ne passe pas.'),
  'Première phrase assez longue pour compter. Deuxième phrase.',
);
assert.ok((shortSummary('x'.repeat(30) + ' ' + 'mot '.repeat(100)) ?? '').length <= 240);
assert.equal(toText('&lt;p&gt;Les motards &amp; la route&lt;/p&gt;'), 'Les motards & la route');
assert.equal(feedCharset('text/xml', '<?xml version="1.0" encoding="ISO-8859-15"?>'), 'iso-8859-15');

// ---------- Flux d'exemple ----------
const sample = `<?xml version="1.0"?><rss><channel>
<item><title>Trail Kawasaki KLE500</title><link>http://www.exemple.fr/a.php</link>
<description><![CDATA[<img src='http://www.exemple.fr/i.jpg'/>]]>Kawasaki étend sa gamme. Une version A2 arrive.</description>
<pubDate>Sun, 18 Oct 2026 08:00:00 +0100</pubDate><guid isPermaLink="false">kle500</guid></item>
<item><title>Sans lien</title></item>
</channel></rss>`;
const [a, ...rest] = parseFeed(sample, 'https://www.exemple.fr/rss.xml');
assert.equal(rest.length, 0);
assert.equal(a.url, 'https://www.exemple.fr/a.php');
assert.deepEqual(a.image, { url: 'https://www.exemple.fr/i.jpg', width: null, height: null });
assert.equal(a.guid, 'kle500');
assert.equal(a.summary, 'Kawasaki étend sa gamme. Une version A2 arrive.');
assert.equal(a.publishedAt, '2026-10-18T07:00:00.000Z');

// ---------- Choix de l'image ----------
const base = 'https://m.fr/rss';
// Image mise en avant (media:content) plutôt qu'une photo du corps de l'article
assert.equal(
  pickImage(`<item><media:content url="https://m.fr/une.jpg" medium="image" /><description>&lt;img src="https://m.fr/b.jpg" width="2048"&gt;</description></item>`, base).url,
  'https://m.fr/une.jpg',
);
// Plus grande taille du srcset
assert.deepEqual(
  pickImage(`<item><description><![CDATA[<img src="https://m.fr/s.jpg" width="300" srcset="https://m.fr/s-300.jpg 300w, https://m.fr/s-1024.jpg 1024w, https://m.fr/s-600.jpg 600w">]]></description></item>`, base),
  { url: 'https://m.fr/s-1024.jpg', width: 1024, height: null },
);
// La plus large des media (largeurs données)
assert.equal(
  pickImage(`<item><media:thumbnail url="https://m.fr/t.jpg" width="150" /><media:content url="https://m.fr/g.jpg" width="1200" /></item>`, base).url,
  'https://m.fr/g.jpg',
);
assert.equal(pickImage('<item><enclosure url="https://m.fr/a.mp3" type="audio/mpeg" /></item>', base), null);
assert.equal(pickImage('<item><title>Rien</title></item>', base), null);
// Taille d'après les premiers octets
const png = new Uint8Array(24); png.set([0x89, 0x50, 0x4e, 0x47], 0); png.set([0, 0, 3, 32, 0, 0, 1, 194], 16);
assert.deepEqual(imageSize(png), { width: 800, height: 450 });
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x02, 0x1c, 0x03, 0x20, 3, 0, 0]);
assert.deepEqual(imageSize(jpg), { width: 800, height: 540 });
assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);

// ---------- Mélange du Mur ----------
const m = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'photo', key: `m${i}`, at: `2026-10-${String(20 - i).padStart(2, '0')}` }));
const news = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'news', key: `n${i}`, at: `2026-10-${String(20 - i).padStart(2, '0')}` }));
const kinds = (rows) => rows.map((r) => (r.kind === 'news' ? 'N' : 'M')).join('');
assert.equal(kinds(mixNews(m(7), news(5))), 'MMMNMMMNM');
assert.equal(kinds(mixNews(m(2), news(5))), 'MMN');
assert.equal(kinds(mixNews([], news(3))), 'NNN');
assert.equal(kinds(mixNews(m(4), [])), 'MMMM');
console.log('Tests hors ligne : OK');

if (process.argv.includes('--offline')) process.exit(0);

// ---------- Vrais flux ----------
const FEEDS = {
  'Le Repaire des Motards': 'https://www.lerepairedesmotards.com/rss/actu.xml',
  Motoservices: 'https://www.motoservices.com/lastnews.rss',
  'Moto Magazine': 'https://www.motomag.com/rss',
  Motoplanete: 'https://www.motoplanete.com/rss.xml',
  FFMC: 'https://www.ffmc.asso.fr/spip.php?page=backend',
};
for (const [name, url] of Object.entries(FEEDS)) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'PasseRyder/1.0 (+https://passeryder.fr)' } });
    const buf = new Uint8Array(await res.arrayBuffer());
    const head = new TextDecoder('ascii').decode(buf.slice(0, 200));
    const xml = new TextDecoder(feedCharset(res.headers.get('content-type'), head)).decode(buf);
    const entries = parseFeed(xml, url);
    const kept = entries.filter((e) => isMotoNews(e.title, e.summary));
    const dates = entries.map((e) => e.publishedAt).filter(Boolean).sort();
    const days = dates.length > 1 ? (new Date(dates.at(-1)) - new Date(dates[0])) / 86400000 : 0;
    console.log(
      `\n${name} : ${res.status}, ${entries.length} articles (${kept.length} gardés), ` +
        `${entries.filter((e) => e.image).length} avec image, ~${days ? (entries.length / days).toFixed(1) : '?'} / jour`,
    );
    for (const e of entries.slice(0, 3)) {
      const size = e.image ? await probeImageSize(e.image.url) : null;
      const shown = !e.image ? 'pas d’image' : !size ? 'taille inconnue → vignette' : size.width >= LARGE_IMAGE_MIN ? 'grande image' : 'vignette';
      console.log(`      image : ${e.image?.url ?? '—'} ${size ? `${size.width}×${size.height}` : ''} (${shown})`);
      console.log(`  ${isMotoNews(e.title, e.summary) ? '✓' : '✗'} ${e.title}\n      ${e.summary ?? '(pas de résumé)'}`);
    }
  } catch (e) {
    console.log(`\n${name} : ERREUR ${e.message}`);
  }
}
