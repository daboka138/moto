import { openDirectConversation } from '@/lib/messages';
import { supabase } from '@/lib/supabase';

// Partage de trajet en direct : une fiche envoyée dans Messages à un ami, avec ma destination,
// mon heure d'arrivée estimée et ma position, mises à jour pendant la navigation. À l'arrivée
// (ou à l'arrêt), le partage se termine et la position est effacée côté serveur.

export type TripShareStatus = 'active' | 'arrived' | 'stopped';

export type TripShare = {
  id: string;
  userId: string;
  destination: string;
  latitude: number | null;
  longitude: number | null;
  eta: string | null;
  remainingM: number | null;
  status: TripShareStatus;
  updatedAt: string;
};

export type ShareProgress = { latitude: number; longitude: number; remainingS: number; remainingM: number };

/** Sans nouvelles depuis 30 min, le serveur arrête le partage : l'app fait pareil à l'affichage */
export const SHARE_STALE_MS = 30 * 60 * 1000;

function etaIso(remainingS: number) {
  return new Date(Date.now() + remainingS * 1000).toISOString();
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Crée le partage et l'envoie à cet ami dans notre conversation privée. Renvoie l'id du partage. */
export async function shareTripWith(userId: string, friendId: string, destination: string, p: ShareProgress) {
  const conversationId = await openDirectConversation(friendId);
  const eta = etaIso(p.remainingS);
  const { data, error } = await supabase
    .from('trip_shares')
    .insert({
      user_id: userId,
      conversation_id: conversationId,
      destination_label: destination.slice(0, 200),
      latitude: p.latitude,
      longitude: p.longitude,
      eta,
      remaining_m: Math.round(p.remainingM),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const shareId = (data as { id: string }).id;
  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    trip_share_id: shareId,
    // Texte lu par les versions de l'app sans la fiche, et dans la liste des conversations
    body: `📍 Je suis en route vers ${destination.slice(0, 150)}. Arrivée estimée vers ${clock(eta)}.`,
  });
  if (msgError) {
    await supabase.from('trip_shares').delete().eq('id', shareId);
    throw new Error(msgError.message);
  }
  return shareId;
}

export async function updateTripShares(ids: string[], p: ShareProgress) {
  if (!ids.length) return;
  const { error } = await supabase
    .from('trip_shares')
    .update({ latitude: p.latitude, longitude: p.longitude, eta: etaIso(p.remainingS), remaining_m: Math.round(p.remainingM) })
    .in('id', ids);
  if (error) throw error;
}

export async function endTripShares(ids: string[], status: Exclude<TripShareStatus, 'active'>) {
  if (!ids.length) return;
  const { error } = await supabase.from('trip_shares').update({ status }).in('id', ids);
  if (error) throw error;
}

type Row = {
  id: string;
  user_id: string;
  destination_label: string;
  latitude: number | null;
  longitude: number | null;
  eta: string | null;
  remaining_m: number | null;
  status: TripShareStatus;
  updated_at: string;
};

export async function fetchTripShare(id: string): Promise<TripShare | null> {
  const { data, error } = await supabase
    .from('trip_shares')
    .select('id, user_id, destination_label, latitude, longitude, eta, remaining_m, status, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const r = data as Row | null;
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    destination: r.destination_label,
    latitude: r.latitude,
    longitude: r.longitude,
    eta: r.eta,
    remainingM: r.remaining_m,
    status: r.status,
    updatedAt: r.updated_at,
  };
}
