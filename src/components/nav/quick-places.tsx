import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { makeStyles, useColors } from '@/constants/theme';
import {
  FAVORITE_LABELS,
  removeFavorite,
  samePlace,
  setFavorite,
  sortFavorites,
  useFavorites,
  type Favorite,
  type FavoriteKind,
} from '@/lib/favorites';
import type { LatLng } from '@/lib/geo';
import { pickPlace } from '@/lib/place-picker';
import { readHistory, type SearchResult } from '@/lib/search';

const RECENTS = 3;

const ICONS: Record<FavoriteKind, keyof typeof Ionicons.glyphMap> = { home: 'home', work: 'briefcase', custom: 'star' };

/** Raccourcis sous la recherche : Maison, Travail, favoris perso, puis destinations récentes. */
export function QuickPlaces({ near, onSelect }: { near: LatLng | null; onSelect: (r: SearchResult) => void }) {
  const styles = useStyles();
  const favorites = sortFavorites(useFavorites());
  // Lu à l'affichage (les raccourcis disparaissent pendant un trajet, puis reviennent à jour)
  const [history] = useState(readHistory);
  const recents = history
    .filter((h) => !favorites.some((f) => samePlace(f, h)))
    .slice(0, RECENTS);

  const define = async (kind: Exclude<FavoriteKind, 'custom'>) => {
    const place = await pickPlace({ title: `Adresse : ${FAVORITE_LABELS[kind]}`, initial: near });
    if (place) setFavorite({ ...place, source: 'lieu' }, kind);
  };

  const menu = (f: Favorite) =>
    showActionSheet({
      title: f.kind === 'custom' ? f.label : `${FAVORITE_LABELS[f.kind]} · ${f.label}`,
      options: [
        ...(f.kind !== 'custom' ? [{ label: 'Changer l’adresse', onPress: () => define(f.kind as 'home' | 'work') }] : []),
        { label: 'Retirer des favoris', destructive: true, onPress: () => removeFavorite(f.id) },
      ],
    });

  const fixed = (['home', 'work'] as const).map((kind) => {
    const f = favorites.find((x) => x.kind === kind);
    return f ? (
      <Chip key={kind} icon={ICONS[kind]} label={FAVORITE_LABELS[kind]} onPress={() => onSelect(f)} onLongPress={() => menu(f)} />
    ) : (
      <Chip key={kind} icon={ICONS[kind]} label={`Ajouter ${FAVORITE_LABELS[kind]}`} muted onPress={() => define(kind)} />
    );
  });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {fixed}
      {favorites
        .filter((f) => f.kind === 'custom')
        .map((f) => (
          <Chip key={f.id} icon="star" label={f.label} onPress={() => onSelect(f)} onLongPress={() => menu(f)} />
        ))}
      {recents.map((r) => (
        <Chip key={`r${r.latitude},${r.longitude}`} icon="time-outline" label={r.label} onPress={() => onSelect(r)} />
      ))}
    </ScrollView>
  );
}

function Chip({
  icon,
  label,
  muted,
  onPress,
  onLongPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  muted?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}>
      <Ionicons name={icon} size={18} color={muted ? Colors.textMuted : icon === 'star' ? Colors.warning : Colors.accent} />
      <Text style={[styles.label, muted && styles.muted]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  label: { fontSize: 15, fontWeight: '700', color: Colors.text, flexShrink: 1 },
  muted: { color: Colors.textMuted },
}));
