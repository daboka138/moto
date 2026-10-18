// Lecture des flux RSS / Atom et filtre des actus moto (pur : aucun accès réseau, testé par
// scripts/dev/news-test.mjs). Droits d'auteur : on ne garde que le titre, 1-2 phrases du résumé
// fourni par le flux, le lien et l'image du flux s'il y en a une. Jamais le contenu de l'article.

export type FeedEntry = {
  guid: string;
  url: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
};

const SUMMARY_MAX = 240;

/** Encodage d'un flux : en-tête HTTP, sinon prologue XML, sinon UTF-8 */
export function feedCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=([\w-]+)/i)?.[1];
  const fromXml = head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1];
  return (fromXml || fromHeader || 'utf-8').toLowerCase();
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç',
  ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', laquo: '«', raquo: '»', deg: '°', euro: '€',
  Eacute: 'É', Egrave: 'È', Agrave: 'À', Ccedil: 'Ç', oelig: 'œ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

/** Contenu brut d'une balise (premier trouvé parmi les noms donnés) */
function tag(block: string, names: string[]): string | null {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'));
    if (m) return unCdata(m[1]).trim();
  }
  return null;
}

/** HTML → texte simple */
export function toText(html: string): string {
  let s = unCdata(html);
  // Certains flux échappent le HTML (&lt;p&gt;) : on le décode d'abord
  if (/&lt;\w/.test(s)) s = decodeEntities(s);
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

/** 1-2 phrases, 240 caractères max */
export function shortSummary(text: string): string | null {
  // Résumé coupé par le flux (« … », « [...] ») : on garde les phrases complètes seulement
  const cut = /\s*(\[…\]|\[\.\.\.\]|\.\.\.|…)\s*$/.test(text);
  const t = text.replace(/\s*(\[…\]|\[\.\.\.\]|\.\.\.|…)\s*$/, '').trim();
  if (t.length < 20) return null;
  const sentences = t.match(/[^.!?…]+[.!?…]+(\s|$)/g) ?? (cut ? null : [t]);
  if (!sentences) return t.length >= 80 ? t.replace(/\s+\S*$/, '') + '…' : null;
  let out = sentences[0].trim();
  if (sentences[1] && out.length + sentences[1].length <= SUMMARY_MAX) out += ' ' + sentences[1].trim();
  if (out.length > SUMMARY_MAX) out = out.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, '') + '…';
  return out;
}

function httpsUrl(u: string | null | undefined, base: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(decodeEntities(u.trim()), base);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Image fournie par le flux : enclosure / media, sinon première <img> du résumé */
function imageOf(block: string, base: string): string | null {
  const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (enclosure && !/type=["'](?!image)/i.test(enclosure[0])) return httpsUrl(enclosure[1], base);
  const media = block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i);
  if (media) return httpsUrl(media[1], base);
  const html = unCdata(block);
  const decoded = /&lt;img/i.test(html) ? decodeEntities(html) : html;
  const img = decoded.match(/<img[^>]*src=["']([^"']+)["']/i);
  return img ? httpsUrl(img[1], base) : null;
}

/** Articles d'un flux RSS 2.0, RSS 1.0 ou Atom */
export function parseFeed(xml: string, feedUrl: string): FeedEntry[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: FeedEntry[] = [];
  for (const b of blocks) {
    const title = toText(tag(b, ['title']) ?? '');
    const atomLink = b.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
    const url = httpsUrl(tag(b, ['link']) || atomLink, feedUrl) ?? null;
    if (!title || !url) continue;
    const guid = tag(b, ['guid', 'id']) || url;
    const desc = tag(b, ['description', 'summary']) ?? '';
    const date = tag(b, ['pubDate', 'dc:date', 'published', 'updated']);
    const parsed = date ? new Date(date) : null;
    out.push({
      guid: guid.slice(0, 500),
      url,
      title: title.slice(0, 300),
      summary: shortSummary(toText(desc)),
      imageUrl: imageOf(b, feedUrl),
      publishedAt: parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    });
  }
  return out;
}

// ---------- Filtre ----------

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Règle de l'app : jamais de police, contrôles, radars, retraits de permis */
const EXCLUDE = [
  /\bpolic/, /\bgendarm/, /\bradars?\b/, /\bcontroles?\b/, /\bcontroler\b/, /retraits? de permis/, /permis (suspendu|retire|annule)/,
  /\bpoints? (de|du) permis/, /perte de points/, /\bretrait de points/, /\bamendes?\b/, /\bpv\b/, /\bverbalis/,
  /\bflashe/, /exces de vitesse/, /\bfourriere/, /garde a vue/, /\binterpell/, /\bcrs\b/, /\bdouane/, /\bjumelles\b/,
];

const MOTO = [
  /\bmotos?\b/, /\bmotard/, /\bmotocycl/, /\bdeux[- ]roues\b/, /\b2rm\b/, /\bscooters?\b/, /\btrails?\b/, /\broadsters?\b/,
  /\bsportives?\b/, /\bcustoms?\b/, /\bbobber/, /\bcafe racer/, /\bcasques?\b/, /\bblousons?\b/, /\bgants\b/, /\bpneus?\b/,
  /\bmotogp\b/, /\bsuperbike/, /\bwsbk\b/, /\bdakar\b/, /\benduro\b/, /\bmotocross\b/, /\bsupermotard/, /\bbalades?\b/,
  /\bcylindree/, /\b\d{2,4} ?cc\b/, /\bcm3\b/, /\bpermis a2?\b/, /\ba2\b/, /\bbicylindre/, /\btricylindre/, /\bmonocylindre/,
  /\bhonda\b/, /\byamaha\b/, /\bkawasaki\b/, /\bsuzuki\b/, /\bducati\b/, /\bbmw\b/, /\bktm\b/, /\btriumph\b/, /\bharley/,
  /\baprilia\b/, /\bguzzi\b/, /\broyal enfield\b/, /\bmv agusta\b/, /\bbenelli\b/, /\bcf ?moto\b/, /\bhusqvarna\b/, /\bindian\b/,
  /\bvoge\b/, /\bzontes\b/, /\bpiaggio\b/, /\bvespa\b/, /\bmash\b/, /\bbrixton\b/, /\bfantic\b/, /\bgasgas\b/, /\bbeta\b/,
  /\bnorton\b/, /\bbimota\b/, /\bzero motorcycles\b/, /\bqj ?motor\b/, /\bkymco\b/, /\bsym\b/, /\bpeugeot motocycles\b/,
];

export function isMotoNews(title: string, summary: string | null): boolean {
  const text = fold(`${title} ${summary ?? ''}`);
  if (EXCLUDE.some((r) => r.test(text))) return false;
  return MOTO.some((r) => r.test(text));
}
