// Actus moto : teste le lecteur RSS et le filtre (supabase/functions/fetch-news/rss.ts) sur des
// exemples, puis sur les vrais flux (lecture seule, rien n'est écrit en base) et le mélange du Mur.
// node --import ./scripts/dev/register.mjs scripts/dev/news-test.mjs [--offline]
import assert from 'node:assert/strict';

import { feedCharset, isMotoNews, parseFeed, shortSummary, toText } from '../../supabase/functions/fetch-news/rss.ts';
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
assert.equal(a.imageUrl, 'https://www.exemple.fr/i.jpg');
assert.equal(a.guid, 'kle500');
assert.equal(a.summary, 'Kawasaki étend sa gamme. Une version A2 arrive.');
assert.equal(a.publishedAt, '2026-10-18T07:00:00.000Z');

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
        `${entries.filter((e) => e.imageUrl).length} avec image, ~${days ? (entries.length / days).toFixed(1) : '?'} / jour`,
    );
    for (const e of entries.slice(0, 3)) {
      console.log(`  ${isMotoNews(e.title, e.summary) ? '✓' : '✗'} ${e.title}\n      ${e.summary ?? '(pas de résumé)'}`);
    }
  } catch (e) {
    console.log(`\n${name} : ERREUR ${e.message}`);
  }
}
