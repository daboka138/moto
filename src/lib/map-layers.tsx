import { createContext, useContext, useState, type ReactNode } from 'react';

import type { PlaceKind } from '@/lib/places';

// Calques et style de la carte, mémorisés sur le téléphone.
// Masquer les signalements ne coupe PAS les alertes vocales de danger (sécurité).

// Balades : nouvelle clé pour qu'elles réapparaissent par défaut chez ceux qui les avaient masquées
const KEYS = {
  reports: 'moto.map.showReports',
  rides: 'moto.map.showRides.v2',
  places: 'moto.map.showPlaces',
  parkings: 'moto.map.showParkings',
  signals: 'moto.map.showSignals',
  navSignals: 'moto.map.navSignals',
  hiddenPlaceKinds: 'moto.map.hiddenPlaceKinds',
  allDates: 'moto.map.allDates',
  allSpots: 'moto.map.allSpots',
  style: 'moto.map.style',
};

function readHiddenKinds(): PlaceKind[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS.hiddenPlaceKinds) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Style des tuiles, indépendant du thème de l'app. Automatique = sombre entre le coucher et le lever du soleil. */
export type MapStyle = 'classic' | 'dark' | 'auto';

function readStyle(): MapStyle {
  try {
    const v = localStorage.getItem(KEYS.style);
    return v === 'dark' || v === 'auto' ? v : 'classic';
  } catch {
    return 'classic';
  }
}

type MapLayers = {
  showReports: boolean;
  /** Balades et événements */
  showRides: boolean;
  /** Lieux motards (cafés, garages, points de vue, routes) */
  showPlaces: boolean;
  setShowReports: (v: boolean) => void;
  setShowRides: (v: boolean) => void;
  setShowPlaces: (v: boolean) => void;
  /** Parkings moto OpenStreetMap (activé par défaut) */
  showParkings: boolean;
  setShowParkings: (v: boolean) => void;
  /** Feux tricolores hors navigation (désactivé par défaut : nombreux en ville) */
  showSignals: boolean;
  setShowSignals: (v: boolean) => void;
  /** Feux tricolores de l'itinéraire en navigation (activé par défaut) */
  navSignals: boolean;
  setNavSignals: (v: boolean) => void;
  /** Catégories de spots masquées sur la carte */
  hiddenPlaceKinds: PlaceKind[];
  setHiddenPlaceKinds: (v: PlaceKind[]) => void;
  mapStyle: MapStyle;
  setMapStyle: (v: MapStyle) => void;
  /** Balades et événements de toutes les dates (sinon : 7 prochains jours, + ceux où je suis inscrit) */
  allDates: boolean;
  setAllDates: (v: boolean) => void;
  /** Tous les spots (sinon : notés ★ 4 et plus, + les miens) */
  allSpots: boolean;
  setAllSpots: (v: boolean) => void;
};

/** Par défaut, balades et événements des 7 prochains jours seulement */
export const MAP_DEFAULT_DAYS = 7;
/** Par défaut, spots notés au moins 4 */
export const MAP_MIN_SPOT_RATING = 4;

const MapLayersContext = createContext<MapLayers | null>(null);

function read(key: string) {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

/** Réglage désactivé par défaut */
function readOff(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // pas grave
  }
}

export function MapLayersProvider({ children }: { children: ReactNode }) {
  const [showReports, setReports] = useState(() => read(KEYS.reports));
  const [showRides, setRides] = useState(() => read(KEYS.rides));
  const [showPlaces, setPlaces] = useState(() => read(KEYS.places));
  const [showParkings, setParkings] = useState(() => read(KEYS.parkings));
  const [showSignals, setSignals] = useState(() => readOff(KEYS.signals));
  const [navSignals, setNavSignalsState] = useState(() => read(KEYS.navSignals));
  const [hiddenPlaceKinds, setHidden] = useState(readHiddenKinds);
  const [mapStyle, setStyle] = useState(readStyle);
  // Désactivés par défaut (absents = « 0 »)
  const [allDates, setDates] = useState(() => readOff(KEYS.allDates));
  const [allSpots, setSpots] = useState(() => readOff(KEYS.allSpots));
  return (
    <MapLayersContext.Provider
      value={{
        showReports,
        showRides,
        setShowReports: (v) => {
          setReports(v);
          write(KEYS.reports, v);
        },
        setShowRides: (v) => {
          setRides(v);
          write(KEYS.rides, v);
        },
        showPlaces,
        setShowPlaces: (v) => {
          setPlaces(v);
          write(KEYS.places, v);
        },
        showParkings,
        setShowParkings: (v) => {
          setParkings(v);
          write(KEYS.parkings, v);
        },
        showSignals,
        setShowSignals: (v) => {
          setSignals(v);
          write(KEYS.signals, v);
        },
        navSignals,
        setNavSignals: (v) => {
          setNavSignalsState(v);
          write(KEYS.navSignals, v);
        },
        hiddenPlaceKinds,
        setHiddenPlaceKinds: (v) => {
          setHidden(v);
          try {
            localStorage.setItem(KEYS.hiddenPlaceKinds, JSON.stringify(v));
          } catch {
            // pas grave
          }
        },
        allDates,
        setAllDates: (v) => {
          setDates(v);
          write(KEYS.allDates, v);
        },
        allSpots,
        setAllSpots: (v) => {
          setSpots(v);
          write(KEYS.allSpots, v);
        },
        mapStyle,
        setMapStyle: (v) => {
          setStyle(v);
          try {
            localStorage.setItem(KEYS.style, v);
          } catch {
            // pas grave
          }
        },
      }}>
      {children}
    </MapLayersContext.Provider>
  );
}

export function useMapLayers() {
  const ctx = useContext(MapLayersContext);
  if (!ctx) throw new Error('useMapLayers doit être utilisé dans <MapLayersProvider>');
  return ctx;
}
