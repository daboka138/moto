import 'expo-sqlite/localStorage/install';

// Liens d'authentification reçus par email (mot de passe oublié, connexion) ouverts dans l'app.
//
// Android redonne à chaque démarrage le lien qui a lancé l'app (même depuis les apps récentes) :
// sans précaution, l'écran du lien se rouvrirait indéfiniment. Ici, chaque lien (token_hash) n'ouvre
// l'écran qu'UNE fois par appareil ; ensuite, retour à la connexion ou à la carte avec un message.
// Le lien est gardé en mémoire (jamais dans la route mémorisée) jusqu'à son utilisation.

export type EmailLinkType = 'recovery' | 'magiclink';
export type PendingAuthLink = { tokenHash: string; type: EmailLinkType };

const SEEN_KEY = 'moto.authLinksSeen';
const MAX_SEEN = 20;

let pending: PendingAuthLink | null = null;
let notice: string | null = null;

/** Extrait token_hash et type d'un lien …/auth-callback?token_hash=…&type=… (null sinon) */
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
    // pas grave : au pire le lien pourra se rouvrir une fois de plus
  }
}

/**
 * Lien entrant (appelé par src/app/+native-intent.tsx). Renvoie le chemin à ouvrir :
 * '/auth-callback' pour un lien neuf, '/' (connexion ou carte) pour un lien déjà ouvert ou incomplet.
 */
export function routeIncomingAuthLink(url: string): string | null {
  const link = parseAuthLink(url);
  if (link === null) return null;
  if (link === 'invalid') {
    notice = 'Ce lien est incomplet. Ouvre-le directement depuis l’email, ou demande-en un nouveau.';
    return '/';
  }
  if (seenLinks().includes(link.tokenHash)) {
    notice = 'Ce lien a déjà été ouvert sur ce téléphone. Si tu n’as pas terminé, redemande un lien depuis « Mot de passe oublié ? ».';
    return '/';
  }
  markSeen(link.tokenHash);
  pending = link;
  return '/auth-callback';
}

export const getPendingAuthLink = () => pending;
export const clearPendingAuthLink = () => {
  pending = null;
};

/** Message à afficher une fois (lien refusé), lu par l'écran de connexion ou la carte */
export function takeAuthNotice() {
  const n = notice;
  notice = null;
  return n;
}

export function setAuthNotice(text: string) {
  notice = text;
}
