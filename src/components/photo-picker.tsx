import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { photoUrl, type PhotoValue } from '@/lib/profile';

type Props = {
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
  shape: 'round' | 'wide';
  label: string;
};

export function PhotoPicker({ value, onChange, shape, label }: Props) {
  const aspect: [number, number] = shape === 'round' ? [1, 1] : [4, 3];
  const uri = value.localUri ?? (value.path ? photoUrl(value.path) : null);

  const pick = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Appareil photo', "L'accès à l'appareil photo a été refusé.");
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.7,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    onChange({ path: value.path, localUri: asset.uri, mimeType: asset.mimeType ?? undefined });
  };

  const choose = () =>
    Alert.alert(label, undefined, [
      { text: 'Galerie', onPress: () => pick('library') },
      { text: 'Appareil photo', onPress: () => pick('camera') },
      { text: 'Annuler', style: 'cancel' },
    ]);

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
        <Ionicons name="pencil" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
