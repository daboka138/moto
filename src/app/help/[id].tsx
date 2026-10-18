import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { AndroidOnlyNote, FicheRow, SupportButton } from '@/components/guide/guide-ui';
import { makeStyles, Radius, Type } from '@/constants/theme';
import { ficheById, fichesOfTheme, themeInfo } from '@/guide/contenu';

/** Une fiche du guide : à quoi ça sert, comment faire, astuces, limites */
export default function HelpFicheScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fiche = ficheById(id);

  if (!fiche) {
    return (
      <View style={styles.screen}>
        <Text style={styles.empty}>Fiche introuvable.</Text>
      </View>
    );
  }

  const theme = themeInfo(fiche.theme);
  const others = fichesOfTheme(fiche.theme).filter((f) => f.id !== fiche.id);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: fiche.titre }} />
      <View style={styles.head}>
        <Text style={styles.emoji}>{fiche.emoji}</Text>
        <Text style={styles.theme}>
          {theme.emoji} {theme.titre}
        </Text>
        <Text style={styles.title}>{fiche.titre}</Text>
        <Text style={styles.but}>{fiche.but}</Text>
      </View>

      <AndroidOnlyNote fiche={fiche} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Comment faire</Text>
        {fiche.etapes.map((step, i) => (
          <View key={i} style={styles.step}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {!!fiche.astuces?.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Astuces</Text>
          {fiche.astuces.map((line, i) => (
            <Text key={i} style={styles.line}>
              • {line}
            </Text>
          ))}
        </View>
      )}

      {!!fiche.limites?.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>À savoir</Text>
          {fiche.limites.map((line, i) => (
            <Text key={i} style={styles.line}>
              • {line}
            </Text>
          ))}
        </View>
      )}

      {others.length > 0 && (
        <>
          <Text style={styles.section}>Aussi dans {theme.titre}</Text>
          <View style={styles.list}>
            {others.map((f, i) => (
              <FicheRow key={f.id} fiche={f} first={i === 0} />
            ))}
          </View>
        </>
      )}

      <SupportButton />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  empty: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', padding: 32 },
  head: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  emoji: { fontSize: 44 },
  theme: { fontSize: Type.small, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  but: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 12 },
  cardTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent,
    color: Colors.white,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 26,
    overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: Type.body, lineHeight: 22, color: Colors.text },
  line: { fontSize: Type.body, lineHeight: 22, color: Colors.text },
  section: {
    fontSize: Type.small,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    marginLeft: 4,
  },
  list: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 16 },
}));
