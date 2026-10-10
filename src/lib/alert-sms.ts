import * as SMS from 'expo-sms';

import type { LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

// SMS automatiques aux numéros d'urgence (contacts hors app), envoyés par le serveur via Brevo
// (Edge Function send-sms : texte construit côté serveur, quota 10 SMS / 24 h).
// Si l'envoi automatique échoue (réseau, quota, erreur Brevo) : l'appli SMS du téléphone s'ouvre
// avec le message prérempli, à envoyer soi-même (pas de permission SEND_SMS).

export type AlertSmsType = 'sos' | 'chute' | 'je_rentre';

export type AlertSmsResult = {
  /** Nombre de numéros prévenus automatiquement */
  sent: number;
  /** Nombre de numéros à qui l'envoi automatique n'a pas abouti */
  failed: number;
  /** L'appli SMS a été ouverte avec le message prérempli pour ces numéros */
  manualOpened: boolean;
};

function clock(d: Date) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Même message que le serveur, envoyé depuis mon téléphone (le destinataire voit mon numéro) */
function manualText(type: AlertSmsType, position: LatLng | null, eta: Date | null) {
  const where = position
    ? ` Ma position (${clock(new Date())}) : https://maps.google.com/?q=${position.latitude.toFixed(5)},${position.longitude.toFixed(5)}`
    : ' Position inconnue.';
  switch (type) {
    case 'sos':
      return `SOS : j’ai besoin d’aide.${where}`;
    case 'chute':
      return `SOS : chute détectée par PasseRyder, je ne réponds pas.${where}`;
    case 'je_rentre':
      return `Je rentre, arrivée prévue vers ${clock(eta ?? new Date())}. PasseRyder te préviendra si je ne suis pas arrivé(e).`;
  }
}

type Reply = { sent: number; failed: number; refused: number; results?: { status: string }[] };

export async function sendAlertSms(
  type: AlertSmsType,
  phones: string[],
  position: LatLng | null,
  eta: Date | null = null,
): Promise<AlertSmsResult | null> {
  if (!phones.length) return null;
  let failedPhones = phones;
  let sent = 0;
  try {
    const { data, error } = await supabase.functions.invoke<Reply>('send-sms', {
      body: {
        type,
        phones,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        eta: eta?.toISOString() ?? null,
      },
    });
    if (error) throw error;
    if (!data?.results || data.results.length !== phones.length) throw new Error('Réponse inattendue');
    sent = data.sent;
    failedPhones = phones.filter((_, i) => data.results![i].status !== 'sent');
  } catch (e) {
    console.warn('SMS automatique impossible', e);
  }

  let manualOpened = false;
  if (failedPhones.length && (await SMS.isAvailableAsync())) {
    try {
      manualOpened = true;
      await SMS.sendSMSAsync(failedPhones, manualText(type, position, eta));
    } catch (e) {
      console.warn('SMS manuel impossible', e);
    }
  }
  return { sent, failed: failedPhones.length, manualOpened };
}

/** « SMS envoyé à 2 contacts » / « Échec, envoie-le manuellement » */
export function alertSmsLabel(r: AlertSmsResult) {
  const ok = r.sent ? `SMS envoyé à ${r.sent} contact${r.sent > 1 ? 's' : ''}.` : '';
  const ko = r.failed
    ? r.manualOpened
      ? `Échec pour ${r.failed} numéro${r.failed > 1 ? 's' : ''} : envoie-le manuellement (SMS prérempli ouvert).`
      : `Échec pour ${r.failed} numéro${r.failed > 1 ? 's' : ''} : envoie-le manuellement.`
    : '';
  return [ok, ko].filter(Boolean).join(' ');
}
