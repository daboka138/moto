import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Stars } from '@/components/community-cards';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { pickImage } from '@/lib/pick-image';
import { photoUrl, type PhotoValue } from '@/lib/profile';
import { ROAD_CRITERIA, type RoadCriteria } from '@/lib/road-rules';

/** Note d'une route : une ligne d'étoiles par critère (virages, revêtement, paysage, trafic) */
export function CriteriaInput({ value, onChange }: { value: Partial<RoadCriteria>; onChange: (v: Partial<RoadCriteria>) => void }) {
  const styles = useStyles();
  return (
    <View style={{ gap: 12 }}>
      {ROAD_CRITERIA.map((c) => (
        <View key={c.key} style={{ gap: 4 }}>
          <View style={styles.row}>
            <Text style={styles.label}>{c.label}</Text>
            <Stars value={value[c.key] ?? 0} size={26} onChange={(n) => onChange({ ...value, [c.key]: n })} />
          </View>
          <Text style={styles.hint}>{c.hint}</Text>
        </View>
      ))}
    </View>
  );
}

/** Moyennes par critère (fiche d'une route) ou notes d'un avis (compact) */
export function CriteriaBars({ value, compact }: { value: RoadCriteria; compact?: boolean }) {
  const styles = useStyles();
  if (compact) {
    return (
      <Text style={styles.compact}>
        {ROAD_CRITERIA.map((c) => `${c.label} ${value[c.key]}`).join(' · ')}
      </Text>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {ROAD_CRITERIA.map((c) => (
        <View key={c.key} style={styles.row}>
          <Text style={styles.barLabel}>{c.label}</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${(value[c.key] / 5) * 100}%` }]} />
          </View>
          <Text style={styles.barValue}>{value[c.key].toFixed(1).replace('.', ',')}</Text>
        </View>
      ))}
    </View>
  );
}

/** Jusqu'à max photos (avis d'une route, photos d'un événement) : vignettes + « Ajouter » */
export function PhotosInput({ value, onChange, max = 4 }: { value: PhotoValue[]; onChange: (v: PhotoValue[]) => void; max?: number }) {
  const Colors = useColors();
  const styles = useStyles();
  const add = async () => {
    const picked = await pickImage('Ajouter une photo', [4, 3]);
    if (picked) onChange([...value, { path: null, localUri: picked.uri, mimeType: picked.mimeType }]);
  };
  return (
    <View style={styles.photos}>
      {value.map((p, i) => (
        <View key={(p.localUri ?? p.path ?? '') + i} style={styles.thumb}>
          <Image source={{ uri: p.localUri ?? photoUrl(p.path ?? '') }} style={styles.thumbImage} contentFit="cover" />
          <Pressable
            style={styles.remove}
            onPress={() => onChange(value.filter((_, j) => j !== i))}
            hitSlop={8}
            accessibilityLabel="Retirer la photo">
            <Ionicons name="close" size={14} color={Colors.white} />
          </Pressable>
        </View>
      ))}
      {value.length < max && (
        <Pressable style={[styles.thumb, styles.addThumb]} onPress={add} accessibilityLabel="Ajouter une photo">
          <Ionicons name="camera-outline" size={24} color={Colors.accent} />
          <Text style={styles.addText}>Photo</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  hint: { fontSize: Type.small, color: Colors.textMuted },
  compact: { fontSize: Type.small, color: Colors.textMuted },
  barLabel: { width: 92, fontSize: Type.small, fontWeight: '700', color: Colors.text },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  barValue: { width: 28, fontSize: Type.small, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.border },
  thumbImage: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay,
  },
  addThumb: { alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: Colors.accent, borderStyle: 'dashed', backgroundColor: Colors.surface },
  addText: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
}));
