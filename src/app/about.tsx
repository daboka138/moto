import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, Radius, Type } from '@/constants/theme';
import { ABOUT_NAME, ABOUT_ROLE, ABOUT_TEXT, useCreatorPhotoUrl } from '@/lib/about';
import { useCreatorId } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { openDirectConversation } from '@/lib/messages';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

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
      <DataCredits />
    </ScrollView>
  );
}

const ONISR_URL =
  'https://www.data.gouv.fr/fr/datasets/bases-de-donnees-annuelles-des-accidents-corporels-de-la-circulation-routiere-annees-de-2005-a-2024/';

/** Sources des données affichées dans l'appli (licences) */
function DataCredits() {
  const styles = useStyles();
  const [years, setYears] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from('danger_zone_imports')
      .select('years')
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setYears((data as { years: string } | null)?.years ?? null));
  }, []);
  return (
    <View style={styles.credits}>
      <Text style={styles.creditsTitle}>Sources des données</Text>
      <Text style={styles.creditsText}>
        Zones de danger : bases des accidents corporels de la circulation routière{years ? ` (${years})` : ''}, ONISR /
        ministère de l’Intérieur, data.gouv.fr — Licence Ouverte Etalab 2.0. Regroupées en points noirs par PasseRyder.
      </Text>
      <Text style={styles.link} onPress={() => Linking.openURL(ONISR_URL)}>
        Voir le jeu de données
      </Text>
      <Text style={styles.creditsText}>
        Cartes, routes, feux tricolores, parkings moto et limitations de vitesse : © contributeurs OpenStreetMap (ODbL),
        fonds de carte MapTiler. Itinéraires : OSRM et Valhalla (FOSSGIS). Météo : Open-Meteo.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  credits: { gap: 6, marginTop: 8 },
  creditsTitle: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  creditsText: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 18 },
  link: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  content: { padding: 24, gap: 16, alignItems: 'stretch', maxWidth: 560, width: '100%', alignSelf: 'center' },
  photo: { width: 128, height: 128, borderRadius: 64, alignSelf: 'center', backgroundColor: Colors.border },
  name: { fontSize: Type.title, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  role: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: -8 },
  text: { gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16 },
  paragraph: { fontSize: Type.large, lineHeight: 26, color: Colors.text },
}));
