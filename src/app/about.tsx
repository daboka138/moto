import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, Radius, Type } from '@/constants/theme';
import { ABOUT_NAME, ABOUT_ROLE, ABOUT_TEXT, useCreatorPhotoUrl } from '@/lib/about';
import { useCreatorId } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { openDirectConversation } from '@/lib/messages';
import { useSession } from '@/lib/session';

const LOGO = require('../../assets/images/icon.png');
const SITE_URL = 'https://passeryder.fr/createur';

/** Profil › À propos : qui est derrière l'appli, et « M'écrire » (conversation avec @admin) */
export default function AboutScreen() {
  const styles = useStyles();
  const { session } = useSession();
  const photo = useCreatorPhotoUrl();
  const creatorId = useCreatorId();
  const [opening, setOpening] = useState(false);
  const isMe = !!creatorId && creatorId === session?.user.id;

  const write = async () => {
    if (!creatorId) return Alert.alert('Oups', 'Pas de réseau pour l’instant. Réessaie dans 2 min.');
    setOpening(true);
    try {
      const id = await openDirectConversation(creatorId);
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Image source={photo ? { uri: photo } : LOGO} style={styles.photo} contentFit="cover" transition={150} />
      <Text style={styles.name}>{ABOUT_NAME}</Text>
      <Text style={styles.role}>{ABOUT_ROLE}</Text>
      <View style={styles.text}>
        {ABOUT_TEXT.map((p) => (
          <Text key={p} style={styles.paragraph}>
            {p}
          </Text>
        ))}
      </View>
      {!isMe && <Button title="M’écrire" icon="chatbubble-ellipses-outline" loading={opening} onPress={write} />}
      <Button title="Le site passeryder.fr" icon="globe-outline" variant="secondary" onPress={() => Linking.openURL(SITE_URL)} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  content: { padding: 24, gap: 16, alignItems: 'stretch', maxWidth: 560, width: '100%', alignSelf: 'center' },
  photo: { width: 128, height: 128, borderRadius: 64, alignSelf: 'center', backgroundColor: Colors.border },
  name: { fontSize: Type.title, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  role: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: -8 },
  text: { gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16 },
  paragraph: { fontSize: Type.large, lineHeight: 26, color: Colors.text },
}));
