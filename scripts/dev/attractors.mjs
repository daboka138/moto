// Attracteurs comme dans l'app (lib/scenic.ts loopAttractors) : cols / routes réputés + spots
// « belle route » / « point de vue » notés 4/5 ou plus, lus avec la clé publishable du .env.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^EXPO_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]),
);
const get = async (path) => {
  const r = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY } });
  return r.ok ? r.json() : [];
};
export async function attractors() {
  const scenic = await get('scenic_waypoints?select=name,latitude,longitude&active=eq.true');
  const spots = await get('places?select=name,kind,latitude,longitude,reviews:place_reviews(rating)&kind=in.(road,viewpoint)');
  return [
    ...scenic.map((s) => ({ ...s, weight: 1 })),
    ...spots
      .map((p) => ({ ...p, rating: p.reviews?.length ? p.reviews.reduce((a, x) => a + x.rating, 0) / p.reviews.length : 0 }))
      .filter((p) => p.rating >= 4)
      .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude, weight: 0.6 + (p.rating - 4) * 0.3 })),
  ];
}
