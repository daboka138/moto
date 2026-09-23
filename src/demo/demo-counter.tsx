import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoutingStats } from '@/demo/simulation';

type Props = {
  /** Faux motards que j'ai le droit de voir */
  visible: number;
  /** Faux motards simulés au total */
  total: number;
  /** Pastilles démo réellement affichées dans la carte (null tant que la carte n'a rien confirmé) */
  rendered: number | null;
  routing: RoutingStats;
  rideTitle: string;
  rideActive: boolean;
  onToggleRide: () => void;
};

/** Badge de la démo en haut de la carte : compteur et trajet de groupe simulé. */
export function DemoCounter({ visible, total, rendered, routing, rideTitle, rideActive, onToggleRide }: Props) {
  const details: string[] = [];
  if (total > visible) details.push(`${total - visible} masqués`);
  if (routing.fallback) details.push(`${routing.fallback} tracés de secours`);
  if (rendered !== null && rendered !== visible) details.push(`carte : ${rendered} affichés`);

  return (
    <View style={styles.badge}>
      <Text style={styles.title}>{total === 0 ? 'Démo : chargement…' : `Démo : ${visible} motards`}</Text>
      {details.length > 0 && <Text style={styles.details}>{details.join(' · ')}</Text>}
      <Pressable onPress={onToggleRide} style={[styles.ride, rideActive && styles.rideOn]} hitSlop={6}>
        <Text style={styles.rideText} numberOfLines={1}>
          {rideActive ? `${rideTitle} · Terminer` : 'Relancer le trajet de groupe'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'flex-end',
    gap: 2,
    maxWidth: 220,
  },
  title: { color: '#fff', fontSize: 14, fontWeight: '700' },
  details: { color: '#ccc', fontSize: 11 },
  ride: { marginTop: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#52525B' },
  rideOn: { backgroundColor: '#16A34A' },
  rideText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
