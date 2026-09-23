import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';
import type { ReportType, RoadReport, Vote } from '@/lib/reports';

// Signalements de démo autour de Marseille, sur des routes connues,
// + quelques-uns près de ma position (recalés sur la route la plus proche)
// pour tester les alertes. Rien dans Supabase : votes et ajouts en mémoire.

type Seed = { type: ReportType; at: [number, number]; author: string; minutesAgo: number; confirmations?: number };

const FIXED: Seed[] = [
  { type: 'gravel', at: [43.2003, 5.553], author: 'julie_cb650r', minutesAgo: 95, confirmations: 3 }, // Route des Crêtes, Cap Canaille
  { type: 'oil', at: [43.2356, 5.487], author: 'lucas_mt07', minutesAgo: 40 }, // Col de la Gineste
  { type: 'animal', at: [43.3186, 5.6386], author: 'karim_z900', minutesAgo: 25 }, // Col de l'Espigoulier
  { type: 'roadworks', at: [43.262, 5.397], author: 'sarah.gs', minutesAgo: 60 * 26, confirmations: 7 }, // Bd Michelet
  { type: 'traffic_jam', at: [43.2895, 5.369], author: 'antoine_monster', minutesAgo: 12, confirmations: 2 }, // Tunnel Prado-Carénage
  { type: 'stopped_vehicle', at: [43.279, 5.353], author: 'emi_interceptor', minutesAgo: 35 }, // Corniche Kennedy
  { type: 'accident', at: [43.405, 5.328], author: 'cam_street765', minutesAgo: 18, confirmations: 4 }, // A7, Les Pennes
  { type: 'object', at: [43.296, 5.628], author: 'hugo_gsxs', minutesAgo: 50 }, // Gémenos
  { type: 'danger', at: [43.3337, 5.7231], author: 'lea_tenere', minutesAgo: 60 * 5, confirmations: 1 }, // Sainte-Baume
];

/** Signalements placés autour de ma position : [type, distance m, cap °] */
const NEAR_ME: [ReportType, number, number][] = [
  ['gravel', 800, 30],
  ['roadworks', 1500, 200],
  ['animal', 2500, 110],
];

function iso(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function toReport(seed: Seed, i: number): RoadReport {
  return {
    id: `demo-report-${i}`,
    type: seed.type,
    latitude: seed.at[0],
    longitude: seed.at[1],
    createdAt: iso(seed.minutesAgo),
    expiresAt: iso(-60),
    author: seed.author,
    authorId: seed.author,
    confirmations: seed.confirmations ?? 0,
    removals: 0,
    isDemo: true,
  };
}

function offset(center: LatLng, meters: number, bearing: number): LatLng {
  const rad = (bearing * Math.PI) / 180;
  return {
    latitude: center.latitude + (meters * Math.cos(rad)) / 111_320,
    longitude: center.longitude + (meters * Math.sin(rad)) / (111_320 * Math.cos((center.latitude * Math.PI) / 180)),
  };
}

async function snapToRoad(p: LatLng): Promise<LatLng> {
  try {
    const res = await fetch(`https://router.project-osrm.org/nearest/v1/driving/${p.longitude},${p.latitude}`);
    const json = await res.json();
    const loc: [number, number] | undefined = json.waypoints?.[0]?.location;
    return loc ? { latitude: loc[1], longitude: loc[0] } : p;
  } catch {
    return p;
  }
}

/** Signalements de démo, avec votes et ajouts locaux. */
export function useDemoReports(enabled: boolean, me: LatLng | null, myUsername: string) {
  const [center, setCenter] = useState<LatLng | null>(null);
  if (enabled && me && !center) setCenter(me);
  const [nearMe, setNearMe] = useState<RoadReport[]>([]);
  const [added, setAdded] = useState<RoadReport[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    Promise.all(
      NEAR_ME.map(async ([type, meters, bearing], i) => {
        const at = await snapToRoad(offset(center, meters, bearing));
        return toReport({ type, at: [at.latitude, at.longitude], author: 'lucas_mt07', minutesAgo: 10 + i * 20 }, 100 + i);
      }),
    ).then((r) => !cancelled && setNearMe(r));
    return () => {
      cancelled = true;
    };
  }, [center]);

  if (!enabled) return { reports: [] as RoadReport[], create: () => {}, vote: () => {}, remove: () => {} };

  const reports = [...FIXED.map(toReport), ...nearMe, ...added]
    .filter((r) => !removed.includes(r.id))
    .map((r) => (confirmed[r.id] ? { ...r, confirmations: r.confirmations + confirmed[r.id] } : r));

  return {
    reports,
    create: (type: ReportType, at: LatLng) =>
      setAdded((a) => [
        ...a,
        {
          ...toReport({ type, at: [at.latitude, at.longitude], author: myUsername, minutesAgo: 0 }, 1000 + a.length),
          authorId: 'me',
        },
      ]),
    vote: (id: string, vote: Vote) =>
      vote === 'gone'
        ? setRemoved((r) => [...r, id])
        : setConfirmed((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 })),
    remove: (id: string) => setRemoved((r) => [...r, id]),
  };
}
