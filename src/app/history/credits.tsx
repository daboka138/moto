import { Linking, Pressable, ScrollView, Text } from 'react-native';

import { makeStyles } from '@/constants/theme';
import { useHistoryIndex } from '@/lib/history';

/** Crédits de toutes les images de « Histoire de la moto » (licences libres) */
export default function HistoryCreditsScreen() {
  const styles = useStyles();
  const { data } = useHistoryIndex();
  const owners = new Map<string, string>();
  data?.brands.forEach((b) => owners.set(b.id, b.name));
  data?.chapters.forEach((c) => owners.set(c.id, c.title));
  const images = [...(data?.chapters.flatMap((c) => c.images) ?? []), ...(data?.brands.flatMap((b) => b.images) ?? [])];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Images issues de Wikimedia Commons, sous licence libre (domaine public, CC0, CC BY ou CC BY-SA), réduites et
        converties pour l’app. Aucun logo de marque. Touche une ligne pour voir la source.
      </Text>
      {images.map((i) => (
        <Pressable key={i.id} style={styles.row} onPress={() => i.sourceUrl && Linking.openURL(i.sourceUrl)} disabled={!i.sourceUrl}>
          <Text style={styles.owner}>{owners.get(i.brandId ?? i.chapterId ?? '') ?? ''}</Text>
          {!!i.caption && <Text style={styles.caption}>{i.caption}</Text>}
          <Text style={styles.small}>
            {i.author} · {i.license}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  intro: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  row: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, gap: 2 },
  owner: { fontSize: 12, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase' },
  caption: { fontSize: 14, color: Colors.text },
  small: { fontSize: 12, color: Colors.textMuted },
}));
