import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { CreditedImage, HistoryBody, HistoryCard, NeutralCover, ReportHistoryError, Timeline } from '@/components/history/history-ui';
import { makeStyles, useColors } from '@/constants/theme';
import { bodyBlocks, readingMinutes, useHistoryIndex } from '@/lib/history';

/** Chapitre (ex. « Les débuts du deux-roues ») : texte, images intercalées entre les parties, frise */
export default function HistoryChapterScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error } = useHistoryIndex();
  const chapter = data?.chapters.find((c) => c.slug === slug);

  if (!chapter) {
    return (
      <View style={styles.center}>
        {data || error ? <Text style={styles.muted}>Chapitre introuvable.</Text> : <ActivityIndicator color={Colors.accent} />}
      </View>
    );
  }

  // Texte découpé à chaque intertitre ; les images suivantes (dans l'ordre) s'intercalent entre les parties
  const parts: string[] = [];
  for (const b of bodyBlocks(chapter.body)) {
    if (b.kind === 'title' || !parts.length) parts.push('');
    parts[parts.length - 1] += `${b.kind === 'title' ? '## ' : ''}${b.text}\n\n`;
  }
  const [cover, ...more] = chapter.images;
  // Image i placée après la partie i+1 (la 1re partie suit déjà l'image de couverture)
  const placed = Math.min(more.length, Math.max(0, parts.length - 1));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: chapter.title }} />
      {cover ? <CreditedImage image={cover} height={240} /> : <NeutralCover label={chapter.title} />}
      <View style={styles.head}>
        <Text style={styles.title}>{chapter.title}</Text>
        {!!chapter.subtitle && <Text style={styles.subtitle}>{chapter.subtitle}</Text>}
        <Text style={styles.reading}>⏱ {readingMinutes(chapter.body)} min de lecture</Text>
      </View>
      {parts.map((p, i) => (
        <View key={i} style={styles.part}>
          <HistoryBody body={p} />
          {i >= 1 && i <= placed && <CreditedImage image={more[i - 1]} />}
        </View>
      ))}
      {more.slice(placed).map((img) => (
        <CreditedImage key={img.id} image={img} />
      ))}
      {!!chapter.timeline.length && (
        <HistoryCard title="En résumé">
          <Timeline items={chapter.timeline} />
        </HistoryCard>
      )}
      <ReportHistoryError subject={chapter.title} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted },
  head: { gap: 4 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.text },
  subtitle: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  reading: { fontSize: 13, color: Colors.textMuted },
  part: { gap: 16 },
}));
