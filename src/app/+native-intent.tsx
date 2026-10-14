import { routeIncomingAuthLink } from '@/lib/auth-link';

/**
 * Liens entrants dans l'app Android (passeryder://…), au lancement comme app ouverte.
 * Les liens d'email (auth-callback) passent par src/lib/auth-link.ts : ouverts une seule fois,
 * jamais rejoués au redémarrage. Le reste est inchangé.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return routeIncomingAuthLink(path) ?? path;
  } catch {
    return '/';
  }
}
