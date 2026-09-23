import { createContext, useContext, useState, type ReactNode } from 'react';

// Mode démo : faux motards simulés sur la carte. Activé par défaut en dev.
// Le choix est mémorisé sur l'appareil (localStorage fourni par expo-sqlite).

const STORAGE_KEY = 'demoMode';

type DemoState = { enabled: boolean; setEnabled: (value: boolean) => void };

const DemoContext = createContext<DemoState | null>(null);

function readStored(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null ? __DEV__ : value === '1';
  } catch {
    return __DEV__;
  }
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readStored);

  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // pas grave : le choix ne sera juste pas mémorisé
    }
  };

  return <DemoContext.Provider value={{ enabled, setEnabled }}>{children}</DemoContext.Provider>;
}

export function useDemoMode() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemoMode doit être utilisé dans <DemoProvider>');
  return ctx;
}
