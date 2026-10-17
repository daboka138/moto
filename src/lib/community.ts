import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// Groupe communauté officiel « PasseRyder – On construit l'appli ensemble 🛠️ » (groupe public
// rejoignable sans invitation) et outils des groupes publics : message épinglé, modération.

export type OfficialGroup = { id: string; title: string; membersCount: number; joined: boolean };

export async function fetchOfficialGroup(): Promise<OfficialGroup | null> {
  const { data, error } = await supabase.rpc('official_group');
  if (error) throw error;
  const r = ((data ?? []) as { id: string; title: string; members_count: number; joined: boolean }[])[0];
  return r ? { id: r.id, title: r.title, membersCount: r.members_count, joined: r.joined } : null;
}

export async function joinPublicGroup(conversationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_public_group', { p_conv: conversationId });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Infos d'un groupe : public / officiel, message épinglé */
export type GroupInfo = { isPublic: boolean; isOfficial: boolean; pinnedMessageId: string | null };

export async function fetchGroupInfo(conversationId: string): Promise<GroupInfo | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('is_public, is_official, pinned_message_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  const r = data as { is_public: boolean; is_official: boolean; pinned_message_id: string | null } | null;
  return r ? { isPublic: r.is_public, isOfficial: r.is_official, pinnedMessageId: r.pinned_message_id } : null;
}

/** Épingler (ou désépingler avec null) un message : admin du groupe */
export async function pinGroupMessage(conversationId: string, messageId: string | null) {
  const { error } = await supabase.rpc('pin_group_message', { p_conv: conversationId, p_message: messageId });
  if (error) throw new Error(error.message);
}

/** Modération : un admin du groupe efface le message de quelqu'un d'autre */
export async function moderateGroupMessage(messageId: string) {
  const { error } = await supabase.rpc('moderate_group_message', { p_id: messageId });
  if (error) throw new Error(error.message);
}

// ---------- Carte « Rejoins le groupe de la commu » (onglet Messages) ----------
// « Plus tard » : re-proposée UNE fois au bout de 7 jours, puis plus jamais.
const CARD_KEY = 'moto.communityCard';
const AGAIN_AFTER_MS = 7 * 24 * 3600_000;

type CardState = { dismissedAt: number; count: number };

function readCard(): CardState | null {
  try {
    return JSON.parse(localStorage.getItem(CARD_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function cardVisible(now: number) {
  const s = readCard();
  if (!s) return true;
  return s.count < 2 && now - s.dismissedAt >= AGAIN_AFTER_MS;
}

/** Groupe officiel à proposer (null : rien à afficher) */
export function useCommunityCard() {
  const [group, setGroup] = useState<OfficialGroup | null>(null);
  const [visible, setVisible] = useState(() => cardVisible(Date.now()));

  const refresh = useCallback(() => {
    fetchOfficialGroup()
      .then(setGroup)
      .catch((e) => console.warn('Groupe communauté indisponible', e));
  }, []);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const later = () => {
    const s = readCard();
    try {
      localStorage.setItem(CARD_KEY, JSON.stringify({ dismissedAt: Date.now(), count: (s?.count ?? 0) + 1 }));
    } catch {
      // pas grave
    }
    setVisible(false);
  };

  return { group: visible && group && !group.joined ? group : null, later, refresh };
}
