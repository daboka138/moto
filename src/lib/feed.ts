import type { RideSummary } from '@/lib/rides';
import type { WallPhoto } from '@/lib/wall';

// Fil d'actualité : photos de mes amis + balades qu'ils organisent ou rejoignent.

export type FeedPerson = { id: string; username: string; avatarUrl: string; isDemo?: boolean };

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
