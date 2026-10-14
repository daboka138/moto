import { routeIncomingAuthLink } from '@/lib/auth-link';

/**
 * Liens entrants dans l'app Android (passeryder://…), au lancement comme app ouverte.
 * Lien d'email (auth-callback) : TOUJOURS l'accueil (carte ou connexion) ; le lien est gardé en
 * mémoire et son écran s'ouvre par-dessus (voir src/lib/auth-link.ts). Le reste est inchangé.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return routeIncomingAuthLink(path) ?? path;
  } catch {
    return '/';
  }
}
