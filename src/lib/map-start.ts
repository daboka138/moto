import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';

// Vue de départ de la carte, avant la première position GPS (ou sans autorisation) :
// dernière position connue (gardée SUR L'APPAREIL uniquement), sinon la ville du profil, sinon la France.

export type MapView = LatLng & { zoom: number };

const LAST_KEY = 'moto.lastPosition';
const CITY_KEY = 'moto.cityCenter';
/** Zoom « ville » : quartier lisible, rues principales */
export const CITY_ZOOM = 13;
const FRANCE: MapView = { latitude: 46.6, longitude: 2.4, zoom: 6 };

let lastSavedAt = 0;

/** Mémorise ma position sur l'appareil (au plus toutes les 30 s), pour ouvrir la carte au bon endroit */
export function saveLastPosition(p: LatLng) {
  const now = Date.now();
  if (now - lastSavedAt < 30_000) return;
  lastSavedAt = now;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ latitude: +p.latitude.toFixed(4), longitude: +p.longitude.toFixed(4), t: now }));
  } catch {
    // stockage indisponible
  }
}

export function readLastPosition(): LatLng | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
    return v && typeof v.latitude === 'number' && typeof v.longitude === 'number' ? { latitude: v.latitude, longitude: v.longitude } : null;
  } catch {
    return null;
  }
}

function readCity(city: string): LatLng | null {
  try {
    const v = JSON.parse(localStorage.getItem(CITY_KEY) ?? 'null');
    return v?.city === city ? { latitude: v.latitude, longitude: v.longitude } : null;
  } catch {
    return null;
  }
}

/** Centre d'une commune (Géoplateforme, gratuite et sans clé), gardé sur l'appareil */
async function geocodeCity(city: string): Promise<LatLng | null> {
  const params = new URLSearchParams({ q: city, type: 'municipality', limit: '1' });
  const res = await fetch(`https://data.geopf.fr/geocodage/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
  const c = json.features?.[0]?.geometry.coordinates;
  if (!c) return null;
  const p = { latitude: c[1], longitude: c[0] };
  try {
    localStorage.setItem(CITY_KEY, JSON.stringify({ city, ...p }));
  } catch {
    // pas grave
  }
  return p;
}

/** Vue de départ : dernière position (zoom ville), sinon ville du profil, sinon la France */
export function useDefaultMapView(city: string | null | undefined): MapView {
  const [last] = useState(readLastPosition);
  const cityName = city?.trim() || null;
  const [geocoded, setGeocoded] = useState<{ city: string; p: LatLng | null } | null>(null);
  const cached = cityName ? readCity(cityName) : null;

  useEffect(() => {
    if (last || !cityName || cached) return;
    let cancelled = false;
    geocodeCity(cityName)
      .then((p) => !cancelled && setGeocoded({ city: cityName, p }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // cached dépend de cityName
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, cityName]);

  if (last) return { ...last, zoom: CITY_ZOOM };
  const cityCenter = cached ?? (geocoded?.city === cityName ? geocoded.p : null);
  if (cityCenter) return { ...cityCenter, zoom: 12 };
  return FRANCE;
}
