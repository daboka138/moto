import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export type PickedImage = { uri: string; mimeType?: string };

/** Demande « Galerie ou Appareil photo ? » puis ouvre le sélecteur. Renvoie null si annulé. */
export function pickImage(title: string, aspect?: [number, number]): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      undefined,
      [
        { text: 'Galerie', onPress: () => launch('library', aspect).then(resolve) },
        { text: 'Appareil photo', onPress: () => launch('camera', aspect).then(resolve) },
        { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function launch(source: 'camera' | 'library', aspect?: [number, number]): Promise<PickedImage | null> {
  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Appareil photo', "L'accès à l'appareil photo a été refusé.");
      return null;
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7,
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? undefined };
}
