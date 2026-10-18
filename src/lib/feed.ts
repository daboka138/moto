import type { RideSummary } from '@/lib/rides';
import type { WallPhoto } from '@/lib/wall';

// Fil d'actualité : photos de mes amis + balades qu'ils organisent ou rejoignent.

export type FeedPerson = { id: string; username: string; avatarUrl: string };

export type FeedItem =
  | { kind: 'photo'; key: string; at: string; author: FeedPerson; photo: WallPhoto }
  | { kind: 'ride'; key: string; at: string; ride: RideSummary; people: FeedPerson[]; role: 'organise' | 'participe' };

export function photoItems(photos: WallPhoto[], friends: FeedPerson[]): FeedItem[] {
  const byId = new Map(friends.map((f) => [f.id, f]));
  return photos
    .filter((p) => byId.has(p.ownerId))
    .map((p) => ({ kind: 'photo', key: `photo-${p.id}`, at: p.createdAt, author: byId.get(p.ownerId)!, photo: p }));
}

/** Une entrée par balade : « X organise » si un ami l'organise, sinon « X et Y participent ». */
export function rideItems(rides: RideSummary[], friends: FeedPerson[]): FeedItem[] {
  const byId = new Map(friends.map((f) => [f.id, f]));
  const items: FeedItem[] = [];
  for (const ride of rides) {
    if (ride.status === 'ended') continue;
    const organizer = byId.get(ride.organizer.id);
    if (organizer) {
      items.push({ kind: 'ride', key: `ride-${ride.id}`, at: ride.createdAt, ride, people: [organizer], role: 'organise' });
      continue;
    }
    const joined = ride.members.filter((m) => m.status === 'joined' && byId.has(m.id));
    if (!joined.length) continue;
    const latest = joined.reduce((a, b) => (a.since > b.since ? a : b));
    items.push({
      kind: 'ride',
      key: `ride-${ride.id}`,
      at: latest.since,
      ride,
      people: joined.map((m) => byId.get(m.id)!),
      role: 'participe',
    });
  }
  return items;
}

export function sortFeed(items: FeedItem[]) {
  return [...items].sort((a, b) => b.at.localeCompare(a.at));
}

export function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Membres pour une actu dans le Mur (au plus 1 actu pour 3 publications de membres) */
export const NEWS_EVERY = 3;

/**
 * Mélange les actus moto au fil des membres : une actu après chaque 3e publication, jamais plus.
 * Mur vide : les actus seules (les plus récentes d'abord). Mur presque vide (1-2 posts) : une actu à la fin.
 */
export function mixNews<M, N>(members: M[], news: N[]): (M | N)[] {
  if (!members.length) return [...news];
  const out: (M | N)[] = [];
  let n = 0;
  members.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % NEWS_EVERY === 0 && n < news.length) out.push(news[n++]);
  });
  if (members.length < NEWS_EVERY && news.length) out.push(news[0]);
  return out;
}
