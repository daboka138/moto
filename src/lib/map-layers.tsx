import { createContext, useContext, useState, type ReactNode } from 'react';

// Calques et style de la carte, mémorisés sur le téléphone.
// Masquer les signalements ne coupe PAS les alertes vocales de danger (sécurité).

const KEYS = { reports: 'moto.map.showReports', rides: 'moto.map.showRides', style: 'moto.map.style' };

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
  showRides: boolean;
  setShowReports: (v: boolean) => void;
  setShowRides: (v: boolean) => void;
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
