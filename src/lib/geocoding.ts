import type { LatLng } from '@/lib/geo';

// Lieu choisi (départ, arrivée, étape, RDV). Recherche et adresse d'un point : lib/search.ts
// (Géoplateforme + Nominatim), la même que la recherche de l'onglet Carte.

export type Place = LatLng & { label: string };
