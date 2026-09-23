import { findDemoRiderByUsername } from '@/demo/riders';
import type { WallPhoto } from '@/lib/wall';

// Photos de mur des faux motards : images Wikimedia Commons du domaine public ou CC0
// (libres de droits, sans attribution obligatoire).

const T = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/';
const U = 'https://upload.wikimedia.org/wikipedia/commons/';

const IMG = {
  monster1000: `${T}c/cc/Ducati_Monster_1000S.jpg/960px-Ducati_Monster_1000S.jpg`,
  monster695: `${U}0/06/Ducati_Monster_695.jpg`,
  monster900: `${T}7/7f/Ducati_Monster_900_%2798_in_Ontario%2C_Canada_-_front_quarter.jpg/960px-Ducati_Monster_900_%2798_in_Ontario%2C_Canada_-_front_quarter.jpg`,
  mt03: `${T}0/04/MT-03.jpg/960px-MT-03.jpg`,
  mt07: `${T}f/fb/YAMAHA_MT-07.JPG/960px-YAMAHA_MT-07.JPG`,
  mt07b: `${T}6/62/YAMAHA_MT-07_%281%29.JPG/960px-YAMAHA_MT-07_%281%29.JPG`,
  mt09: `${T}8/87/Yamaha_MT-09_%28CV15_PYX%29_and_MT-07_%28AY66_VYS%29_-_25_April_2026.jpg/960px-Yamaha_MT-09_%28CV15_PYX%29_and_MT-07_%28AY66_VYS%29_-_25_April_2026.jpg`,
  gs: `${T}b/b3/BMW-R1200-GS.JPG/960px-BMW-R1200-GS.JPG`,
  z900rs: `${T}9/9e/Moriwaki_Z900RS_2021_Modified_002.jpg/960px-Moriwaki_Z900RS_2021_Modified_002.jpg`,
  z900: `${T}5/54/2026_Kawasaki_Z900.jpg/960px-2026_Kawasaki_Z900.jpg`,
  triumph: `${T}a/a0/Moscow%2C_Triumph_motorcycle_05%28DXO%29.jpg/960px-Moscow%2C_Triumph_motorcycle_05%28DXO%29.jpg`,
  tripleGreen: `${T}e/e4/Moscow%2C_Triumph_Street_Triple_675_lime-green%2C_Sept_2026_02.jpg/960px-Moscow%2C_Triumph_Street_Triple_675_lime-green%2C_Sept_2026_02.jpg`,
  tripleBlack: `${T}3/3d/Moscow%2C_Triumph_Street_Triple_black-silver-red%2C_Sept_2026_02.jpg/960px-Moscow%2C_Triumph_Street_Triple_black-silver-red%2C_Sept_2026_02.jpg`,
  gtr1000: `${U}0/00/Kawasaki_gtr1000.jpg`,
  concours: `${U}e/e8/2004Concours.jpg`,
  sportTouring: `${T}c/ca/Sport-Touring-Heaven_w.jpg/960px-Sport-Touring-Heaven_w.jpg`,
  morocco: `${T}e/ed/Motorcycle_Touring_Morocco.jpg/960px-Motorcycle_Touring_Morocco.jpg`,
  ubacs: `${T}1/17/Montagne_des_Ubacs.jpg/960px-Montagne_des_Ubacs.jpg`,
  piana: `${U}a/a5/Calanques_de_Piana.jpg`,
  cassis: `${T}a/a4/Calanques_Marseille_Cassis_100_0322.JPG/960px-Calanques_Marseille_Cassis_100_0322.JPG`,
  enVau: `${T}e/e8/Calanque_d%27en_Vau_bateau.jpg/960px-Calanque_d%27en_Vau_bateau.jpg`,
};

type Seed = { url: string; caption: string; hoursAgo: number };

const PHOTOS: Record<string, Seed[]> = {
  julie_cb650r: [
    { url: IMG.cassis, caption: 'Vue sur les calanques juste avant la route des Crêtes', hoursAgo: 2 },
    { url: IMG.enVau, caption: 'En-Vau, ça valait la marche depuis le parking 😅', hoursAgo: 70 },
  ],
  antoine_monster: [
    { url: IMG.monster900, caption: 'Le 900 de 98, une légende', hoursAgo: 5 },
    { url: IMG.monster1000, caption: 'Mon ancienne 1000S, je la regrette encore', hoursAgo: 49 },
    { url: IMG.monster695, caption: 'Le 695 de ma sœur, prête pour son premier rasso', hoursAgo: 150 },
  ],
  lucas_mt07: [
    { url: IMG.mt07, caption: 'Toute propre après le lavage du dimanche', hoursAgo: 9 },
    { url: IMG.ubacs, caption: 'Petite route du Garlaban, personne à l’horizon', hoursAgo: 30 },
    { url: IMG.mt07b, caption: 'Pause café à Aubagne', hoursAgo: 120 },
  ],
  yanis_duke: [{ url: IMG.mt09, caption: 'Sortie avec les copains ce matin, MT-09 et MT-07 de la partie', hoursAgo: 14 }],
  max_sportster: [{ url: IMG.concours, caption: 'Le Concours d’un pote du club, sacré engin', hoursAgo: 26 }],
  lea_tenere: [{ url: IMG.sportTouring, caption: 'Souvenir du road trip aux États-Unis', hoursAgo: 40 }],
  'sarah.gs': [
    { url: IMG.gs, caption: 'Prête pour le cap Nord 💪', hoursAgo: 20 },
    { url: IMG.morocco, caption: 'Maroc l’an dernier, le plus beau voyage', hoursAgo: 200 },
  ],
  karim_z900: [
    { url: IMG.z900, caption: 'Nouvelle Z900 !', hoursAgo: 8 },
    { url: IMG.z900rs, caption: 'Croisé cette Z900RS Moriwaki au rasso de Marignane', hoursAgo: 96 },
  ],
  cam_street765: [
    { url: IMG.tripleGreen, caption: 'Le vert lime, on aime ou on déteste', hoursAgo: 12 },
    { url: IMG.tripleBlack, caption: 'Street Triple en noir, plus sobre', hoursAgo: 80 },
    { url: IMG.triumph, caption: 'Expo Triumph ce week-end', hoursAgo: 170 },
  ],
  hugo_gsxs: [{ url: IMG.mt03, caption: 'Ma toute première moto, la MT-03 🥲', hoursAgo: 60 }],
  mehdi_africa: [{ url: IMG.gtr1000, caption: 'Le GTR de mon père, toujours dans le garage', hoursAgo: 33 }],
  emi_interceptor: [{ url: IMG.piana, caption: 'Les calanques de Piana, Corse l’été dernier', hoursAgo: 55 }],
};

const COVERS: Record<string, string> = {
  julie_cb650r: IMG.cassis,
  antoine_monster: IMG.monster900,
  lucas_mt07: IMG.ubacs,
  'sarah.gs': IMG.morocco,
  karim_z900: IMG.z900,
  cam_street765: IMG.tripleGreen,
  lea_tenere: IMG.sportTouring,
  emi_interceptor: IMG.piana,
};

export function demoCover(username: string): string | null {
  return COVERS[username] ?? null;
}

export function demoPhotosOf(username: string): WallPhoto[] {
  const rider = findDemoRiderByUsername(username);
  if (!rider) return [];
  return (PHOTOS[username] ?? []).map((p, i) => ({
    id: `demo-photo-${username}-${i}`,
    ownerId: rider.id,
    path: null,
    url: p.url,
    caption: p.caption,
    createdAt: new Date(Date.now() - p.hoursAgo * 3600 * 1000).toISOString(),
    author: { username, avatarUrl: rider.avatar_path },
  }));
}
