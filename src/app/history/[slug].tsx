import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Flag } from '@/components/history/flag';
import { CreditedImage, HistoryBody, HistoryCard, NeutralCover, ReportHistoryError, Timeline } from '@/components/history/history-ui';
import { makeStyles, Type, useColors } from '@/constants/theme';
import { countryName, readingMinutes, useHistoryIndex } from '@/lib/history';

/** Fiche d'une marque : création, fondateurs, histoire, frise, modèles mythiques, anecdotes, aujourd'hui */
export default function HistoryBrandScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data, error } = useHistoryIndex();
  const brand = data?.brands.find((b) => b.slug === slug);

  if (!brand) {
    return (
      <View style={styles.center}>
        {data || error ? <Text style={styles.muted}>Fiche introuvable.</Text> : <ActivityIndicator color={Colors.accent} />}
      </View>
    );
  }

  const [cover, ...more] = brand.images;
  const minutes = readingMinutes(
    brand.body,
    brand.today,
    ...brand.timeline.map((t) => t.text),
    ...brand.models.map((m) => m.text),
    ...brand.anecdotes,
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: brand.name }} />
      {cover ? <CreditedImage image={cover} height={240} /> : <NeutralCover label={brand.name} />}

      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Flag country={brand.country} width={30} />
          <Text style={styles.title}>{brand.name}</Text>
        </View>
        {!!brand.tagline && <Text style={styles.tagline}>{brand.tagline}</Text>}
        <Text style={styles.meta}>
          {[brand.foundedYear ? `Créée en ${brand.foundedYear}` : null, brand.foundedPlace, countryName(brand.country)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {!!brand.founders && <Text style={styles.meta}>Fondateurs : {brand.founders}</Text>}
        <Text style={styles.reading}>⏱ {minutes} min de lecture</Text>
      </View>

      <HistoryBody body={brand.body} />

      {!!brand.timeline.length && (
        <HistoryCard title="Grandes étapes">
          <Timeline items={brand.timeline} />
        </HistoryCard>
      )}

      {!!brand.models.length && (
        <HistoryCard title="Modèles mythiques">
          {brand.models.map((m, i) => (
            <View key={i} style={styles.model}>
              <Text style={styles.modelName}>
                {m.name}
                {m.year ? <Text style={styles.modelYear}> · {m.year}</Text> : null}
              </Text>
              {!!m.text && <Text style={styles.modelText}>{m.text}</Text>}
            </View>
          ))}
        </HistoryCard>
      )}

      {more.map((img) => (
        <CreditedImage key={img.id} image={img} />
      ))}

      {!!brand.anecdotes.length && (
        <HistoryCard title="💡 Le saviez-vous ?">
          {brand.anecdotes.map((a, i) => (
            <Text key={i} style={styles.line}>
              • {a}
            </Text>
          ))}
        </HistoryCard>
      )}

      {!!brand.today && (
        <HistoryCard title="Aujourd’hui">
          <Text style={styles.line}>{brand.today}</Text>
        </HistoryCard>
      )}

      <ReportHistoryError subject={brand.name} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted },
  head: { gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: Type.title, fontWeight: '900', color: Colors.text },
  tagline: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  meta: { fontSize: Type.body, color: Colors.textMuted },
  reading: { fontSize: Type.small, color: Colors.textMuted, marginTop: 2 },
  model: { gap: 2 },
  modelName: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  modelYear: { fontWeight: '600', color: Colors.textMuted },
  modelText: { fontSize: Type.body, lineHeight: 21, color: Colors.text },
  line: { fontSize: Type.body, lineHeight: 22, color: Colors.text },
}));
