import type { LatLng } from '@/lib/geo';

// Recherche d'adresse via Photon (données OpenStreetMap, sans clé).
// Service public gratuit : OK pour le dev, à remplacer par un service avec clé avant la prod.

export type Place = LatLng & { label: string };

const PHOTON = 'https://photon.komoot.io';

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    postcode?: string;
    state?: string;
  };
};

function labelOf(f: Feature): string {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [p.name, street, p.city].filter((x, i, all) => !!x && all.indexOf(x) === i);
  return parts.join(', ') || 'Point sur la carte';
}

function toPlace(f: Feature): Place {
  const [longitude, latitude] = f.geometry.coordinates;
  return { label: labelOf(f), latitude, longitude };
}

export async function searchPlaces(query: string, near?: LatLng | null): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: '6', lang: 'fr' });
  if (near) {
    params.set('lat', String(near.latitude));
    params.set('lon', String(near.longitude));
  }
  const res = await fetch(`${PHOTON}/api/?${params}`);
  if (!res.ok) throw new Error(`Recherche d'adresse impossible (${res.status})`);
  const json = await res.json();
  return (json.features ?? []).map(toPlace);
}

/** Adresse la plus proche d'un point ; renvoie un libellé générique si rien n'est trouvé. */
export async function reverseGeocode(point: LatLng): Promise<Place> {
  const fallback = {
    ...point,
    label: `Point ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`,
  };
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${point.latitude}&lon=${point.longitude}&lang=fr`);
    if (!res.ok) return fallback;
    const json = await res.json();
    const feature: Feature | undefined = json.features?.[0];
    return feature ? { ...point, label: labelOf(feature) } : fallback;
  } catch {
    return fallback;
  }
}
