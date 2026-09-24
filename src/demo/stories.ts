import { demoPhotosOf } from '@/demo/photos';
import { findDemoRiderByUsername } from '@/demo/riders';
import type { Story } from '@/lib/stories';

// Stories de démo (photos libres de droits des faux motards), publiées il y a 1 à 20 h.
const BASE = Date.now();

const SEEDS: { username: string; photoIndex: number; caption: string | null; hoursAgo: number; visibility: Story['visibility'] }[] = [
  { username: 'julie_cb650r', photoIndex: 0, caption: 'Route des Crêtes ce matin ☀️', hoursAgo: 1, visibility: 'friends' },
  { username: 'julie_cb650r', photoIndex: 1, caption: 'Pause à En-Vau', hoursAgo: 3, visibility: 'friends' },
  { username: 'lucas_mt07', photoIndex: 1, caption: 'Qui vient au Garlaban dimanche ?', hoursAgo: 5, visibility: 'friends' },
  { username: 'antoine_monster', photoIndex: 0, caption: null, hoursAgo: 8, visibility: 'friends' },
  { username: 'noah_mt125', photoIndex: 0, caption: 'Première sortie avec les 125 !', hoursAgo: 2, visibility: 'everyone' },
  { username: 'sarah.gs', photoIndex: 0, caption: 'Prête pour le cap Nord', hoursAgo: 12, visibility: 'everyone' },
  { username: 'cam_street765', photoIndex: 0, caption: 'Le vert lime, validé ?', hoursAgo: 20, visibility: 'everyone' },
];

export function demoStories(friendIds: string[]): Story[] {
  const stories: Story[] = [];
  SEEDS.forEach((s, i) => {
    const rider = findDemoRiderByUsername(s.username);
    const photo = demoPhotosOf(s.username)[s.photoIndex];
    if (!rider || !photo) return;
    // Comme sur le serveur : une story « amis » n'est visible que des amis
    if (s.visibility === 'friends' && !friendIds.includes(rider.id)) return;
    stories.push({
      id: `demo-story-${i}`,
      ownerId: rider.id,
      username: rider.username,
      avatarUrl: rider.avatar_path,
      mediaType: 'image',
      mediaPath: null,
      url: photo.url,
      durationS: null,
      caption: s.caption,
      visibility: s.visibility,
      createdAt: new Date(BASE - s.hoursAgo * 3600 * 1000).toISOString(),
      isDemo: true,
    });
  });
  return stories;
}
