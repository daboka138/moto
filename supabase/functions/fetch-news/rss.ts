// Lecture des flux RSS / Atom et filtre des actus moto (pur : aucun accès réseau, testé par
// scripts/dev/news-test.mjs). Droits d'auteur : on ne garde que le titre, 1-2 phrases du résumé
// fourni par le flux, le lien et l'image du flux s'il y en a une. Jamais le contenu de l'article.

export type FeedEntry = {
  guid: string;
  url: string;
  title: string;
  summary: string | null;
  image: FeedImage | null;
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

export type FeedImage = { url: string; width: number | null; height: number | null };

const attr = (tagText: string, name: string) => tagText.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1] ?? null;
const px = (v: string | null) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Plus grande image fournie PAR LE FLUX (jamais la page de l'article) : media:content / media:thumbnail,
 * enclosure, og:image s'il apparaît dans l'article du flux, <img> du résumé (avec la plus grande
 * taille de son srcset). Taille connue d'après les attributs ; sinon mesurée plus tard (imageSize).
 * À taille inconnue, l'ordre compte : media / enclosure d'abord, puis les <img>.
 */
export function pickImage(block: string, base: string): FeedImage | null {
  // main : image mise en avant par le flux (media, enclosure, og:image) ; body : <img> du résumé
  const found: (FeedImage & { main: boolean })[] = [];
  let main = true;
  const add = (u: string | null, width: number | null, height: number | null) => {
    const url = httpsUrl(u, base);
    if (url && !found.some((f) => f.url === url)) found.push({ url, width, height, main });
  };
  for (const t of block.match(/<media:(?:content|thumbnail)[^>]*>/gi) ?? []) {
    const medium = attr(t, 'medium');
    const type = attr(t, 'type');
    if ((medium && medium !== 'image') || (type && !type.startsWith('image'))) continue;
    add(attr(t, 'url'), px(attr(t, 'width')), px(attr(t, 'height')));
  }
  for (const t of block.match(/<enclosure[^>]*>/gi) ?? []) {
    const type = attr(t, 'type');
    if (type && !type.startsWith('image')) continue;
    add(attr(t, 'url'), null, null);
  }
  const html = unCdata(block);
  const decoded = /&lt;(img|meta)/i.test(html) ? decodeEntities(html) : html;
  for (const t of decoded.match(/<meta[^>]*property=["']og:image["'][^>]*>/gi) ?? []) add(attr(t, 'content'), null, null);
  main = false;
  for (const t of decoded.match(/<img[^>]*>/gi) ?? []) {
    const srcset = attr(t, 'srcset');
    if (srcset) {
      // « url 600w, url 1024w » : la plus grande
      const best = srcset
        .split(',')
        .map((part) => part.trim().split(/\s+/))
        .map(([u, d]) => ({ u, w: d?.endsWith('w') ? parseInt(d, 10) : null }))
        .filter((c) => c.u && c.w)
        .sort((a, b) => b.w! - a.w!)[0];
      if (best) add(best.u, best.w, null);
    }
    const width = px(attr(t, 'width'));
    const height = px(attr(t, 'height'));
    add(attr(t, 'src'), width, width ? height : null);
  }
  // L'image mise en avant par le flux d'abord (c'est la photo de l'article), sinon celles du résumé ;
  // dans le groupe, la plus large connue, sinon la première (sa taille sera mesurée)
  const group = found.some((f) => f.main) ? found.filter((f) => f.main) : found;
  if (!group.length) return null;
  const biggest = [...group].filter((f) => f.width).sort((a, b) => b.width! - a.width!)[0];
  const best = biggest && (biggest.width! >= LARGE_IMAGE_MIN || group[0].width !== null) ? biggest : group[0];
  return { url: best.url, width: best.width, height: best.height };
}

/** En dessous : vignette à côté du titre (une miniature étirée en pleine largeur serait pixelisée) */
export const LARGE_IMAGE_MIN = 600;

/** Dimensions d'une image d'après ses premiers octets (JPEG, PNG, GIF, WebP) ; null si inconnu */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG') return { width: u32(16), height: u32(20) };
  if (b.length >= 10 && ascii(0, 3) === 'GIF') return { width: u16le(6), height: u16le(8) };
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: u24le(24) + 1, height: u24le(27) + 1 };
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      // SOF0-SOF15 (sauf DHT C4, JPG C8, DAC CC) : hauteur puis largeur
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16(i + 7), height: u16(i + 5) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + u16(i + 2);
    }
  }
  return null;
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
      image: pickImage(b, feedUrl),
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
