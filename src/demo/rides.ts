import { findDemoRiderByUsername } from '@/demo/riders';
import { DEMO_LIVE_RIDE_ID, DEMO_RIDE_TITLE } from '@/demo/social';
import type { Place } from '@/lib/geocoding';
import type { RideDetails, RideLevel, RidePerson, RideSummary, RideVisibility } from '@/lib/rides';

// Balades organisées par les faux motards autour de Marseille.
// Rien dans Supabase : l'inscription est gardée en mémoire (DemoProvider).

export type DemoRideState = {
  friendIds: string[];
  joinedRideIds: string[];
  invitedRideIds: string[];
  /** Trajet de groupe « Route des Crêtes » en cours */
  rideActive: boolean;
};

type DemoRideSeed = {
  id: string;
  title: string;
  organizer: string; // pseudo du faux motard
  participants: string[]; // pseudos (organisateur compris)
  level: RideLevel;
  visibility: RideVisibility;
  /** Jours à partir d'aujourd'hui, heure et minute du RDV */
  day: number;
  time: [number, number];
  meeting: Place;
  start: Place;
  waypoints: Place[];
  end: Place;
  /** Estimations affichées dans la liste (le tracé exact est calculé à l'ouverture) */
  distanceKm: number;
  durationMin: number;
  max: number | null;
  description: string;
  live?: boolean;
};

const P = (label: string, latitude: number, longitude: number): Place => ({ label, latitude, longitude });


const SEEDS: DemoRideSeed[] = [
  {
    id: DEMO_LIVE_RIDE_ID,
    title: DEMO_RIDE_TITLE,
    organizer: 'julie_cb650r',
    participants: ['julie_cb650r', 'antoine_monster', 'emi_interceptor', 'max_sportster'],
    level: 'tranquille',
    visibility: 'friends',
    day: 0,
    time: [-1, 0], // il y a 1 h
    meeting: P('Port de Cassis', 43.2146, 5.5376),
    start: P('Port de Cassis', 43.2146, 5.5376),
    waypoints: [P('Cap Canaille, route des Crêtes', 43.2003, 5.553)],
    end: P('Port de La Ciotat', 43.1748, 5.6047),
    distanceKm: 15,
    durationMin: 23,
    max: 8,
    description: 'La route des Crêtes tranquille, pause photo au Cap Canaille puis glace sur le port de La Ciotat.',
    live: true,
  },
  {
    id: 'demo-ride-2',
    title: 'Balade autour de la Sainte-Victoire',
    organizer: 'sarah.gs',
    participants: ['sarah.gs', 'lucas_mt07', 'cam_street765'],
    level: 'tranquille',
    visibility: 'public',
    day: 1,
    time: [9, 30],
    meeting: P('La Rotonde, Aix-en-Provence', 43.5263, 5.4454),
    start: P('La Rotonde, Aix-en-Provence', 43.5263, 5.4454),
    waypoints: [P('Barrage de Bimont', 43.5471, 5.5395)],
    end: P('Puyloubier', 43.525, 5.676),
    distanceKm: 38,
    durationMin: 53,
    max: 10,
    description: 'Tour de la montagne Sainte-Victoire à allure cool. Café au barrage de Bimont.',
  },
  {
    id: 'demo-ride-3',
    title: "Col de l'Espigoulier & Sainte-Baume",
    organizer: 'karim_z900',
    participants: ['karim_z900', 'tom_r1', 'yanis_duke', 'hugo_gsxs'],
    level: 'dynamique',
    visibility: 'public',
    day: 2,
    time: [8, 0],
    meeting: P('Parking du Parc d’activités, Gémenos', 43.296, 5.628),
    start: P('Gémenos', 43.296, 5.628),
    waypoints: [P("Col de l'Espigoulier", 43.3186, 5.6386)],
    end: P("Plan-d'Aups-Sainte-Baume", 43.3337, 5.7231),
    distanceKm: 23,
    durationMin: 36,
    max: 6,
    description: 'Virages à gogo dans l’Espigoulier. Rythme soutenu mais on s’attend en haut.',
  },
  {
    id: 'demo-ride-4',
    title: 'Côte Bleue au coucher du soleil',
    organizer: 'chloe_zx6r',
    participants: ['chloe_zx6r', 'mehdi_africa'],
    level: 'tranquille',
    visibility: 'public',
    day: 3,
    time: [18, 30],
    meeting: P('Port de Carry-le-Rouet', 43.3305, 5.1527),
    start: P('Port de Carry-le-Rouet', 43.3305, 5.1527),
    waypoints: [P('Sausset-les-Pins', 43.3316, 5.108)],
    end: P('Miroir aux Oiseaux, Martigues', 43.4053, 5.0513),
    distanceKm: 18,
    durationMin: 25,
    max: 12,
    description: 'Petite boucle au coucher du soleil, apéro à Martigues pour ceux qui veulent.',
  },
  {
    id: 'demo-ride-5',
    title: 'Direction le circuit Paul Ricard',
    organizer: 'yanis_duke',
    participants: ['yanis_duke', 'nico_s1000rr'],
    level: 'sportif',
    visibility: 'friends',
    day: 6,
    time: [7, 30],
    meeting: P('Station-service, Aubagne', 43.2927, 5.5708),
    start: P('Aubagne', 43.2927, 5.5708),
    waypoints: [],
    end: P('Circuit Paul Ricard, Le Castellet', 43.2506, 5.7916),
    distanceKm: 24,
    durationMin: 30,
    max: 8,
    description: 'On monte ensemble pour la journée de roulage. Réservé aux amis.',
  },
  {
    id: 'demo-ride-6',
    title: 'Trail dans le Luberon',
    organizer: 'lea_tenere',
    participants: ['lea_tenere', 'mehdi_africa'],
    level: 'dynamique',
    visibility: 'private',
    day: 9,
    time: [8, 30],
    meeting: P('Place Mirabeau, Pertuis', 43.694, 5.5019),
    start: P('Pertuis', 43.694, 5.5019),
    waypoints: [P('Lourmarin', 43.764, 5.362)],
    end: P('Apt', 43.8764, 5.3963),
    distanceKm: 38,
    durationMin: 44,
    max: 5,
    description: 'Petites routes et quelques chemins faciles. Trails uniquement, sur invitation.',
  },
  {
    id: 'demo-ride-7',
    title: 'Sortie piste réservée aux potes de Tom',
    organizer: 'tom_r1',
    participants: ['tom_r1', 'nico_s1000rr'],
    level: 'sportif',
    visibility: 'friends', // Tom n'est pas mon ami : je ne dois pas la voir
    day: 4,
    time: [7, 0],
    meeting: P('Vitrolles', 43.46, 5.248),
    start: P('Vitrolles', 43.46, 5.248),
    waypoints: [],
    end: P('Circuit du Grand Sambuc', 43.567, 5.628),
    distanceKm: 45,
    durationMin: 45,
    max: 6,
    description: 'Invisible pour moi en démo : balade « amis » d’un motard qui n’est pas mon ami.',
  },
];

export const DEMO_INITIAL_JOINED = [DEMO_LIVE_RIDE_ID];
export const DEMO_INITIAL_INVITED = ['demo-ride-6'];

function person(username: string): RidePerson {
  const r = findDemoRiderByUsername(username);
  return { id: r?.id ?? username, username, avatarUrl: r?.avatar_path ?? '' };
}

function meetingDate(seed: DemoRideSeed) {
  const d = new Date();
  if (seed.live) return new Date(Date.now() + seed.time[0] * 3600 * 1000);
  d.setDate(d.getDate() + seed.day);
  d.setHours(seed.time[0], seed.time[1], 0, 0);
  return d;
}

/** Même logique que can_see_ride() côté serveur. */
function canSee(seed: DemoRideSeed, s: DemoRideState) {
  if (s.joinedRideIds.includes(seed.id) || s.invitedRideIds.includes(seed.id)) return true;
  if (seed.visibility === 'public') return true;
  if (seed.visibility === 'friends') return s.friendIds.includes(person(seed.organizer).id);
  return false;
}

function toDetails(seed: DemoRideSeed, s: DemoRideState, me: RidePerson): RideDetails {
  const joined = s.joinedRideIds.includes(seed.id);
  const status = seed.live ? (s.rideActive ? 'live' : 'ended') : 'upcoming';
  const participants = [
    ...seed.participants.map((u) => ({ ...person(u), status: 'joined' as const })),
    ...(joined ? [{ ...me, status: 'joined' as const }] : []),
  ];
  return {
    id: seed.id,
    title: seed.title,
    level: seed.level,
    visibility: seed.visibility,
    meetingAt: meetingDate(seed).toISOString(),
    meeting: seed.meeting,
    distanceM: seed.distanceKm * 1000,
    durationS: seed.durationMin * 60,
    participantsCount: participants.length,
    maxParticipants: seed.max,
    organizer: person(seed.organizer),
    status,
    joined,
    invited: !joined && s.invitedRideIds.includes(seed.id),
    isDemo: true,
    description: seed.description,
    start: seed.start,
    end: seed.end,
    waypoints: seed.waypoints,
    route: null,
    participants,
    startedAt: status === 'live' ? meetingDate(seed).toISOString() : null,
  };
}

/** me : mon profil, affiché parmi les participants quand je m'inscris */
export function demoRides(s: DemoRideState, me: RidePerson): RideSummary[] {
  return SEEDS.filter((seed) => canSee(seed, s))
    .map((seed) => toDetails(seed, s, me))
    .filter((r) => r.status !== 'ended');
}

export function demoRide(id: string, s: DemoRideState, me: RidePerson): RideDetails | null {
  const seed = SEEDS.find((x) => x.id === id);
  return seed && canSee(seed, s) ? toDetails(seed, s, me) : null;
}
