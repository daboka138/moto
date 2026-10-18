import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, Type } from '@/constants/theme';
import { ABOUT_TEXT, removeCreatorPhoto, saveCreatorPhoto, useCreatorPhotoUrl } from '@/lib/about';
import { errorMessage } from '@/lib/errors';
import { pickImage } from '@/lib/pick-image';

const LOGO = require('../../../assets/images/icon.png');

/** Console › À propos : la photo de la page « Qui est derrière l'appli » (sinon le logo) */
export function AboutAdmin({ userId }: { userId: string }) {
  const styles = useStyles();
  const current = useCreatorPhotoUrl();
  const [preview, setPreview] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const shown = preview === undefined ? current : preview;

  const choose = async () => {
    const picked = await pickImage('Ta photo', [1, 1]);
    if (!picked) return;
    setBusy(true);
    try {
      // pickImage fait déjà la copie en mémoire (web) et la réduction
      await saveCreatorPhoto(userId, picked.uri, picked.mimeType);
      setPreview(picked.uri);
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeCreatorPhoto();
      setPreview(null);
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Page « Qui est derrière l’appli »</Text>
      <Text style={styles.muted}>Profil › À propos dans l’app, et passeryder.fr/createur. Sans photo : le logo.</Text>
      <Image source={shown ? { uri: shown } : LOGO} style={styles.photo} contentFit="cover" />
      <Button title={shown ? 'Changer ma photo' : 'Ajouter ma photo'} icon="camera-outline" loading={busy} onPress={choose} />
      {!!shown && <Button title="Remettre le logo" variant="secondary" onPress={remove} disabled={busy} />}
      <Text style={styles.muted}>Texte affiché :</Text>
      {ABOUT_TEXT.map((p) => (
        <Text key={p} style={styles.text}>
          {p}
        </Text>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 12 },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  muted: { fontSize: Type.small, color: Colors.textMuted },
  photo: { width: 128, height: 128, borderRadius: 64, alignSelf: 'center', backgroundColor: Colors.border },
  text: { fontSize: Type.body, color: Colors.text },
}));
