import { createContext, useContext, useState, type ReactNode } from 'react';

// Sécurité : pendant une navigation au-dessus de 10 km/h, toute saisie de texte
// est désactivée dans l'app (Field, recherche...). Seuls les gros boutons restent actifs.

export const DRIVING_LOCK_SPEED_KMH = 10;

type DrivingLock = { locked: boolean; setLocked: (value: boolean) => void };

const DrivingLockContext = createContext<DrivingLock>({ locked: false, setLocked: () => {} });

export function DrivingLockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  return <DrivingLockContext.Provider value={{ locked, setLocked }}>{children}</DrivingLockContext.Provider>;
}

export function useDrivingLock() {
  return useContext(DrivingLockContext);
}
