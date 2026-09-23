import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { pickImage } from '@/lib/pick-image';
import { photoUrl, type PhotoValue } from '@/lib/profile';

type Props = {
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
  shape: 'round' | 'wide';
  label: string;
};

export function PhotoPicker({ value, onChange, shape, label }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const uri = value.localUri ?? (value.path ? photoUrl(value.path) : null);

  const choose = async () => {
    const picked = await pickImage(label, shape === 'round' ? [1, 1] : [4, 3]);
    if (picked) onChange({ path: value.path, localUri: picked.uri, mimeType: picked.mimeType });
  };

  return (
    <Pressable onPress={choose} style={shape === 'round' ? styles.round : styles.wide}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="camera" size={28} color={Colors.textMuted} />
          <Text style={styles.placeholderText}>{label}</Text>
        </View>
      )}
      <View style={styles.badge}>
        <Ionicons name="pencil" size={14} color={Colors.white} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  round: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: Colors.border,
    alignSelf: 'center',
  },
  wide: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.border,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  placeholderText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  badge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
