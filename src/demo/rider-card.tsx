import { router } from 'expo-router';

import { motoLabel, PersonCard } from '@/components/person-card';
import { distanceM, type LatLng } from '@/demo/geo';
import { isSpeeding, type DemoRiderState } from '@/demo/simulation';

type Props = {
  state: DemoRiderState;
  userPosition: LatLng | null;
  badge?: string;
  onClose: () => void;
};

export function RiderCard({ state, userPosition, badge, onClose }: Props) {
  const { rider, speedKmh, position } = state;
  return (
    <PersonCard
      photoUrl={rider.avatar_path}
      username={rider.username}
      motoLabel={motoLabel(rider.motorcycles[0])}
      speedKmh={speedKmh}
      speeding={isSpeeding(speedKmh)}
      distanceM={userPosition ? distanceM(userPosition, position) : null}
      badge={badge}
      onViewProfile={() => router.push({ pathname: '/demo-rider/[id]', params: { id: rider.id } })}
      onClose={onClose}
    />
  );
}
