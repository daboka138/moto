import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';
import { fetchPopularSpots, placeKindInfo, spotAsPlace, type CommunityPlace, type PlaceKind } from '@/lib/places';

/**
 * « Départs populaires » / « Spots proches » : 3-4 spots les mieux notés à moins de 20 km, en un
 * appui (pratique pour donner rendez-vous). Rien d'affiché s'il n'y en a pas.
 */
export function SpotSuggestions({
  title,
  center,
  kinds,
  selected,
  onPick,
}: {
  title: string;
  center: LatLng | null;
  kinds?: PlaceKind[];
  selected?: LatLng | null;
  onPick: (place: Place) => void;
}) {
  const styles = useStyles();
  const [spots, setSpots] = useState<CommunityPlace[]>([]);
  // Recharge seulement si le centre bouge de plus d'~1 km
  const key = center ? `${center.latitude.toFixed(2)},${center.longitude.toFixed(2)}` : null;
  const kindsKey = kinds?.join(',');

  useEffect(() => {
    if (!key) return;
    const [latitude, longitude] = key.split(',').map(Number);
    let cancelled = false;
    fetchPopularSpots({ latitude, longitude }, kindsKey ? { kinds: kindsKey.split(',') as PlaceKind[] } : {})
      .then((list) => !cancelled && setSpots(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, kindsKey]);

  if (!spots.length) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {spots.map((p) => (
          <Chip
            key={p.id}
            label={`${placeKindInfo(p.kind).emoji} ${p.name}${p.rating != null ? ` ★ ${p.rating.toFixed(1).replace('.', ',')}` : ''}`}
            selected={!!selected && selected.latitude === p.latitude && selected.longitude === p.longitude}
            onPress={() => onPick(spotAsPlace(p))}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  box: { gap: 6 },
  title: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  row: { gap: 8 },
}));
