import { distanceM, type LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';

// Import / export GPX (format standard des GPS et applis moto : Calimoto, Kurviger, Garmin…).
// Fonctions pures : la lecture et l'écriture des fichiers sont dans gpx-file.ts / .web.ts.

export type GpxPoint = LatLng & { time?: number; ele?: number };

export type GpxData = {
  name: string | null;
  /** Tracé (trace enregistrée ou itinéraire) */
  points: GpxPoint[];
  /** Points d'intérêt (wpt) */
  waypoints: Place[];
};

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const coord = (n: number) => n.toFixed(6);

/** Fichier GPX : trace (trk) avec horaires si connus, et points nommés (wpt). */
export function buildGpx({ name, points, waypoints = [] }: { name: string; points: GpxPoint[]; waypoints?: Place[] }) {
  const wpts = waypoints
    .map((w) => `  <wpt lat="${coord(w.latitude)}" lon="${coord(w.longitude)}"><name>${escape(w.label)}</name></wpt>`)
    .join('\n');
  const trkpts = points
    .map((p) => {
      const time = p.time ? `<time>${new Date(p.time).toISOString()}</time>` : '';
      const ele = p.ele !== undefined ? `<ele>${p.ele.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${coord(p.latitude)}" lon="${coord(p.longitude)}">${ele}${time}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PasseRyder https://passeryder.fr" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escape(name)}</name><time>${new Date().toISOString()}</time></metadata>
${wpts ? `${wpts}\n` : ''}  <trk>
    <name>${escape(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

const unescape = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`));
  return m ? Number(m[1]) : NaN;
}

function childText(body: string, name: string) {
  const m = body.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  return m ? unescape(m[1]) : null;
}

/** Points d'un type de balise (trkpt, rtept, wpt), avec leur contenu */
function elements(xml: string, tag: string): { open: string; body: string }[] {
  const out: { open: string; body: string }[] = [];
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ open: m[1], body: m[2] ?? '' });
  return out;
}

/** Lecture d'un fichier GPX : trace (trk) sinon itinéraire (rte), et points nommés. */
export function parseGpx(xml: string): GpxData {
  if (!/<gpx[\s>]/i.test(xml)) throw new Error('Ce fichier n’est pas un GPX.');
  const toPoint = ({ open, body }: { open: string; body: string }): GpxPoint | null => {
    const latitude = attr(open, 'lat');
    const longitude = attr(open, 'lon');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const t = childText(body, 'time');
    const time = t ? Date.parse(t) : NaN;
    return { latitude, longitude, ...(Number.isFinite(time) ? { time } : {}) };
  };
  let points = elements(xml, 'trkpt').map(toPoint).filter((p): p is GpxPoint => !!p);
  if (points.length < 2) points = elements(xml, 'rtept').map(toPoint).filter((p): p is GpxPoint => !!p);
  const waypoints = elements(xml, 'wpt')
    .map((e, i) => {
      const p = toPoint(e);
      return p ? { latitude: p.latitude, longitude: p.longitude, label: childText(e.body, 'name') || `Point ${i + 1}` } : null;
    })
    .filter((w): w is Place => !!w);
  // Un GPX avec seulement des wpt : on les relie dans l'ordre
  if (points.length < 2 && waypoints.length >= 2) points = waypoints.map(({ latitude, longitude }) => ({ latitude, longitude }));
  if (points.length < 2) throw new Error('Aucun tracé trouvé dans ce fichier GPX.');
  const name = childText(xml.match(/<(?:\w+:)?trk\b[\s\S]*?<\/(?:\w+:)?trk>/)?.[0] ?? '', 'name') ?? childText(xml, 'name');
  return { name, points, waypoints };
}

export function trackLengthM(points: LatLng[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}

/** Distance d'un point au segment [a, b] (approximation plane, suffisante à courte distance) */
function segmentDistanceM(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos((p.latitude * Math.PI) / 180);
  const ax = a.longitude * k, ay = a.latitude, bx = b.longitude * k, by = b.latitude, px = p.longitude * k, py = p.latitude;
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return Math.sqrt(x * x + y * y) * 111_320;
}

/** Douglas-Peucker : garde la forme du tracé avec au plus maxPoints points */
export function simplifyTrack<T extends LatLng>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  let tolerance = 5;
  let result = points;
  while (result.length > maxPoints && tolerance < 5000) {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      let max = 0, idx = -1;
      for (let i = s + 1; i < e; i++) {
        const d = segmentDistanceM(points[i], points[s], points[e]);
        if (d > max) {
          max = d;
          idx = i;
        }
      }
      if (idx >= 0 && max > tolerance) {
        keep[idx] = 1;
        stack.push([s, idx], [idx, e]);
      }
    }
    result = points.filter((_, i) => keep[i]);
    tolerance *= 2;
  }
  return result;
}

/** Points de passage répartis le long d'un tracé (pour le faire suivre au calcul d'itinéraire) */
export function viaPointsAlong(points: LatLng[], count: number): LatLng[] {
  if (points.length < 3 || count <= 0) return [];
  const total = trackLengthM(points);
  const out: LatLng[] = [];
  let acc = 0;
  let next = total / (count + 1);
  for (let i = 1; i < points.length && out.length < count; i++) {
    acc += distanceM(points[i - 1], points[i]);
    if (acc >= next) {
      out.push(points[i]);
      next += total / (count + 1);
    }
  }
  return out;
}

/** Nom de fichier sans caractères interdits */
export function gpxFileName(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${base || 'trajet'}.gpx`;
}

// ---------- GPX importé en attente (passé d'un écran à l'autre) ----------

let pending: GpxData | null = null;

export function setPendingGpx(data: GpxData | null) {
  pending = data;
}

/** Récupère (et retire) le GPX importé en attente */
export function takePendingGpx() {
  const data = pending;
  pending = null;
  return data;
}
