import { DEMO_IMAGES } from '@/demo/photos';
import { findDemoRiderByUsername } from '@/demo/riders';
import type { RiderStats } from '@/lib/badges';
import type { MotoEvent } from '@/lib/events';
import type { CommunityPlace, PlaceKind, PlaceReview } from '@/lib/places';
import type { Comment } from '@/lib/social';

// Démo du lot « communauté » : lieux motards avec avis, événements, statistiques de badges des
// faux motards, commentaires des balades de démo. Rien dans Supabase (ids « demo-… »).

const BASE = Date.now();
const H = 3600 * 1000;

function rider(username: string) {
  const r = findDemoRiderByUsername(username);
  return { id: r?.id ?? username, username, avatarUrl: r?.avatar_path ?? '' };
}

// ---------- Lieux ----------

type PlaceSeed = {
  kind: PlaceKind;
  name: string;
  at: [number, number];
  by: string;
  description: string;
  photo?: string;
  reviews: [author: string, rating: number, body: string, hoursAgo: number][];
};

const PLACES: PlaceSeed[] = [
  { kind: 'biker_cafe', name: 'Le Relais des Crêtes', at: [43.2036, 5.5627], by: 'julie_cb650r', description: 'Terrasse face à la mer, parking motos devant. Café + croissant avant la route des Crêtes.', photo: DEMO_IMAGES.cassis,
    reviews: [['antoine_monster', 5, 'Vue incroyable, accueil top avec les motards.', 20], ['emi_interceptor', 4, 'Un peu de monde le dimanche midi.', 70]] },
  { kind: 'biker_cafe', name: 'Bar du Col de l’Espigoulier', at: [43.3158, 5.6393], by: 'karim_z900', description: 'Le rendez-vous des sportifs le dimanche matin.',
    reviews: [['yanis_duke', 5, 'Ambiance au top, toujours des belles motos.', 10], ['tom_r1', 4, 'Café correct, surtout pour le spot.', 48]] },
  { kind: 'biker_cafe', name: 'La Cantine des Bikers', at: [43.2925, 5.5701], by: 'max_sportster', description: 'Burgers maison, concerts rock le vendredi.',
    reviews: [['max_sportster', 5, 'Ma cantine !', 100]] },
  { kind: 'garage', name: 'Moto Service Aubagne', at: [43.2927, 5.5672], by: 'lucas_mt07', description: 'Entretien toutes marques, rapide et pas cher. Pneus en stock.',
    reviews: [['lucas_mt07', 5, 'Vidange faite en 1 h sans rendez-vous.', 30], ['noah_mt125', 4, 'Bons conseils pour les 125.', 150]] },
  { kind: 'garage', name: 'Garage du Vieux-Port Motos', at: [43.2946, 5.3747], by: 'cam_street765', description: 'Spécialiste Triumph et anglaises.',
    reviews: [['cam_street765', 5, 'Ils connaissent ma Street par cœur.', 200]] },
  { kind: 'viewpoint', name: 'Belvédère du Cap Canaille', at: [43.2047, 5.5496], by: 'julie_cb650r', description: 'La plus haute falaise maritime de France, vue sur Cassis.', photo: DEMO_IMAGES.enVau,
    reviews: [['sarah.gs', 5, 'Au coucher du soleil, inoubliable.', 15], ['chloe_zx6r', 5, 'Photo obligatoire.', 90]] },
  { kind: 'viewpoint', name: 'Col de la Gineste', at: [43.2356, 5.4872], by: 'emi_interceptor', description: 'Vue sur Marseille et les calanques, petit parking.',
    reviews: [['zoe_cb125r', 4, 'Super spot pour une pause.', 40]] },
  { kind: 'road', name: 'Route des Crêtes (D141)', at: [43.1957, 5.5795], by: 'sarah.gs', description: 'Cassis → La Ciotat par les falaises. Fermée par grand vent : vérifie avant.', photo: DEMO_IMAGES.sportTouring,
    reviews: [['karim_z900', 5, 'Virages magnifiques, attention aux cyclistes.', 25], ['julie_cb650r', 5, 'La plus belle route du coin.', 60]] },
  { kind: 'road', name: 'Massif de la Sainte-Baume (D80)', at: [43.3362, 5.7552], by: 'lea_tenere', description: 'Forêt, enchaînements fluides, peu de trafic en semaine.',
    reviews: [['hugo_gsxs', 4, 'Revêtement un peu bosselé côté Nans.', 80]] },
];

export function demoPlaces(): CommunityPlace[] {
  return PLACES.map((p, i) => {
    const creator = rider(p.by);
    const avg = p.reviews.reduce((s, r) => s + r[1], 0) / p.reviews.length;
    return {
      id: `demo-place-${i}`,
      kind: p.kind,
      name: p.name,
      description: p.description,
      latitude: p.at[0],
      longitude: p.at[1],
      photoUrl: p.photo ?? null,
      photoPath: null,
      createdBy: creator.id,
      creatorName: creator.username,
      rating: avg,
      reviewsCount: p.reviews.length,
      isDemo: true,
    };
  });
}

export function demoPlaceReviews(placeId: string): PlaceReview[] {
  const seed = PLACES[Number(placeId.replace('demo-place-', ''))];
  if (!seed) return [];
  return seed.reviews.map(([author, rating, body, hoursAgo], i) => {
    const r = rider(author);
    return {
      id: `${placeId}-review-${i}`,
      authorId: r.id,
      username: r.username,
      avatarUrl: r.avatarUrl,
      rating,
      body,
      photoUrl: null,
      photoPath: null,
      createdAt: new Date(BASE - hoursAgo * H).toISOString(),
    };
  });
}

// ---------- Événements ----------

type EventSeed = {
  kind: MotoEvent['kind'];
  title: string;
  inDays: number;
  hour: number;
  durationH: number | null;
  place: [string, number, number];
  by: string;
  description: string;
  photo?: string;
  going: string[];
  interested: string[];
  max?: number;
};

const EVENTS: EventSeed[] = [
  { kind: 'rassemblement', title: 'Rassemblement du dimanche – Vieux-Port', inDays: 2, hour: 9, durationH: 3, place: ['Quai du Port, Marseille', 43.2961, 5.3699], by: 'max_sportster', description: 'Café, croissants et tour de la Corniche en groupe à 11 h. Toutes cylindrées bienvenues.', photo: DEMO_IMAGES.triumph, going: ['max_sportster', 'antoine_monster', 'emi_interceptor', 'julie_cb650r'], interested: ['noah_mt125', 'zoe_cb125r'] },
  { kind: 'circuit', title: 'Journée piste – Circuit du Castellet', inDays: 9, hour: 8, durationH: 9, place: ['Circuit Paul Ricard, Le Castellet', 43.2506, 5.7917], by: 'tom_r1', description: '4 sessions de 20 min par niveau. Combinaison cuir obligatoire.', photo: DEMO_IMAGES.z900, going: ['tom_r1', 'nico_s1000rr', 'chloe_zx6r'], interested: ['karim_z900'], max: 40 },
  { kind: 'sortie', title: 'Balade géante des 125', inDays: 5, hour: 10, durationH: 5, place: ['Parking du stade, Aubagne', 43.2891, 5.5719], by: 'noah_mt125', description: 'Sortie spéciale petites cylindrées et jeunes permis, rythme cool, pique-nique au Garlaban.', going: ['noah_mt125', 'zoe_cb125r', 'ines_kisbee'], interested: ['lucas_mt07'] },
  { kind: 'salon', title: 'Salon de la moto ancienne', inDays: 16, hour: 10, durationH: 32, place: ['Parc Chanot, Marseille', 43.2694, 5.3958], by: 'emi_interceptor', description: 'Expo de motos de collection, bourse aux pièces, concours d’élégance.', photo: DEMO_IMAGES.concours, going: ['emi_interceptor'], interested: ['max_sportster', 'cam_street765', 'mehdi_africa'] },
  { kind: 'concert', title: 'Soirée rock & customs', inDays: 12, hour: 19, durationH: 5, place: ['La Cantine des Bikers, Aubagne', 43.2925, 5.5701], by: 'max_sportster', description: 'Concert, expo de customs, food trucks.', going: ['max_sportster', 'antoine_monster'], interested: ['yanis_duke', 'hugo_gsxs'] },
];

function eventDate(days: number, hour: number) {
  const d = new Date(BASE + days * 24 * H);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** myStatus : mes inscriptions de démo (en mémoire) */
export function demoEvents(myStatus: Record<string, 'going' | 'interested'>, me: { id: string; username: string; avatarUrl: string }): MotoEvent[] {
  return EVENTS.map((e, i) => {
    const id = `demo-event-${i}`;
    const start = eventDate(e.inDays, e.hour);
    const attendees = [
      ...e.going.map((u) => ({ ...rider(u), status: 'going' as const })),
      ...e.interested.map((u) => ({ ...rider(u), status: 'interested' as const })),
      ...(myStatus[id] ? [{ ...me, status: myStatus[id] }] : []),
    ];
    const organizer = rider(e.by);
    return {
      id,
      kind: e.kind,
      title: e.title,
      description: e.description,
      startsAt: start.toISOString(),
      endsAt: e.durationH ? new Date(start.getTime() + e.durationH * H).toISOString() : null,
      place: { label: e.place[0], latitude: e.place[1], longitude: e.place[2] },
      photoUrl: e.photo ?? null,
      photoPath: null,
      maxAttendees: e.max ?? null,
      createdBy: organizer.id,
      organizerName: organizer.username,
      attendees,
      going: attendees.filter((a) => a.status === 'going').length,
      interested: attendees.filter((a) => a.status === 'interested').length,
      myStatus: myStatus[id] ?? null,
      isDemo: true,
    };
  });
}

// ---------- Badges des faux motards ----------

/** Statistiques inventées mais stables pour chaque faux motard */
export function demoRiderStats(username: string): RiderStats {
  const seed = [...username].reduce((s, c) => s + c.charCodeAt(0), 0);
  const d = new Date();
  return {
    totalKm: 300 + ((seed * 137) % 24000),
    trips: 10 + (seed % 140),
    ridesDone: seed % 34,
    passesCount: seed % 19,
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    monthKm: (seed * 13) % 420,
    monthRides: seed % 4,
    monthPasses: seed % 2,
    weekStreak: seed % 9,
    bestWeekStreak: 3 + (seed % 20),
    activeWeeks: 10 + (seed % 60),
    lastWeek: null,
  };
}

// ---------- Commentaires des balades de démo ----------

const RIDE_COMMENTS: [author: string, body: string, hoursAgo: number][] = [
  ['julie_cb650r', 'Trop hâte ! Je ramène les croissants 🥐', 20],
  ['antoine_monster', 'On fait une pause photo au belvédère ?', 12],
  ['emi_interceptor', 'Je serai peut-être 5 min en retard, partez pas sans moi 😅', 3],
];

export function demoRideComments(rideId: string): Comment[] {
  const n = (Number(rideId.replace(/\D/g, '')) % 3) + 1;
  return RIDE_COMMENTS.slice(0, n).map(([author, body, hoursAgo], i) => {
    const r = rider(author);
    return { id: `${rideId}-comment-${i}`, authorId: r.id, username: r.username, avatarUrl: r.avatarUrl, body, createdAt: new Date(BASE - hoursAgo * H).toISOString() };
  });
}
