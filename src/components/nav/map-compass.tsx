import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';

import { makeStyles, Type, useColors } from '@/constants/theme';

// Orientation de la carte (0 = nord en haut), envoyée par la page Leaflet : gardée ici et pas dans
// l'écran de la carte, pour que seule la boussole se redessine quand la carte tourne (en navigation,
// elle tourne en continu).
let current = 0;
const listeners = new Set<() => void>();

export function setMapBearing(value: number) {
  if (value === current) return;
  current = value;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getBearing = () => current;

/**
 * Boussole de la carte. Hors navigation : affichée seulement si la carte a été tournée, appui = nord
 * en haut. En navigation : toujours affichée, 1er appui = nord en haut, 2e = ma direction en haut.
 */
export function MapCompass({
  navigating,
  orientation,
  onPress,
  size = 52,
}: {
  navigating: boolean;
  orientation: 'heading' | 'north';
  onPress: () => void;
  size?: number;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const bearing = useSyncExternalStore(subscribe, getBearing);
  if (!navigating && Math.abs(((bearing + 540) % 360) - 180) < 2) return null;
  const north = navigating && orientation === 'north';
  return (
    <Pressable
      style={[styles.compass, { width: size, height: size, borderRadius: size / 2 }, north && styles.north]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={navigating ? (north ? 'Mettre ma direction en haut' : 'Mettre le nord en haut') : 'Remettre le nord en haut'}>
      <View style={{ transform: [{ rotate: `${bearing}deg` }], alignItems: 'center' }}>
        <MaterialCommunityIcons name="navigation" size={Math.round(size * 0.5)} color={Colors.danger} />
        <Text style={styles.n}>N</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  compass: {
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  north: { borderWidth: 2, borderColor: Colors.accent },
  n: { fontSize: Type.small, fontWeight: '900', color: Colors.text, marginTop: -4 },
}));
