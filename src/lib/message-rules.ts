// Règles pures des messages (sans Supabase : testées par scripts/dev/message-edit-test.mjs).

/** Modifier un message : 1 h après l'envoi (vérifié aussi par edit_message côté serveur) */
export const EDIT_WINDOW_MS = 60 * 60_000;
export const DELETE_FOR_ALL_WINDOW_MS = 60 * 60_000;

/**
 * Date Postgres → millisecondes, sans dépendre de l'analyseur du moteur JS : microsecondes
 * (« .329098 »), espace au lieu de « T », fuseau « +00 » ou absent (= UTC). NaN si illisible.
 */
export function timestampMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(iso.trim());
  if (!m) return new Date(iso).getTime();
  const [, y, mo, d, h, mi, s = '0', frac = '0', tz] = m;
  const ms = Number(frac.slice(0, 3).padEnd(3, '0'));
  let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms);
  if (tz && tz.toUpperCase() !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    const digits = tz.slice(1).replace(':', '');
    t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0')) * 60_000;
  }
  return t;
}

type Editable = {
  senderId: string;
  body: string | null;
  createdAt: string;
  kind: 'user' | 'system';
  tripShareId?: string | null;
  audioPath?: string | null;
  deletedAt: string | null;
};

/**
 * Âge d'un message ; horloge du téléphone en retard (âge négatif) ou date illisible = « tout juste
 * envoyé » (le serveur refuse de toute façon après 1 h).
 */
const ageMs = (createdAt: string, now: number) => {
  const age = now - timestampMs(createdAt);
  return Number.isFinite(age) ? Math.max(0, age) : 0;
};

/**
 * ✏️ Modifier : mon message texte, pendant 1 h. Ne dépend PAS du statut (envoyé / reçu / vu).
 */
export function canEditMessage(m: Editable, meId: string, now = Date.now()) {
  return (
    !!meId &&
    m.senderId === meId &&
    m.kind === 'user' &&
    !m.deletedAt &&
    !m.tripShareId &&
    !m.audioPath &&
    !!m.body &&
    ageMs(m.createdAt, now) < EDIT_WINDOW_MS
  );
}

/** Supprimer pour tout le monde : mon message, pendant 1 h */
export function canDeleteForAll(m: Editable, meId: string, now = Date.now()) {
  return !!meId && m.senderId === meId && m.kind === 'user' && !m.deletedAt && ageMs(m.createdAt, now) < DELETE_FOR_ALL_WINDOW_MS;
}
