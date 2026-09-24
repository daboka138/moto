import { Alert } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { supabase } from '@/lib/supabase';

// Blocage et signalement (obligatoires pour publier sur les stores).
// Un blocage coupe tout, côté serveur : messages privés, position, stories,
// recherche de motards, demandes d'ami. L'amitié éventuelle est supprimée.

export type ReportTarget = 'message' | 'story' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'danger' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harcèlement ou insultes' },
  { value: 'inappropriate', label: 'Contenu choquant ou inapproprié' },
  { value: 'spam', label: 'Spam ou arnaque' },
  { value: 'danger', label: 'Mise en danger' },
  { value: 'other', label: 'Autre' },
];

export async function blockUser(userId: string, otherId: string) {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: userId, blocked_id: otherId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(userId: string, otherId: string) {
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', otherId);
  if (error) throw error;
}

export async function fetchBlockedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.blocked_id);
}

export async function reportContent(targetType: ReportTarget, targetId: string, reason: ReportReason) {
  const { error } = await supabase
    .from('content_reports')
    .insert({ target_type: targetType, target_id: targetId, reason });
  // Déjà signalé : on considère que c'est fait
  if (error && error.code !== '23505') throw error;
}

/**
 * Demande le motif puis envoie le signalement. `onDone` est appelé après l'envoi.
 * Les contenus de démo (id « demo-… ») ne sont pas envoyés au serveur.
 */
export function askReport(targetType: ReportTarget, targetId: string, onDone?: () => void) {
  const title =
    targetType === 'message' ? 'Signaler ce message' : targetType === 'story' ? 'Signaler cette story' : 'Signaler ce motard';
  showActionSheet({
    title,
    message: 'Pourquoi ?',
    options: REPORT_REASONS.map((r) => ({
      label: r.label,
      onPress: async () => {
        try {
          if (!targetId.startsWith('demo-')) await reportContent(targetType, targetId, r.value);
          Alert.alert('Merci', 'Ton signalement a été envoyé. Nous allons l’examiner.');
          onDone?.();
        } catch (e) {
          Alert.alert('Signalement impossible', e instanceof Error ? e.message : String(e));
        }
      },
    })),
  });
}

/** Confirmation puis blocage. */
export function askBlock(userId: string, other: { id: string; username: string }, onDone?: () => void) {
  Alert.alert(
    `Bloquer @${other.username} ?`,
    'Il ne pourra plus t’écrire, voir ta position ni tes stories, et ne te trouvera plus dans la recherche. Vous ne serez plus amis.',
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Bloquer',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId, other.id);
            onDone?.();
          } catch (e) {
            Alert.alert('Blocage impossible', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ],
  );
}
