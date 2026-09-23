import { StyleSheet, Text, View } from 'react-native';

import type { RoutingStats } from '@/demo/simulation';

type Props = {
  /** Motards produits par la simulation */
  count: number;
  /** Pastilles réellement affichées dans la carte (null tant que la carte n'a rien confirmé) */
  rendered: number | null;
  routing: RoutingStats;
};

/** Petit badge de diagnostic en haut de la carte. */
export function DemoCounter({ count, rendered, routing }: Props) {
  const details: string[] = [];
  if (routing.osrm || routing.fallback) {
    details.push(routing.fallback ? `${routing.osrm} routes · ${routing.fallback} de secours` : `${routing.osrm} routes`);
  }
  if (rendered !== null && rendered !== count) details.push(`carte : ${rendered} affichés`);

  return (
    <View style={styles.badge}>
      <Text style={styles.title}>{count === 0 ? 'Démo : chargement…' : `Démo : ${count} motards`}</Text>
      {details.length > 0 && <Text style={styles.details}>{details.join(' · ')}</Text>}
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
  },
  title: { color: '#fff', fontSize: 14, fontWeight: '700' },
  details: { color: '#ccc', fontSize: 11 },
});
