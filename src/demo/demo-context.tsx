import { createContext, useContext, useState, type ReactNode } from 'react';

import { DEMO_RIDERS } from '@/demo/riders';
import { DEMO_INITIAL_INVITED, DEMO_INITIAL_JOINED } from '@/demo/rides';
import { demoSocial, type DemoSocialState } from '@/demo/social';

// Mode démo : faux motards simulés sur la carte. Activé par défaut en dev (__DEV__) seulement :
// désactivé par défaut dans les APK de test et de prod, activable dans Paramètres.
// Le choix est mémorisé sur l'appareil (localStorage fourni par expo-sqlite).
// Les amitiés et le trajet de groupe de démo ne vivent qu'en mémoire.

const STORAGE_KEY = 'demoMode';

type DemoState = DemoSocialState & {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  acceptRequest: (id: string) => void;
  refuseRequest: (id: string) => void;
  removeFriend: (id: string) => void;
  /** En démo, une demande envoyée est acceptée tout de suite */
  addFriend: (id: string) => void;
  setRideActive: (active: boolean) => void;
  invitedRideIds: string[];
  joinRide: (id: string) => void;
  leaveRide: (id: string) => void;
};

const DemoContext = createContext<DemoState | null>(null);

function readStored(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === null ? __DEV__ : value === '1';
  } catch {
    return __DEV__;
  }
}

const idsWith = (relation: string) => DEMO_RIDERS.filter((r) => demoSocial(r).relation === relation).map((r) => r.id);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readStored);
  const [friendIds, setFriendIds] = useState(() => idsWith('friend'));
  const [incomingIds, setIncomingIds] = useState(() => idsWith('incoming'));
  const [rideActive, setRideActive] = useState(true);
  const [joinedRideIds, setJoinedRideIds] = useState(DEMO_INITIAL_JOINED);
  const [invitedRideIds] = useState(DEMO_INITIAL_INVITED);

  const setEnabled = (value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // pas grave : le choix ne sera juste pas mémorisé
    }
  };

  const value: DemoState = {
    enabled,
    setEnabled,
    friendIds,
    incomingIds,
    rideActive,
    setRideActive,
    joinedRideIds,
    invitedRideIds,
    joinRide: (id) => setJoinedRideIds((ids) => (ids.includes(id) ? ids : [...ids, id])),
    leaveRide: (id) => setJoinedRideIds((ids) => ids.filter((x) => x !== id)),
    acceptRequest: (id) => {
      setIncomingIds((ids) => ids.filter((x) => x !== id));
      setFriendIds((ids) => [...ids, id]);
    },
    refuseRequest: (id) => setIncomingIds((ids) => ids.filter((x) => x !== id)),
    removeFriend: (id) => setFriendIds((ids) => ids.filter((x) => x !== id)),
    addFriend: (id) => {
      setIncomingIds((ids) => ids.filter((x) => x !== id));
      setFriendIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    },
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoMode() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemoMode doit être utilisé dans <DemoProvider>');
  return ctx;
}
