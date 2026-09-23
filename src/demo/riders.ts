import type { Motorcycle, Profile, RidingStyle } from '@/lib/profile';

// 15 faux motards de la région marseillaise. Rien n'est stocké dans Supabase.
// Les chemins de photo sont des URL complètes (avatars générés par DiceBear).

export type DemoBehavior =
  | { kind: 'solo'; baseKmh: number }
  | { kind: 'group'; group: 'A' | 'B' }
  | { kind: 'stopped' };

export type DemoRider = Profile & { behavior: DemoBehavior };

type Seed = {
  first: string;
  last: string;
  username: string;
  city: string;
  bio: string;
  styles: RidingStyle[];
  license: number;
  interests: string[];
  moto: [brand: string, model: string, year: number, cc: number, color: string];
  behavior: DemoBehavior;
};

const SEEDS: Seed[] = [
  // Solos qui roulent (dont 2 en excès de vitesse)
  { first: 'Lucas', last: 'Martin', username: 'lucas_mt07', city: 'Aubagne', bio: 'Balades du dimanche dans le Garlaban, toujours partant pour un café.', styles: ['balade'], license: 2019, interests: ['Photo', 'Rassemblements'], moto: ['Yamaha', 'MT-07', 2021, 689, 'Bleu'], behavior: { kind: 'solo', baseKmh: 55 } },
  { first: 'Sarah', last: 'Benali', username: 'sarah.gs', city: 'Aix-en-Provence', bio: 'Road trips au long cours, prochain objectif : le cap Nord.', styles: ['road_trip', 'balade'], license: 2012, interests: ['Voyage', 'Photo'], moto: ['BMW', 'R 1250 GS', 2021, 1254, 'Blanc'], behavior: { kind: 'solo', baseKmh: 78 } },
  { first: 'Karim', last: 'Haddad', username: 'karim_z900', city: 'Marignane', bio: 'Les virages de la Sainte-Baume, rien de mieux.', styles: ['sportive'], license: 2016, interests: ['Circuit', 'Mécanique'], moto: ['Kawasaki', 'Z900', 2020, 948, 'Vert'], behavior: { kind: 'solo', baseKmh: 88 } },
  { first: 'Thomas', last: 'Roux', username: 'tom_r1', city: 'Vitrolles', bio: 'Pistard le week-end au Castellet.', styles: ['sportive', 'piste'], license: 2010, interests: ['Circuit'], moto: ['Yamaha', 'YZF-R1', 2019, 998, 'Bleu'], behavior: { kind: 'solo', baseKmh: 128 } },
  { first: 'Nicolas', last: 'Ferrand', username: 'nico_s1000rr', city: 'Les Pennes-Mirabeau', bio: 'La route, la vitesse, la liberté.', styles: ['sportive'], license: 2014, interests: ['Circuit', 'Customisation'], moto: ['BMW', 'S 1000 RR', 2023, 999, 'Tricolore'], behavior: { kind: 'solo', baseKmh: 145 } },

  // Groupe A : 4 motards qui roulent ensemble, tranquille
  { first: 'Julie', last: 'Moreau', username: 'julie_cb650r', city: 'Cassis', bio: 'Route des Crêtes au coucher du soleil, avec la bande.', styles: ['balade'], license: 2020, interests: ['Photo', 'Rassemblements'], moto: ['Honda', 'CB650R', 2022, 649, 'Rouge'], behavior: { kind: 'group', group: 'A' } },
  { first: 'Antoine', last: 'Garcia', username: 'antoine_monster', city: 'La Ciotat', bio: 'Ducatiste convaincu, mécano amateur.', styles: ['balade', 'sportive'], license: 2011, interests: ['Mécanique', 'Customisation'], moto: ['Ducati', 'Monster', 2022, 937, 'Rouge'], behavior: { kind: 'group', group: 'A' } },
  { first: 'Émilie', last: 'Laurent', username: 'emi_interceptor', city: 'Gémenos', bio: 'Néo-rétro et petites routes.', styles: ['balade'], license: 2018, interests: ['Vintage', 'Photo'], moto: ['Royal Enfield', 'Interceptor 650', 2021, 648, 'Orange'], behavior: { kind: 'group', group: 'A' } },
  { first: 'Maxime', last: 'Blanc', username: 'max_sportster', city: 'Roquevaire', bio: 'Custom, cuir et gros bicylindre.', styles: ['balade', 'road_trip'], license: 2008, interests: ['Customisation', 'Rassemblements'], moto: ['Harley-Davidson', 'Sportster S', 2022, 1252, 'Noir'], behavior: { kind: 'group', group: 'A' } },

  // Groupe B : 3 motards qui roulent ensemble, un peu vite
  { first: 'Yanis', last: 'Mercier', username: 'yanis_duke', city: 'Allauch', bio: 'Roadster énervé, toujours devant.', styles: ['sportive'], license: 2017, interests: ['Circuit'], moto: ['KTM', '890 Duke R', 2021, 889, 'Orange'], behavior: { kind: 'group', group: 'B' } },
  { first: 'Camille', last: 'Durand', username: 'cam_street765', city: 'Plan-de-Cuques', bio: 'Anglaise à trois cylindres, bruit parfait.', styles: ['sportive', 'balade'], license: 2015, interests: ['Mécanique', 'Photo'], moto: ['Triumph', 'Street Triple 765 RS', 2023, 765, 'Gris'], behavior: { kind: 'group', group: 'B' } },
  { first: 'Hugo', last: 'Petit', username: 'hugo_gsxs', city: 'Septèmes-les-Vallons', bio: 'Couche-tôt, lève-tôt, départ 7h.', styles: ['sportive', 'road_trip'], license: 2013, interests: ['Voyage'], moto: ['Suzuki', 'GSX-S1000', 2022, 999, 'Bleu'], behavior: { kind: 'group', group: 'B' } },

  // Arrêtés (café, plein, pause photo)
  { first: 'Léa', last: 'Fontaine', username: 'lea_tenere', city: 'Gardanne', bio: 'Trail et chemins, la boue ne me fait pas peur.', styles: ['off_road', 'road_trip'], license: 2016, interests: ['Enduro', 'Voyage'], moto: ['Yamaha', 'Ténéré 700', 2023, 689, 'Bleu'], behavior: { kind: 'stopped' } },
  { first: 'Mehdi', last: 'Saïdi', username: 'mehdi_africa', city: 'Martigues', bio: 'Tour de la Méditerranée en préparation.', styles: ['road_trip'], license: 2009, interests: ['Voyage', 'Photo'], moto: ['Honda', 'Africa Twin', 2020, 1084, 'Tricolore'], behavior: { kind: 'stopped' } },
  { first: 'Chloé', last: 'Perrin', username: 'chloe_zx6r', city: 'Carry-le-Rouet', bio: 'Journées piste et côte Bleue.', styles: ['piste', 'sportive'], license: 2019, interests: ['Circuit', 'Rassemblements'], moto: ['Kawasaki', 'Ninja ZX-6R', 2024, 636, 'Vert'], behavior: { kind: 'stopped' } },
];

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
    created_at: '2026-01-01T00:00:00Z',
  };
  return {
    id,
    first_name: s.first,
    last_name: s.last,
    username: s.username,
    avatar_path: avatarUrl(s.username),
    bio: s.bio,
    riding_styles: s.styles,
    license_year: s.license,
    city: s.city,
    interests: s.interests,
    motorcycles: [moto],
    behavior: s.behavior,
  };
});

export function findDemoRider(id: string) {
  return DEMO_RIDERS.find((r) => r.id === id);
}
