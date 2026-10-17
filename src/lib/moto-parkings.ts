import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { distanceM, type LatLng } from '@/lib/geo';
import { overpass, type OverpassElement } from '@/lib/pois';

// Parkings moto OpenStreetMap : UNIQUEMENT les vrais parkings moto (amenity=motorcycle_parking ;
// jamais les parkings voiture « motos acceptées »).
// - France : fichiers préparés par scripts/build-parkings.mjs (OSM via QLever), une case par 0,5°,
//   servis par app.passeryder.fr : chargement < 1 s, gardés 7 jours sur l'appareil.
// - Ailleurs (case absente) : API Overpass case par case (0,1° ≈ 11 × 8 km), gardée 14 jours ; une
//   seule requête à la fois, pause de 2 min après une erreur (charte d'usage d'Overpass).
// Rien en dessous du zoom 12 sur la carte.

export type MotoParking = LatLng & {
  /** « n123 », « w456 » : identifiant OSM */
  id: string;
  name: string | null;
  address: string | null;
  /** true payant, false gratuit, null inconnu */
  fee: boolean | null;
  /** Places moto, si renseigné */
  capacity: number | null;
  covered: boolean;
};

/** Zoom minimal pour charger et afficher les parkings */
export const PARKINGS_MIN_ZOOM = 12;
/** Au plus 150 repères (les plus proches du centre) : Paris compte des milliers de parkings moto */
const MAX_SHOWN = 150;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// ---------- Cases préparées (France) ----------

const TILE = 0.5;
const TILE_TTL_MS = 7 * 24 * 3600_000;
const TILE_CACHE_KEY = 'moto.parkings.tiles.v1';
const TILE_CACHE_MAX = 24;
const TILES_URL = `${Platform.OS === 'web' ? '' : 'https://app.passeryder.fr'}/data/parkings`;

/** [lat, lon, id, nom, adresse, payant 1/0/null, places, couvert 1/0] (format de build-parkings.mjs) */
type Rec = [number, number, string, string | null, string | null, 0 | 1 | null, number | null, 0 | 1];
/** null : pas de fichier pour cette case (hors France) → Overpass */
const tiles = new Map<string, MotoParking[] | null>();
const tilesLoading = new Map<string, Promise<void>>();

const tileKey = (i: number, j: number) => `${i}_${j}`;

const fromRec = (r: Rec): MotoParking => ({
  latitude: r[0],
  longitude: r[1],
  id: r[2],
  name: r[3],
  address: r[4],
  fee: r[5] == null ? null : r[5] === 1,
  capacity: r[6],
  covered: r[7] === 1,
});

function readTileCache(): Record<string, { t: number; recs: Rec[] }> {
  try {
    return JSON.parse(localStorage.getItem(TILE_CACHE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function loadTile(key: string): Promise<void> {
  if (tiles.has(key)) return Promise.resolve();
  const saved = readTileCache()[key];
  if (saved && Date.now() - saved.t < TILE_TTL_MS) {
    tiles.set(key, saved.recs.map(fromRec));
    return Promise.resolve();
  }
  const pending = tilesLoading.get(key);
  if (pending) return pending;
  const p = (async () => {
    let recs: Rec[] | null = null;
    try {
      const res = await fetch(`${TILES_URL}/${key}.json`);
      // Case absente : le serveur web répond par la page de l'app (HTML) ou une erreur
      const body = res.ok ? await res.text() : '';
      const json = body.startsWith('[') ? (JSON.parse(body) as Rec[]) : null;
      recs = Array.isArray(json) ? json : null;
    } catch {
      // réseau : on réessaiera au prochain mouvement de carte
      tilesLoading.delete(key);
      throw new Error('Parkings indisponibles');
    }
    tiles.set(key, recs ? recs.map(fromRec) : null);
    tilesLoading.delete(key);
    if (recs) {
      try {
        const c = readTileCache();
        c[key] = { t: Date.now(), recs };
        const keys = Object.keys(c).sort((a, b) => c[b].t - c[a].t);
        for (const k of keys.slice(TILE_CACHE_MAX)) delete c[k];
        localStorage.setItem(TILE_CACHE_KEY, JSON.stringify(c));
      } catch {
        // stockage plein : la case reste en mémoire
      }
    }
    notify();
  })();
  tilesLoading.set(key, p);
  return p;
}

function tilesIn(center: LatLng, radiusDeg: number): string[] {
  const rl = radiusDeg / Math.max(0.3, Math.cos((center.latitude * Math.PI) / 180));
  const out: string[] = [];
  for (let i = Math.floor((center.latitude - radiusDeg) / TILE); i <= Math.floor((center.latitude + radiusDeg) / TILE); i++)
    for (let j = Math.floor((center.longitude - rl) / TILE); j <= Math.floor((center.longitude + rl) / TILE); j++)
      out.push(tileKey(i, j));
  return out;
}

// ---------- Overpass (hors France) ----------

const CELL = 0.1;
const TTL_MS = 14 * 24 * 3600_000;
const MAX_CELLS = 150;
const CACHE_KEY = 'moto.parkings.v2';

type Cell = { t: number; items: MotoParking[] };
let cache: Record<string, Cell> | null = null;
let inFlight = false;
let pausedUntil = 0;

function load(): Record<string, Cell> {
  if (cache) return cache;
  try {
    // v1 contenait aussi les parkings voiture « motos acceptées »
    localStorage.removeItem('moto.parkings.v1');
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') ?? {};
  } catch {
    cache = {};
  }
  return cache!;
}

function save() {
  const c = load();
  const keys = Object.keys(c).sort((a, b) => c[b].t - c[a].t);
  for (const k of keys.slice(MAX_CELLS)) delete c[k];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // stockage plein : le cache reste en mémoire
  }
}

const cellKey = (i: number, j: number) => `${i}:${j}`;

/** Rayon (degrés) de la zone affichée selon le zoom */
const viewRadius = (zoom: number) => (zoom >= 15 ? 0.03 : zoom >= 14 ? 0.05 : zoom >= 13 ? 0.09 : 0.16);

/** Cases Overpass couvrant la zone, hors cases préparées (France) */
function cellsAround(center: LatLng, r: number): [number, number][] {
  const i0 = Math.floor((center.latitude - r) / CELL);
  const i1 = Math.floor((center.latitude + r) / CELL);
  const rl = r / Math.max(0.3, Math.cos((center.latitude * Math.PI) / 180));
  const j0 = Math.floor((center.longitude - rl) / CELL);
  const j1 = Math.floor((center.longitude + rl) / CELL);
  const out: [number, number][] = [];
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      const t = tiles.get(tileKey(Math.floor((i * CELL + CELL / 2) / TILE), Math.floor((j * CELL + CELL / 2) / TILE)));
      if (t === null) out.push([i, j]);
    }
  return out;
}

function address(tags: Record<string, string>) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:city']].filter(Boolean).join(', ') || null;
}

/** Élément Overpass → parking moto */
export function toParking(el: OverpassElement): MotoParking | null {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null || !el.type || el.id == null) return null;
  const tags = el.tags ?? {};
  const capRaw = tags['capacity:motorcycle'] ?? tags.capacity;
  const capacity = capRaw && /^\d+$/.test(capRaw) ? Number(capRaw) : null;
  const fee = tags.fee === 'yes' ? true : tags.fee === 'no' ? false : null;
  return {
    id: el.type[0] + el.id,
    latitude: lat,
    longitude: lon,
    name: tags.name || null,
    address: address(tags),
    fee,
    capacity,
    covered: tags.covered === 'yes',
  };
}

const FILTER = (area: string) => `nwr["amenity"="motorcycle_parking"](${area});`;

async function fetchCells(cells: [number, number][]) {
  const is = cells.map((c) => c[0]);
  const js = cells.map((c) => c[1]);
  const s = Math.min(...is) * CELL;
  const n = (Math.max(...is) + 1) * CELL;
  const w = Math.min(...js) * CELL;
  const e = (Math.max(...js) + 1) * CELL;
  const bbox = `${s.toFixed(3)},${w.toFixed(3)},${n.toFixed(3)},${e.toFixed(3)}`;
  const elements = await overpass(`[out:json][timeout:25];(${FILTER(bbox)});out center tags 2000;`);
  const c = load();
  const now = Date.now();
  for (const [i, j] of cells) c[cellKey(i, j)] = { t: now, items: [] };
  for (const el of elements) {
    const p = toParking(el);
    if (!p) continue;
    const k = cellKey(Math.floor(p.latitude / CELL), Math.floor(p.longitude / CELL));
    c[k]?.items.push(p);
  }
  save();
  notify();
}

// ---------- Lecture ----------

/** Parkings connus (cases préparées + Overpass) à moins de radiusM, du plus proche au plus loin */
function known(center: LatLng, radiusM: number): (MotoParking & { distanceM: number })[] {
  const r = radiusM / 111_000;
  const all: MotoParking[] = [];
  for (const k of tilesIn(center, r)) all.push(...(tiles.get(k) ?? []));
  const c = load();
  for (const [i, j] of cellsAround(center, r)) all.push(...(c[cellKey(i, j)]?.items ?? []));
  const out: (MotoParking & { distanceM: number })[] = [];
  for (const p of all) {
    const d = distanceM(center, p);
    if (d <= radiusM) out.push({ ...p, distanceM: d });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

function visible(center: LatLng, zoom: number): MotoParking[] {
  return known(center, viewRadius(zoom) * 111_000 * 1.4).slice(0, MAX_SHOWN);
}

/**
 * Parkings moto de la zone affichée (vide si désactivé ou zoom < 12). Charge les cases manquantes
 * et se met à jour quand elles arrivent.
 */
export function useMotoParkings(view: { center: LatLng; zoom: number } | null, enabled: boolean): MotoParking[] {
  const [, setTick] = useState(0);
  const lat = view ? Math.round(view.center.latitude * 200) / 200 : null;
  const lng = view ? Math.round(view.center.longitude * 200) / 200 : null;
  const zoom = view ? Math.round(view.zoom) : 0;
  const active = enabled && lat != null && lng != null && zoom >= PARKINGS_MIN_ZOOM;

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const center = { latitude: lat!, longitude: lng! };
      const r = viewRadius(zoom) * 1.4;
      await Promise.all(tilesIn(center, r).map((k) => loadTile(k).catch(() => {})));
      // Cases sans fichier (hors France) : Overpass
      if (cancelled || inFlight || Date.now() < pausedUntil) return;
      const c = load();
      const now = Date.now();
      const missing = cellsAround(center, viewRadius(zoom)).filter(([i, j]) => {
        const cell = c[cellKey(i, j)];
        return !cell || now - cell.t > TTL_MS;
      });
      if (!missing.length || missing.length > 9) return;
      inFlight = true;
      fetchCells(missing)
        .catch(() => {
          pausedUntil = Date.now() + 120_000;
        })
        .finally(() => {
          inFlight = false;
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, lat, lng, zoom]);

  return active ? visible({ latitude: lat!, longitude: lng! }, zoom) : [];
}

/** Parkings déjà chargés sur l'appareil à moins de radiusM : instantané */
export function cachedParkings(center: LatLng, radiusM: number): (MotoParking & { distanceM: number })[] {
  for (const k of tilesIn(center, radiusM / 111_000)) if (!tiles.has(k)) loadTile(k).catch(() => {});
  return known(center, radiusM);
}

/**
 * Parkings moto les plus proches (recherche « parking moto ») : cases préparées (France, < 1 s),
 * sinon Overpass dans radiusM (8 s max).
 */
export async function nearestParkings(center: LatLng, radiusM = 5000, limit = 10): Promise<(MotoParking & { distanceM: number })[]> {
  const keys = tilesIn(center, radiusM / 111_000);
  const loaded = await Promise.all(keys.map((k) => loadTile(k).then(() => true, () => false)));
  if (loaded.every(Boolean) && keys.every((k) => tiles.get(k) != null)) return known(center, radiusM).slice(0, limit);
  const ll = `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)}`;
  const elements = await overpass(`[out:json][timeout:8];(${FILTER(`around:${radiusM},${ll}`)});out center tags 300;`, {
    timeoutMs: 8000,
  });
  return elements
    .map(toParking)
    .filter((p): p is MotoParking => !!p)
    .map((p) => ({ ...p, distanceM: distanceM(center, p) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/** Libellé d'un parking (nom OSM, sinon « Parking moto ») */
export const parkingTitle = (p: MotoParking) => (p.name ? (/^\d+$/.test(p.name) ? `Parking moto n° ${p.name}` : p.name) : 'Parking moto');

/** « Gratuit · 12 places · couvert » */
export function parkingFacts(p: MotoParking): string {
  return [
    p.fee === true ? 'Payant' : p.fee === false ? 'Gratuit' : null,
    p.capacity ? `${p.capacity} place${p.capacity > 1 ? 's' : ''} moto` : null,
    p.covered ? 'Couvert' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
