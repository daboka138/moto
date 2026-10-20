import { useEffect, useMemo, useRef, useState } from 'react';

import { zoneAnnouncement, type DangerZone, type ZoneRoad, type ZoneSegment } from '@/lib/danger-zone-segments';
import type { LatLng } from '@/lib/geo';
import type { NavRoute } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { speak } from '@/lib/voice';

// Zones de danger façon Waze / Coyote (note 32), 100 % légales : construites UNIQUEMENT à partir de vrais
// dangers routiers — points noirs des accidents corporels officiels (ONISR, table danger_zones, importée par
// scripts/danger-zones/build.mjs) et dangers de la commu confirmés. JAMAIS de radar ni de contrôle.
// Annonce volontairement vague : « Zone de danger sur 2 kilomètres, prudence. », jamais la nature exacte.

/** Hors navigation : zones visibles seulement de près */
export const ZONES_MIN_ZOOM = 14;
const SAMPLE_M = 250;

type Row = { id: number; lat: number; lon: number; radius_m: number; road: ZoneRoad };
const toZone = (r: Row): DangerZone => ({ id: r.id, latitude: r.lat, longitude: r.lon, radiusM: r.radius_m, road: r.road });

/** Zones à moins de ~250 m du tracé (points tous les 250 m, filtrées ensuite par projection) */
export async function fetchZonesAlong(route: Pick<NavRoute, 'points' | 'cumulative'>): Promise<DangerZone[]> {
  const lat: number[] = [];
  const lon: number[] = [];
  let next = 0;
  route.points.forEach((p, i) => {
    if (route.cumulative[i] >= next || i === route.points.length - 1) {
      lat.push(+p.latitude.toFixed(5));
      lon.push(+p.longitude.toFixed(5));
      next = route.cumulative[i] + SAMPLE_M;
    }
  });
  const { data, error } = await supabase.rpc('danger_zones_along', { p_lat: lat.slice(0, 3000), p_lon: lon.slice(0, 3000), p_m: SAMPLE_M });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toZone);
}

/** Zones dans un carré autour d'un point (carte hors navigation) */
export async function fetchZonesIn(center: LatLng, radiusM: number): Promise<DangerZone[]> {
  const dLat = radiusM / 110_540;
  const dLng = radiusM / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  const { data, error } = await supabase
    .from('danger_zones')
    .select('id, lat, lon, radius_m, road')
    .gte('lat', center.latitude - dLat)
    .lte('lat', center.latitude + dLat)
    .gte('lon', center.longitude - dLng)
    .lte('lon', center.longitude + dLng)
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toZone);
}

// ---------- Hooks ----------

const routeZones = new WeakMap<object, Promise<DangerZone[]>>();

/** Zones du tracé, chargées une fois par itinéraire */
export function useRouteDangerZones(route: NavRoute | null, enabled: boolean): DangerZone[] {
  const [loaded, setLoaded] = useState<{ route: NavRoute | null; zones: DangerZone[] }>({ route: null, zones: [] });
  useEffect(() => {
    if (!route || !enabled) return;
    let alive = true;
    let p = routeZones.get(route);
    if (!p) {
      p = fetchZonesAlong(route);
      routeZones.set(route, p);
      // Échec (réseau) : nouvel essai au prochain affichage
      p.catch(() => routeZones.delete(route));
    }
    p.then((zones) => alive && setLoaded({ route, zones })).catch(() => {});
    return () => {
      alive = false;
    };
  }, [route, enabled]);
  return loaded.route === route && enabled ? loaded.zones : [];
}

/** Hors navigation : zones de la zone affichée, zoom ≥ 14 seulement (cache mémoire par case de ~2 km) */
const CELL = 0.02;
const cellCache = new Map<string, DangerZone[]>();
export function useMapDangerZones(view: { center: LatLng; zoom: number } | null, enabled: boolean): DangerZone[] {
  const [tick, setTick] = useState(0);
  const active = enabled && !!view && view.zoom >= ZONES_MIN_ZOOM;
  const i = view ? Math.floor(view.center.latitude / CELL) : 0;
  const j = view ? Math.floor(view.center.longitude / CELL) : 0;
  useEffect(() => {
    if (!active) return;
    const missing: [number, number][] = [];
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) if (!cellCache.has(`${a}:${b}`)) missing.push([a, b]);
    if (!missing.length) return;
    let alive = true;
    const center = { latitude: (i + 0.5) * CELL, longitude: (j + 0.5) * CELL };
    fetchZonesIn(center, CELL * 1.5 * 111_000)
      .then((zones) => {
        for (const [a, b] of missing) cellCache.set(`${a}:${b}`, []);
        for (const z of zones) cellCache.get(`${Math.floor(z.latitude / CELL)}:${Math.floor(z.longitude / CELL)}`)?.push(z);
        if (alive) setTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, i, j]);
  return useMemo(() => {
    if (!active) return [];
    const out: DangerZone[] = [];
    for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) out.push(...(cellCache.get(`${a}:${b}`) ?? []));
    return out;
    // tick : nouvelles cases chargées
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, i, j, tick]);
}

/** En ville, pas plus d'une annonce de zone toutes les 90 s (sinon une à chaque carrefour) */
const URBAN_COOLDOWN_MS = 90_000;
/** Annonce un peu avant d'entrer dans la zone (~3 s à 60 km/h) */
const ENTER_LEAD_M = 50;

/**
 * Annonce vocale UNE fois en entrant dans une zone de danger officielle (les dangers de la commu ont déjà
 * leur annonce). Renvoie la portion où je suis (bandeau « Zone de danger »).
 */
export function useDangerZoneAlerts(segments: ZoneSegment[], alongM: number | null, enabled: boolean): ZoneSegment | null {
  const spoken = useRef(new Set<number>());
  const lastUrban = useRef(0);
  /** Fin de la dernière zone annoncée : une zone qui la prolonge (voie rapide chargée) n'est pas réannoncée */
  const lastEnd = useRef(-Infinity);
  const current = alongM === null ? null : (segments.find((s) => alongM >= s.fromM - ENTER_LEAD_M && alongM < s.toM) ?? null);
  useEffect(() => {
    if (!enabled || !current || !current.official) return;
    const key = Math.round(current.fromM / 50);
    if (spoken.current.has(key)) return;
    spoken.current.add(key);
    const chained = current.fromM <= lastEnd.current + 200;
    lastEnd.current = current.toM;
    if (chained) return;
    const now = Date.now();
    if (current.road === 'urban') {
      if (now - lastUrban.current < URBAN_COOLDOWN_MS) return;
      lastUrban.current = now;
    }
    speak(zoneAnnouncement(current), false, 'danger');
  }, [enabled, current]);
  return current;
}

export { segmentPoints, zoneSegments, ZONE_LENGTH_M, type DangerZone, type ZoneSegment } from '@/lib/danger-zone-segments';
