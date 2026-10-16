// Messages d'erreur montrés aux membres : jamais de « Failed to fetch » ni d'« [object Object] ».

export const NETWORK_MESSAGE = 'Connexion impossible. Vérifie ta connexion internet, puis réessaie.';

/** La photo choisie ne peut plus être lue (navigateur Android : fichier devenu inaccessible) */
export class PhotoUnreadableError extends Error {
  constructor(readonly uri: string) {
    super('Ta photo n’a pas pu être lue. Choisis-la de nouveau, puis réessaie.');
    this.name = 'PhotoUnreadableError';
  }
}

const NETWORK = /failed to fetch|fetch failed|network ?error|networkerror|load failed|network request failed|timed? ?out|aborted|err_internet|err_network/i;

/** Erreur de connexion (navigateur, React Native, supabase-js, délai dépassé) */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const name = typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (/AuthRetryableFetchError|FetchError|AbortError|TimeoutError/.test(name)) return true;
  const message = typeof e === 'string' ? e : typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  return NETWORK.test(message);
}

/** Texte clair pour une erreur (Error, erreur Supabase en objet simple, chaîne) */
export function errorMessage(e: unknown): string {
  if (e instanceof PhotoUnreadableError) return e.message;
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Une erreur est survenue. Réessaie dans un instant.';
}
