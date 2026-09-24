import { distanceM, type LatLng } from '@/lib/geo';
import type { RouteOptions } from '@/lib/moto';

// Moteur de navigation : calcul d'itinéraire avec instructions, position sur le
// trajet, prochaine manœuvre. Fonctions pures, testables sans téléphone.
//
// - Itinéraire normal : OSRM (serveur public), instructions rédigées ici en français.
// - Options (50 cm³, éviter autoroutes / péages / non goudronné, route plaisir) : les serveurs
//   OSRM publics ne les gèrent pas ; on passe par Valhalla (serveur public FOSSGIS), qui fournit
//   ses instructions en français. Profil « motor_scooter » (45 km/h, jamais d'autoroute) pour les 50 cm³.

export type ManeuverIcon =
  | 'straight'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'roundabout'
  | 'arrive'
  | 'depart';

export type NavStep = {
  /** Point de la manœuvre */
  location: LatLng;
  /** Distance depuis le départ, le long du tracé (m) */
  alongM: number;
  icon: ManeuverIcon;
  /** Action : « Tournez à droite » */
  action: string;
  /** Rue ou route empruntée ensuite */
  road: string | null;
};

export type NavRoute = {
  points: LatLng[];
  /** Distance cumulée à chaque point (m) */
  cumulative: number[];
  distanceM: number;
  durationS: number;
  steps: NavStep[];
  engine: 'osrm' | 'valhalla';
  /** Options réellement appliquées (null = itinéraire standard OSRM) */
  options: RouteOptions | null;
};

const TIMEOUT_MS = 12_000;

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = await res.json();
    return { ok: res.ok, json };
  } finally {
    clearTimeout(timer);
  }
}

/** L'itinéraire standard OSRM suffit-il pour ces options ? */
export function needsValhalla(o: RouteOptions) {
  return o.scooter50 || o.avoidHighways || o.avoidTolls || o.style === 'fun' || o.preferTrails;
}

/**
 * Itinéraire de from à to. Lève une erreur si aucun calcul n'est possible.
 * 50 cm³ : jamais de repli sur OSRM (il passerait par l'autoroute, interdite).
 */
export async function fetchNavRoute(from: LatLng, to: LatLng, options: RouteOptions): Promise<NavRoute> {
  if (needsValhalla(options)) {
    try {
      return await fetchValhalla([from, to], options);
    } catch (e) {
      if (options.scooter50) throw new Error('Itinéraire 50 cm³ indisponible pour le moment (serveur injoignable)');
      console.warn('Valhalla indisponible, itinéraire standard', e);
    }
  }
  return fetchOsrm(from, to);
}

/** Paramètres Valhalla correspondant aux options */
export function valhallaCosting(o: RouteOptions): { costing: string; options: Record<string, unknown> } {
  const exclusions = {
    ...(o.avoidTolls ? { exclude_tolls: true } : {}),
    ...(o.avoidUnpaved ? { exclude_unpaved: true } : {}),
  };
  if (o.scooter50) {
    // Cyclomoteur : 45 km/h, le profil exclut de lui-même autoroutes et voies rapides
    return { costing: 'motor_scooter', options: { top_speed: 45, use_primary: 0.5, ...exclusions } };
  }
  if (o.style === 'fun') {
    // Route plaisir : petites routes (on évite les grands axes), relief bienvenu
    return {
      costing: 'motor_scooter',
      options: { top_speed: 90, use_primary: 0, use_hills: 1, use_trails: o.preferTrails ? 0.8 : 0, ...exclusions },
    };
  }
  return {
    costing: 'motorcycle',
    options: {
      ...(o.avoidHighways ? { exclude_highways: true } : {}),
      use_trails: o.avoidUnpaved ? 0 : o.preferTrails ? 1 : 0.3,
      ...exclusions,
    },
  };
}

// ---------- OSRM ----------

type OsrmStep = {
  name: string;
  ref?: string;
  distance: number;
  maneuver: { type: string; modifier?: string; exit?: number; location: [number, number] };
};

async function fetchOsrm(from: LatLng, to: LatLng): Promise<NavRoute> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const { ok, json } = await fetchJson(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
  );
  const route = json.routes?.[0];
  if (!ok || !route) throw new Error("Impossible de calculer l'itinéraire");
  const points: LatLng[] = route.geometry.coordinates.map(([longitude, latitude]: [number, number]) => ({ latitude, longitude }));
  const cumulative = cumulate(points);
  const steps: NavStep[] = [];
  let searchFrom = 0;
  for (const s of route.legs[0].steps as OsrmStep[]) {
    const location = { latitude: s.maneuver.location[1], longitude: s.maneuver.location[0] };
    // Index du point du tracé le plus proche de la manœuvre (en avançant, pour rester dans l'ordre)
    const index = nearestIndex(points, location, searchFrom);
    searchFrom = index;
    const text = osrmInstruction(s);
    if (!text) continue;
    steps.push({ location, alongM: cumulative[index], ...text });
  }
  return {
    points,
    cumulative,
    distanceM: route.distance,
    durationS: route.duration,
    steps,
    engine: 'osrm',
    options: null,
  };
}

const MODIFIERS: Record<string, { text: string; icon: ManeuverIcon }> = {
  left: { text: 'à gauche', icon: 'left' },
  right: { text: 'à droite', icon: 'right' },
  'slight left': { text: 'légèrement à gauche', icon: 'slight-left' },
  'slight right': { text: 'légèrement à droite', icon: 'slight-right' },
  'sharp left': { text: 'franchement à gauche', icon: 'sharp-left' },
  'sharp right': { text: 'franchement à droite', icon: 'sharp-right' },
  straight: { text: 'tout droit', icon: 'straight' },
  uturn: { text: 'demi-tour', icon: 'uturn' },
};

function ordinal(n: number) {
  return n === 1 ? '1re' : `${n}e`;
}

/** Instruction en français à partir d'une étape OSRM (null = étape à ne pas annoncer). */
export function osrmInstruction(s: OsrmStep): { icon: ManeuverIcon; action: string; road: string | null } | null {
  const { type, modifier, exit } = s.maneuver;
  const mod = MODIFIERS[modifier ?? 'straight'] ?? MODIFIERS.straight;
  const road = s.name || s.ref || null;
  switch (type) {
    case 'depart':
      return { icon: 'depart', action: 'Partez', road };
    case 'arrive':
      return { icon: 'arrive', action: 'Vous êtes arrivé', road: null };
    case 'turn':
      if (modifier === 'uturn') return { icon: 'uturn', action: 'Faites demi-tour', road };
      if (modifier === 'straight') return { icon: 'straight', action: 'Continuez tout droit', road };
      return { icon: mod.icon, action: `Tournez ${mod.text}`, road };
    case 'end of road':
      return { icon: mod.icon, action: `Au bout de la route, tournez ${mod.text}`, road };
    case 'fork':
      return { icon: mod.icon, action: `À l'embranchement, restez ${mod.text}`, road };
    case 'merge':
      return { icon: mod.icon, action: `Insérez-vous ${mod.text}`, road };
    case 'on ramp':
      return { icon: mod.icon, action: `Prenez la bretelle ${mod.text}`, road };
    case 'off ramp':
      return { icon: mod.icon, action: `Prenez la sortie ${mod.text}`, road };
    case 'roundabout':
    case 'rotary':
      return {
        icon: 'roundabout',
        action: exit ? `Au rond-point, prenez la ${ordinal(exit)} sortie` : 'Au rond-point, continuez',
        road,
      };
    case 'roundabout turn':
      return { icon: mod.icon, action: `Au rond-point, tournez ${mod.text}`, road };
    case 'continue':
    case 'new name':
      // Simple changement de nom de rue tout droit : rien à annoncer
      if (!modifier || modifier === 'straight') return null;
      return { icon: mod.icon, action: `Continuez ${mod.text}`, road };
    case 'exit roundabout':
    case 'exit rotary':
    case 'notification':
    case 'use lane':
      return null;
    default:
      return { icon: mod.icon, action: `Continuez ${mod.text}`, road };
  }
}

// ---------- Valhalla (éviter autoroutes) ----------

type ValhallaManeuver = { type: number; instruction: string; street_names?: string[]; begin_shape_index: number };

export async function fetchValhalla(stops: LatLng[], routeOptions: RouteOptions): Promise<NavRoute> {
  const { costing, options } = valhallaCosting(routeOptions);
  const body = {
    locations: stops.map((p) => ({ lat: p.latitude, lon: p.longitude })),
    costing,
    costing_options: { [costing]: options },
    directions_options: { language: 'fr-FR', units: 'kilometers' },
  };
  const { ok, json } = await fetchJson('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const legs = json.trip?.legs as { shape: string; maneuvers: ValhallaManeuver[] }[] | undefined;
  if (!ok || !legs?.length) throw new Error(json.error ?? 'Valhalla : pas d’itinéraire');
  // Un tronçon par étape : on les met bout à bout
  const points: LatLng[] = [];
  const legStarts: number[] = [];
  for (const leg of legs) {
    legStarts.push(points.length);
    points.push(...decodePolyline6(leg.shape));
  }
  const cumulative = cumulate(points);
  const steps: NavStep[] = legs.flatMap((leg, li) =>
    leg.maneuvers
      // Arrivée intermédiaire à une étape : pas d'annonce « vous êtes arrivé »
      .filter((m) => li === legs.length - 1 || valhallaIcon(m.type) !== 'arrive')
      .map((m) => {
        const index = Math.min(legStarts[li] + m.begin_shape_index, points.length - 1);
        return {
          location: points[index],
          alongM: cumulative[index],
          icon: valhallaIcon(m.type),
          // Valhalla rédige déjà l'instruction complète en français
          action: m.instruction.replace(/\.$/, ''),
          road: null,
        };
      }),
  );
  return {
    points,
    cumulative,
    distanceM: json.trip.summary.length * 1000,
    durationS: json.trip.summary.time,
    steps,
    engine: 'valhalla',
    options: routeOptions,
  };
}

function valhallaIcon(type: number): ManeuverIcon {
  switch (type) {
    case 1:
    case 2:
    case 3:
      return 'depart';
    case 4:
    case 5:
    case 6:
      return 'arrive';
    case 9:
    case 23:
    case 18:
    case 20:
      return 'slight-right';
    case 10:
      return 'right';
    case 11:
      return 'sharp-right';
    case 12:
    case 13:
      return 'uturn';
    case 14:
      return 'sharp-left';
    case 15:
      return 'left';
    case 16:
    case 24:
    case 19:
    case 21:
      return 'slight-left';
    case 26:
    case 27:
      return 'roundabout';
    default:
      return 'straight';
  }
}

/** Décodage du format « polyline » à 6 décimales utilisé par Valhalla. */
export function decodePolyline6(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const coord of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (coord === 0) lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e6, longitude: lng / 1e6 });
  }
  return points;
}

// ---------- Position sur le trajet ----------

function cumulate(points: LatLng[]) {
  const c = [0];
  for (let i = 1; i < points.length; i++) c.push(c[i - 1] + distanceM(points[i - 1], points[i]));
  return c;
}

function nearestIndex(points: LatLng[], p: LatLng, from = 0) {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i < points.length; i++) {
    const d = distanceM(points[i], p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export type RouteProjection = {
  /** Distance parcourue le long du tracé (m) */
  alongM: number;
  /** Écart entre ma position et le tracé (m) */
  offRouteM: number;
};

/** Projette un point sur le tracé : où en suis-je, et à quelle distance du trajet ? */
export function projectOnRoute(route: Pick<NavRoute, 'points' | 'cumulative'>, p: LatLng): RouteProjection {
  const { points, cumulative } = route;
  let best: RouteProjection = { alongM: 0, offRouteM: Infinity };
  // Coordonnées locales en mètres autour de p (précis à l'échelle d'un trajet)
  const kx = 111_320 * Math.cos((p.latitude * Math.PI) / 180);
  const ky = 110_540;
  for (let i = 1; i < points.length; i++) {
    const ax = (points[i - 1].longitude - p.longitude) * kx;
    const ay = (points[i - 1].latitude - p.latitude) * ky;
    const bx = (points[i].longitude - p.longitude) * kx;
    const by = (points[i].latitude - p.latitude) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < best.offRouteM) {
      best = { offRouteM: d, alongM: cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1]) };
    }
  }
  return best;
}

/** Prochaine manœuvre après la distance parcourue. */
export function nextStep(route: NavRoute, alongM: number): { step: NavStep; index: number; distanceM: number } | null {
  for (let i = 0; i < route.steps.length; i++) {
    const s = route.steps[i];
    if (s.icon === 'depart') continue;
    if (s.alongM > alongM + 5) return { step: s, index: i, distanceM: s.alongM - alongM };
  }
  return null;
}

/** Distance arrondie à l'oral : « 300 mètres », « 1,5 kilomètre ». */
export function spokenDistance(m: number) {
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10;
    return `${String(km).replace('.', ',')} kilomètre${km >= 2 ? 's' : ''}`;
  }
  const rounded = m > 300 ? Math.round(m / 100) * 100 : Math.max(10, Math.round(m / 10) * 10);
  return `${rounded} mètres`;
}

export function shortDistance(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1).replace('.', ',')} km`;
  return `${m > 300 ? Math.round(m / 50) * 50 : Math.round(m / 10) * 10} m`;
}

/** Phrase complète : « Dans 300 mètres, tournez à droite sur Rue X ». */
export function stepSentence(step: NavStep, inM?: number) {
  const action = step.road ? `${step.action} sur ${step.road}` : step.action;
  if (inM === undefined) return action;
  return `Dans ${spokenDistance(inM)}, ${action.charAt(0).toLowerCase()}${action.slice(1)}`;
}

/** Cap en degrés de a vers b (0 = nord, 90 = est). */
export function bearingDeg(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
