import { createContext, useContext, useState, type ReactNode } from 'react';

// Calques de la carte affichés ou masqués, mémorisés sur le téléphone.
// Masquer les signalements ne coupe PAS les alertes vocales de danger (sécurité).

const KEYS = { reports: 'moto.map.showReports', rides: 'moto.map.showRides' };

type MapLayers = {
  showReports: boolean;
  showRides: boolean;
  setShowReports: (v: boolean) => void;
  setShowRides: (v: boolean) => void;
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
