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
  hiddenPlaceKinds: 'moto.map.hiddenPlaceKinds',
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
  /** Catégories de spots masquées sur la carte */
  hiddenPlaceKinds: PlaceKind[];
  setHiddenPlaceKinds: (v: PlaceKind[]) => void;
  mapStyle: MapStyle;
  setMapStyle: (v: MapStyle) => void;
};

const MapLayersContext = createContext<MapLayers | null>(null);

function read(key: string) {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
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
  const [hiddenPlaceKinds, setHidden] = useState(readHiddenKinds);
  const [mapStyle, setStyle] = useState(readStyle);
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
        hiddenPlaceKinds,
        setHiddenPlaceKinds: (v) => {
          setHidden(v);
          try {
            localStorage.setItem(KEYS.hiddenPlaceKinds, JSON.stringify(v));
          } catch {
            // pas grave
          }
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
