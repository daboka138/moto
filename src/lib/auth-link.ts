import 'expo-sqlite/localStorage/install';

import { useSyncExternalStore } from 'react';

// Liens d'authentification reçus par email (mot de passe oublié, connexion) ouverts dans l'app.
//
// Un lien entrant n'ouvre JAMAIS directement un écran au lancement : +native-intent renvoie
// toujours vers « / » (carte si connecté, sinon connexion), et garde le lien ici, en mémoire.
// AuthLinkOpener (_layout.tsx) ouvre ensuite /auth-callback PAR-DESSUS l'écran d'accueil.
// Android redonne à chaque démarrage le lien qui a lancé l'app : chaque lien (token_hash) n'est
// donc proposé qu'UNE fois par appareil ; ensuite, simple bandeau d'information.

export type EmailLinkType = 'recovery' | 'magiclink';
export type PendingAuthLink = { tokenHash: string; type: EmailLinkType };
type AuthLinkState = { pending: PendingAuthLink | null; notice: string | null };

const SEEN_KEY = 'moto.authLinksSeen';
const MAX_SEEN = 20;

let state: AuthLinkState = { pending: null, notice: null };
const listeners = new Set<() => void>();

function update(patch: Partial<AuthLinkState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useAuthLinkState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Extrait token_hash et type d'un lien …/auth-callback?token_hash=…&type=… (null si autre lien) */
export function parseAuthLink(url: string): PendingAuthLink | null | 'invalid' {
  const match = /auth-callback\/?(?:\?([^#]*))?/.exec(url);
  if (!match) return null;
  const params = new URLSearchParams(match[1] ?? '');
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (!tokenHash || (type !== 'recovery' && type !== 'magiclink')) return 'invalid';
  return { tokenHash, type };
}

function seenLinks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function markSeen(tokenHash: string) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([tokenHash, ...seenLinks().filter((t) => t !== tokenHash)].slice(0, MAX_SEEN)));
  } catch {
    // pas grave : au pire le lien sera proposé une fois de plus
  }
}

/**
 * Lien entrant (src/app/+native-intent.tsx). Renvoie null si ce n'est pas un lien d'email, sinon
 * TOUJOURS '/' : l'écran du lien s'ouvrira par-dessus l'accueil s'il est neuf.
 */
export function routeIncomingAuthLink(url: string): string | null {
  const link = parseAuthLink(url);
  if (link === null) return null;
  if (link === 'invalid') {
    update({ notice: 'Lien incomplet : ouvre-le directement depuis l’email, ou demande-en un nouveau.' });
  } else if (seenLinks().includes(link.tokenHash)) {
    // Cas normal au redémarrage (Android rejoue le lien de lancement) : rien à signaler
  } else {
    markSeen(link.tokenHash);
    update({ pending: link });
  }
  return '/';
}

export const getPendingAuthLink = () => state.pending;
export const clearPendingAuthLink = () => {
  if (state.pending) update({ pending: null });
};

/** Bandeau d'information (lien refusé), affiché sur la connexion ou la carte */
export const setAuthNotice = (notice: string | null) => update({ notice });
