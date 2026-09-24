// Catégories de moto et ce qui en découle : itinéraires, balades compatibles.

export type MotoCategory = 'cyclo' | '125' | 'a2' | 'big' | 'trail';

export const MOTO_CATEGORIES: { value: MotoCategory; label: string; short: string; description: string }[] = [
  { value: 'cyclo', label: '50 cm³ / cyclo', short: '50 cm³', description: 'Cyclomoteur, 45 km/h max, pas d’autoroute' },
  { value: '125', label: '125 cm³', short: '125', description: 'Petite cylindrée (permis A1 / B + formation)' },
  { value: 'a2', label: 'A2 · moyenne cylindrée', short: 'A2', description: 'Moyenne cylindrée, permis A2' },
  { value: 'big', label: 'Gros cube', short: 'Gros cube', description: 'Grosse cylindrée, permis A' },
  { value: 'trail', label: 'Trail / off-road', short: 'Trail', description: 'À l’aise hors goudron' },
];

export const ALL_CATEGORIES = MOTO_CATEGORIES.map((c) => c.value);

export const categoryInfo = (c: MotoCategory) => MOTO_CATEGORIES.find((x) => x.value === c)!;

const TRAIL_MODELS = /t[ée]n[ée]r[ée]|africa twin|\bgs\b|gs ?a|adventure|enduro|\bexc\b|\bcrf|\bwr ?\d|tiger|v-?strom|desert ?x|transalp|himalayan|trail/i;

/** Catégorie suggérée à partir de la cylindrée (et du modèle pour repérer les trails). */
export function inferCategory(cc: number | null | undefined, model?: string): MotoCategory | null {
  if (model && TRAIL_MODELS.test(model)) return 'trail';
  if (!cc) return null;
  if (cc <= 50) return 'cyclo';
  if (cc <= 125) return '125';
  if (cc <= 700) return 'a2';
  return 'big';
}

// ---------- Rythme et type de route ----------

export type Pace = 'cool' | 'modere' | 'soutenu';
export const PACES: { value: Pace; label: string; description: string }[] = [
  { value: 'cool', label: 'Cool', description: '60-80 km/h' },
  { value: 'modere', label: 'Modéré', description: '80-100 km/h' },
  { value: 'soutenu', label: 'Soutenu', description: '100 km/h et +' },
];
export const paceInfo = (p: Pace) => PACES.find((x) => x.value === p)!;

export type Surface = 'asphalt' | 'track' | 'mixed';
export const SURFACES: { value: Surface; label: string }[] = [
  { value: 'asphalt', label: 'Goudron' },
  { value: 'mixed', label: 'Mixte' },
  { value: 'track', label: 'Piste' },
];
export const surfaceInfo = (s: Surface) => SURFACES.find((x) => x.value === s)!;

export type Availability = 'semaine' | 'weekend';
export const AVAILABILITIES: { value: Availability; label: string }[] = [
  { value: 'semaine', label: 'En semaine' },
  { value: 'weekend', label: 'Le week-end' },
];

// ---------- Options d'itinéraire ----------

export type RouteOptions = {
  /** Profil 50 cm³ : 45 km/h max, jamais d'autoroute ni de voie rapide */
  scooter50: boolean;
  avoidHighways: boolean;
  avoidTolls: boolean;
  avoidUnpaved: boolean;
  /** Recherche volontiers les chemins (trail) */
  preferTrails: boolean;
  style: 'fast' | 'fun';
};

/** Options préremplies selon la catégorie de la moto (modifiables à chaque trajet). */
export function defaultRouteOptions(category: MotoCategory | null): RouteOptions {
  switch (category) {
    case 'cyclo':
      return { scooter50: true, avoidHighways: true, avoidTolls: true, avoidUnpaved: true, preferTrails: false, style: 'fast' };
    case '125':
      return { scooter50: false, avoidHighways: true, avoidTolls: false, avoidUnpaved: true, preferTrails: false, style: 'fast' };
    case 'trail':
      return { scooter50: false, avoidHighways: false, avoidTolls: false, avoidUnpaved: false, preferTrails: true, style: 'fun' };
    default:
      return { scooter50: false, avoidHighways: false, avoidTolls: false, avoidUnpaved: true, preferTrails: false, style: 'fast' };
  }
}

/** Une balade accepte-t-elle ma moto ? (null si je n'ai pas de moto renseignée) */
export function rideFitsCategory(rideCategories: MotoCategory[], mine: MotoCategory | null): boolean | null {
  if (!mine) return null;
  return rideCategories.includes(mine);
}

/** Texte d'avertissement si je rejoins une balade qui n'accepte pas ma moto (null si compatible). */
export function incompatibilityWarning(rideCategories: MotoCategory[], mine: MotoCategory | null): string | null {
  if (!mine || rideCategories.includes(mine)) return null;
  const accepted = rideCategories.map((c) => categoryInfo(c).short).join(', ');
  if (mine === 'cyclo') {
    return `Cette balade est prévue pour : ${accepted}. En 50 cm³ (45 km/h max, pas d'autoroute), tu risques de ne pas pouvoir suivre le groupe ni le tracé.`;
  }
  return `Cette balade est prévue pour : ${accepted}. Ta moto (${categoryInfo(mine).short}) n'en fait pas partie.`;
}

/**
 * Options de tracé d'une balade : ouverte aux 50 cm³ → profil cyclomoteur (jamais
 * d'autoroute) ; piste → chemins bienvenus ; sinon itinéraire standard (undefined).
 */
export function rideRouteOptions(categories: MotoCategory[], surface: Surface): RouteOptions | undefined {
  if (categories.includes('cyclo')) return defaultRouteOptions('cyclo');
  if (surface !== 'asphalt') return defaultRouteOptions('trail');
  return undefined;
}
