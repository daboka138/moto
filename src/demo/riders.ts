import { inferCategory, type Availability, type Pace } from '@/lib/moto';
import type { Motorcycle, Profile, RidingStyle } from '@/lib/profile';

// 18 faux motards de la région marseillaise (dont une 50 cm³ et deux 125). Rien n'est stocké dans Supabase.
// Les chemins de photo sont des URL complètes (avatars générés par DiceBear).

export type DemoBehavior =
  | { kind: 'solo'; baseKmh: number }
  | { kind: 'group'; group: 'A' | 'B' }
  | { kind: 'stopped' };

export type DemoRider = Profile & { behavior: DemoBehavior };

type Seed = {
  username: string;
  city: string;
  bio: string;
  styles: RidingStyle[];
  license: number;
  interests: string[];
  moto: [brand: string, model: string, year: number, cc: number, color: string];
  behavior: DemoBehavior;
  pace?: Pace;
  availability?: Availability[];
};

const SEEDS: Seed[] = [
  // Solos qui roulent (dont 2 en excès de vitesse)
  { username: 'lucas_mt07', city: 'Aubagne', bio: 'Balades du dimanche dans le Garlaban, toujours partant pour un café.', styles: ['balade'], license: 2019, interests: ['Photo', 'Rassemblements'], moto: ['Yamaha', 'MT-07', 2021, 689, 'Bleu'], behavior: { kind: 'solo', baseKmh: 55 } },
  { username: 'sarah.gs', city: 'Aix-en-Provence', bio: 'Road trips au long cours, prochain objectif : le cap Nord.', styles: ['road_trip', 'balade'], license: 2012, interests: ['Voyage', 'Photo'], moto: ['BMW', 'R 1250 GS', 2021, 1254, 'Blanc'], behavior: { kind: 'solo', baseKmh: 78 } },
  { username: 'karim_z900', city: 'Marignane', bio: 'Les virages de la Sainte-Baume, rien de mieux.', styles: ['sportive'], license: 2016, interests: ['Circuit', 'Mécanique'], moto: ['Kawasaki', 'Z900', 2020, 948, 'Vert'], behavior: { kind: 'solo', baseKmh: 88 } },
  { username: 'tom_r1', city: 'Vitrolles', bio: 'Pistard le week-end au Castellet.', styles: ['sportive', 'piste'], license: 2010, interests: ['Circuit'], moto: ['Yamaha', 'YZF-R1', 2019, 998, 'Bleu'], behavior: { kind: 'solo', baseKmh: 128 } },
  { username: 'nico_s1000rr', city: 'Les Pennes-Mirabeau', bio: 'La route, la vitesse, la liberté.', styles: ['sportive'], license: 2014, interests: ['Circuit', 'Customisation'], moto: ['BMW', 'S 1000 RR', 2023, 999, 'Tricolore'], behavior: { kind: 'solo', baseKmh: 145 } },

  // Groupe A : 4 motards qui roulent ensemble, tranquille
  { username: 'julie_cb650r', city: 'Cassis', bio: 'Route des Crêtes au coucher du soleil, avec la bande.', styles: ['balade'], license: 2020, interests: ['Photo', 'Rassemblements'], moto: ['Honda', 'CB650R', 2022, 649, 'Rouge'], behavior: { kind: 'group', group: 'A' } },
  { username: 'antoine_monster', city: 'La Ciotat', bio: 'Ducatiste convaincu, mécano amateur.', styles: ['balade', 'sportive'], license: 2011, interests: ['Mécanique', 'Customisation'], moto: ['Ducati', 'Monster', 2022, 937, 'Rouge'], behavior: { kind: 'group', group: 'A' } },
  { username: 'emi_interceptor', city: 'Gémenos', bio: 'Néo-rétro et petites routes.', styles: ['balade'], license: 2018, interests: ['Vintage', 'Photo'], moto: ['Royal Enfield', 'Interceptor 650', 2021, 648, 'Orange'], behavior: { kind: 'group', group: 'A' } },
  { username: 'max_sportster', city: 'Roquevaire', bio: 'Custom, cuir et gros bicylindre.', styles: ['balade', 'road_trip'], license: 2008, interests: ['Customisation', 'Rassemblements'], moto: ['Harley-Davidson', 'Sportster S', 2022, 1252, 'Noir'], behavior: { kind: 'group', group: 'A' } },

  // Groupe B : 3 motards qui roulent ensemble, un peu vite
  { username: 'yanis_duke', city: 'Allauch', bio: 'Roadster énervé, toujours devant.', styles: ['sportive'], license: 2017, interests: ['Circuit'], moto: ['KTM', '890 Duke R', 2021, 889, 'Orange'], behavior: { kind: 'group', group: 'B' } },
  { username: 'cam_street765', city: 'Plan-de-Cuques', bio: 'Anglaise à trois cylindres, bruit parfait.', styles: ['sportive', 'balade'], license: 2015, interests: ['Mécanique', 'Photo'], moto: ['Triumph', 'Street Triple 765 RS', 2023, 765, 'Gris'], behavior: { kind: 'group', group: 'B' } },
  { username: 'hugo_gsxs', city: 'Septèmes-les-Vallons', bio: 'Couche-tôt, lève-tôt, départ 7h.', styles: ['sportive', 'road_trip'], license: 2013, interests: ['Voyage'], moto: ['Suzuki', 'GSX-S1000', 2022, 999, 'Bleu'], behavior: { kind: 'group', group: 'B' } },

  // Petites cylindrées
  { username: 'ines_kisbee', city: 'Marseille 5e', bio: 'Scooter 50 pour aller au boulot, et balades tranquilles le soir.', styles: ['balade'], license: 2025, interests: ['Photo'], moto: ['Peugeot', 'Kisbee', 2022, 50, 'Blanc'], behavior: { kind: 'solo', baseKmh: 40 }, pace: 'cool', availability: ['semaine'] },
  { username: 'noah_mt125', city: 'Aubagne', bio: 'Jeune permis, je cherche des potes pour rouler en 125.', styles: ['balade', 'sportive'], license: 2024, interests: ['Mécanique'], moto: ['Yamaha', 'MT-125', 2023, 125, 'Bleu'], behavior: { kind: 'solo', baseKmh: 72 }, pace: 'modere', availability: ['weekend'] },
  { username: 'zoe_cb125r', city: 'La Penne-sur-Huveaune', bio: 'CB125R et petites routes, toujours partante le dimanche.', styles: ['balade'], license: 2023, interests: ['Photo', 'Rassemblements'], moto: ['Honda', 'CB125R', 2022, 125, 'Rouge'], behavior: { kind: 'solo', baseKmh: 62 }, pace: 'cool', availability: ['weekend'] },

  // Arrêtés (café, plein, pause photo)
  { username: 'lea_tenere', city: 'Gardanne', bio: 'Trail et chemins, la boue ne me fait pas peur.', styles: ['off_road', 'road_trip'], license: 2016, interests: ['Enduro', 'Voyage'], moto: ['Yamaha', 'Ténéré 700', 2023, 689, 'Bleu'], behavior: { kind: 'stopped' } },
  { username: 'mehdi_africa', city: 'Martigues', bio: 'Tour de la Méditerranée en préparation.', styles: ['road_trip'], license: 2009, interests: ['Voyage', 'Photo'], moto: ['Honda', 'Africa Twin', 2020, 1084, 'Tricolore'], behavior: { kind: 'stopped' } },
  { username: 'chloe_zx6r', city: 'Carry-le-Rouet', bio: 'Journées piste et côte Bleue.', styles: ['piste', 'sportive'], license: 2019, interests: ['Circuit', 'Rassemblements'], moto: ['Kawasaki', 'Ninja ZX-6R', 2024, 636, 'Vert'], behavior: { kind: 'stopped' } },
];

const PACE_AVAILABILITY: Record<string, [Pace, Availability[]]> = {
  lucas_mt07: ['cool', ['weekend']],
  'sarah.gs': ['modere', ['semaine', 'weekend']],
  karim_z900: ['soutenu', ['weekend']],
  tom_r1: ['soutenu', ['weekend']],
  nico_s1000rr: ['soutenu', ['semaine', 'weekend']],
  julie_cb650r: ['cool', ['weekend']],
  antoine_monster: ['modere', ['weekend']],
  emi_interceptor: ['cool', ['semaine']],
  max_sportster: ['cool', ['weekend']],
  yanis_duke: ['soutenu', ['semaine', 'weekend']],
  cam_street765: ['modere', ['weekend']],
  hugo_gsxs: ['modere', ['semaine']],
  lea_tenere: ['modere', ['semaine', 'weekend']],
  mehdi_africa: ['cool', ['semaine']],
  chloe_zx6r: ['soutenu', ['weekend']],
};

export function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(seed)}&size=128&backgroundColor=ffd5dc,c0aede,d1d4f9,b6e3f4,ffdfbf`;
}

export const DEMO_RIDERS: DemoRider[] = SEEDS.map((s, i) => {
  const id = `demo-${i + 1}`;
  const [brand, model, year, cc, color] = s.moto;
  const moto: Motorcycle = {
    id: `${id}-moto`,
    owner_id: id,
    brand,
    model,
    year,
    displacement_cc: cc,
    color,
    photo_path: null,
    category: inferCategory(cc, model),
    is_main: true,
    created_at: '2026-01-01T00:00:00Z',
  };
  const [pace, availability] = s.pace ? [s.pace, s.availability ?? []] : (PACE_AVAILABILITY[s.username] ?? ['cool', []]);
  return {
    id,
    cover_path: null,
    username: s.username,
    avatar_path: avatarUrl(s.username),
    bio: s.bio,
    riding_styles: s.styles,
    license_year: s.license,
    city: s.city,
    interests: s.interests,
    pace,
    availability,
    motorcycles: [moto],
    behavior: s.behavior,
  };
});

export function findDemoRider(id: string) {
  return DEMO_RIDERS.find((r) => r.id === id);
}

export function findDemoRiderByUsername(username: string) {
  return DEMO_RIDERS.find((r) => r.username === username);
}
