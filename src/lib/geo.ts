export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Distance à vol d'oiseau en mètres (haversine). */
export function distanceM(a: LatLng, b: LatLng) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
