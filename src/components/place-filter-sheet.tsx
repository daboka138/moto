import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Switch, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { useMapLayers } from '@/lib/map-layers';
import { PLACE_KINDS } from '@/lib/places';

/** Filtres de la carte : spots (tout / par catégorie), mémorisés. */
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
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
