import { DEMO_RIDERS } from '@/demo/riders';
import { demoSocial } from '@/demo/social';
import type { RiderResult } from '@/lib/rider-filters';

// Faux motards dans la recherche : distance stable et plausible (3 à 45 km selon le pseudo).
// Comme en vrai, ceux en fantôme n'apparaissent pas.

function stableKm(username: string) {
  let h = 0;
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return 3 + (h % 43);
}

export function demoRiderResults(): RiderResult[] {
  return DEMO_RIDERS.filter((r) => demoSocial(r).privacy !== 'ghost').map((r) => {
    const m = r.motorcycles[0];
    return {
      id: r.id,
      username: r.username,
      avatarUrl: r.avatar_path,
      city: r.city,
      bio: r.bio,
      ridingStyles: r.riding_styles,
      pace: r.pace,
      availability: r.availability,
      licenseYear: r.license_year,
      moto: m ? { brand: m.brand, model: m.model, cc: m.displacement_cc, category: m.category } : null,
      distanceKm: stableKm(r.username),
      isDemo: true,
    };
  });
}
