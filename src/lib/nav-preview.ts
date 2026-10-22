import type { MapPin, MapPosition, MapRoute } from '@/components/map-types';
import { bearingDeg, type LatLng } from '@/lib/geo';
import type { NavRoute } from '@/lib/navigation';
import type { NavProgress } from '@/lib/use-navigation';

// Données FICTIVES de l'aperçu de l'écran de navigation (écran nav-preview, admin) : un trajet
// au nord de Marseille, calculé ici, rien n'est lu ni écrit en base. Sert à vérifier la mise en page
// (petit et grand écran, 2D / 3D) et aux captures.

const points: LatLng[] = [];
for (let i = 0; i <= 200; i++) points.push({ latitude: 43.3 + i * 0.00025, longitude: 5.38 + Math.sin(i / 18) * 0.004 });

const AT = 20;

export const PREVIEW_ROUTE: Pick<NavRoute, 'points' | 'steps'> = {
  points,
  steps: [
    { location: points[0], alongM: 0, icon: 'depart', action: 'Pars vers le nord', road: null },
    { location: points[AT + 10], alongM: 300, icon: 'right', action: 'Tourne à droite', road: 'Avenue de Saint-Antoine' },
    { location: points[AT + 15], alongM: 480, icon: 'left', action: 'Tourne à gauche', road: 'Chemin de la Bigotte' },
  ],
};

export const PREVIEW_POSITION: MapPosition = {
  latitude: points[AT].latitude,
  longitude: points[AT].longitude,
  accuracy: 6,
  heading: bearingDeg(points[AT], points[AT + 1]),
};

export const PREVIEW_PROGRESS: NavProgress = {
  next: { step: PREVIEW_ROUTE.steps[1], index: 1, distanceM: 300 },
  alongM: 0,
  remainingM: 23_400,
  remainingS: 1920,
  offRoute: false,
};

export const PREVIEW_ROUTES: MapRoute[] = [
  { id: 'nav', points: points.map((p) => [p.latitude, p.longitude]) },
];

export const PREVIEW_PINS: MapPin[] = [{ id: 'end', kind: 'end', label: 'B', latitude: points[200].latitude, longitude: points[200].longitude }];
