import type { DemoRider } from '@/demo/riders';

// Relations et confidentialité des faux motards, pour tester les règles de visibilité.
// Mêmes règles que can_view_location() côté Supabase, rejouées ici en local
// (les faux motards n'existent pas dans la base).

export type DemoRelation = 'friend' | 'incoming' | 'none';
export type DemoPrivacy = 'everyone' | 'friends' | 'ghost';

type Social = { relation: DemoRelation; privacy: DemoPrivacy; inRideWithMe?: boolean };

export const DEMO_RIDE_TITLE = 'Sortie Route des Crêtes';
/** Balade de démo en cours avec le groupe A (voir demo/rides.ts) */
export const DEMO_LIVE_RIDE_ID = 'demo-ride-1';

const SOCIAL: Record<string, Social> = {
  lucas_mt07: { relation: 'friend', privacy: 'friends' },
  'sarah.gs': { relation: 'none', privacy: 'everyone' },
  karim_z900: { relation: 'none', privacy: 'ghost' },
  tom_r1: { relation: 'none', privacy: 'friends' }, // pas ami → invisible
  nico_s1000rr: { relation: 'none', privacy: 'everyone' },
  // Groupe A = trajet de groupe en cours avec moi
  julie_cb650r: { relation: 'friend', privacy: 'ghost', inRideWithMe: true }, // fantôme mais visible pendant le trajet
  antoine_monster: { relation: 'friend', privacy: 'friends', inRideWithMe: true },
  emi_interceptor: { relation: 'none', privacy: 'everyone', inRideWithMe: true },
  max_sportster: { relation: 'friend', privacy: 'friends', inRideWithMe: true },
  yanis_duke: { relation: 'friend', privacy: 'friends' },
  cam_street765: { relation: 'none', privacy: 'everyone' },
  hugo_gsxs: { relation: 'incoming', privacy: 'friends' }, // visible une fois la demande acceptée
  lea_tenere: { relation: 'friend', privacy: 'ghost' }, // amie mais fantôme → invisible
  mehdi_africa: { relation: 'none', privacy: 'friends' },
  chloe_zx6r: { relation: 'incoming', privacy: 'everyone' },
  ines_kisbee: { relation: 'none', privacy: 'everyone' },
  noah_mt125: { relation: 'friend', privacy: 'friends' },
  zoe_cb125r: { relation: 'none', privacy: 'everyone' },
};

export function demoSocial(rider: DemoRider): Social {
  return SOCIAL[rider.username] ?? { relation: 'none', privacy: 'friends' };
}

export type DemoSocialState = {
  friendIds: string[];
  incomingIds: string[];
  joinedRideIds: string[];
  rideActive: boolean;
};

/** Même logique que can_view_location() : puis-je voir ce faux motard ? */
export function canSeeDemoRider(rider: DemoRider, state: DemoSocialState): boolean {
  const social = demoSocial(rider);
  // Règle prioritaire : balade en cours à laquelle nous participons tous les deux
  if (state.rideActive && social.inRideWithMe && state.joinedRideIds.includes(DEMO_LIVE_RIDE_ID)) return true;
  if (social.privacy === 'ghost') return false;
  if (social.privacy === 'everyone') return true;
  return state.friendIds.includes(rider.id);
}

export function demoPrivacyLabel(privacy: DemoPrivacy) {
  return privacy === 'everyone' ? 'Visible par tous' : privacy === 'friends' ? 'Amis uniquement' : 'Fantôme';
}
