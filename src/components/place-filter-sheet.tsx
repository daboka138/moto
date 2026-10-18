import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Switch, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useMapLayers } from '@/lib/map-layers';
import { PLACE_KINDS } from '@/lib/places';

/** Filtres de la carte : dates des balades, parkings moto OSM, spots (tout / par catégorie), mémorisés. */
export function PlaceFilterSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const layers = useMapLayers();
  const hidden = layers.hiddenPlaceKinds;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Filtres de la carte</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Toutes les dates</Text>
              <Text style={styles.sub}>
                Balades et événements à venir. Sinon : les 7 prochains jours (et ceux où tu es inscrit)
              </Text>
            </View>
            <Switch
              value={layers.allDates}
              onValueChange={layers.setAllDates}
              trackColor={{ true: Colors.accent, false: Colors.border }}
              thumbColor={Colors.white}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Parkings moto</Text>
              <Text style={styles.sub}>Parkings OpenStreetMap, visibles en zoomant</Text>
            </View>
            <Switch
              value={layers.showParkings}
              onValueChange={layers.setShowParkings}
              trackColor={{ true: Colors.accent, false: Colors.border }}
              thumbColor={Colors.white}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Afficher les spots</Text>
            <Switch
              value={layers.showPlaces}
              onValueChange={layers.setShowPlaces}
              trackColor={{ true: Colors.accent, false: Colors.border }}
              thumbColor={Colors.white}
            />
          </View>
          {layers.showPlaces && (
            <>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.label}>Tous les spots</Text>
                  <Text style={styles.sub}>Sinon : les spots notés ★ 4 et plus (et les tiens)</Text>
                </View>
                <Switch
                  value={layers.allSpots}
                  onValueChange={layers.setAllSpots}
                  trackColor={{ true: Colors.accent, false: Colors.border }}
                  thumbColor={Colors.white}
                />
              </View>
              <Text style={styles.hint}>Catégories affichées</Text>
              <View style={styles.chips}>
                {PLACE_KINDS.map((k) => (
                  <Chip
                    key={k.value}
                    label={`${k.emoji} ${k.label}`}
                    selected={!hidden.includes(k.value)}
                    onPress={() =>
                      layers.setHiddenPlaceKinds(hidden.includes(k.value) ? hidden.filter((x) => x !== k.value) : [...hidden, k.value])
                    }
                  />
                ))}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: 16, gap: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  flex: { flex: 1 },
  sub: { fontSize: Type.small, color: Colors.textMuted },
  hint: { fontSize: Type.small, fontWeight: '700', color: Colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
