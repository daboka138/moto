// Heures de lever et de coucher du soleil (algorithme de SunCalc, précision ~1 min).
// Module pur : aucune dépendance, testable avec tsx.

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
/** Hauteur du soleil au lever/coucher (réfraction + rayon du disque) */
const H0 = -0.833 * RAD;
const OBLIQUITY = 23.4397 * RAD;

const toDays = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY_MS);

export type SunTimes =
  | { kind: 'normal'; sunrise: Date; sunset: Date }
  /** Soleil jamais levé (nuit polaire) ou jamais couché (soleil de minuit) */
  | { kind: 'polarNight' | 'midnightSun' };

export function sunTimes(date: Date, latitude: number, longitude: number): SunTimes {
  const lw = -longitude * RAD;
  const phi = latitude * RAD;
  const n = Math.round(toDays(date) - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = RAD * (357.5291 + 0.98560028 * ds);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  const cosW = (Math.sin(H0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW > 1) return { kind: 'polarNight' };
  if (cosW < -1) return { kind: 'midnightSun' };
  const w = Math.acos(cosW);
  const set = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const rise = noon - (set - noon);
  return { kind: 'normal', sunrise: fromJulian(rise), sunset: fromJulian(set) };
}

/** Vrai entre le coucher et le lever du soleil à cet endroit. */
export function isNight(date: Date, latitude: number, longitude: number): boolean {
  const t = sunTimes(date, latitude, longitude);
  if (t.kind === 'normal') return date < t.sunrise || date > t.sunset;
  return t.kind === 'polarNight';
}
