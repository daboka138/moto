import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { FicheRow, openFiche, SupportButton } from '@/components/guide/guide-ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { FAQ, ficheById, fichesOfTheme, searchGuide, THEMES, type Question } from '@/guide/contenu';
import { IS_WEB } from '@/lib/app-link';
import { useDrivingLock } from '@/lib/driving-lock';

/** Aide : recherche, fiches par thème, FAQ et support. Contenu : src/guide/contenu.ts */
export default function HelpScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;
  const results = searching ? searchGuide(query) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={locked ? 'Désactivé en roulant' : 'Rechercher : convoi, SOS, GPX…'}
          placeholderTextColor={Colors.textMuted}
          editable={!locked}
          autoCorrect={false}
          returnKeyType="search"
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer">
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {results ? (
        <>
          {results.fiches.length > 0 && (
            <View style={styles.card}>
              {results.fiches.map((f, i) => (
                <FicheRow key={f.id} fiche={f} first={i === 0} />
              ))}
            </View>
          )}
          {results.faq.length > 0 && (
            <>
              <Text style={styles.section}>Questions fréquentes</Text>
              {results.faq.map((q) => (
                <FaqItem key={q.id} question={q} initiallyOpen />
              ))}
            </>
          )}
          {!results.fiches.length && !results.faq.length && (
            <Text style={styles.empty}>Rien trouvé pour « {query.trim()} ». Essaie un autre mot, ou écris-nous.</Text>
          )}
        </>
      ) : (
        <>
          {IS_WEB && (
            <Text style={styles.webNote}>
              📱 Les fiches marquées « App Android » concernent des fonctions réservées à l’app Android (GPS en direct,
              navigation, sécurité).
            </Text>
          )}
          {THEMES.map((t) => (
            <View key={t.id} style={styles.theme}>
              <Text style={styles.section}>
                {t.emoji} {t.titre}
              </Text>
              <View style={styles.card}>
                {fichesOfTheme(t.id).map((f, i) => (
                  <FicheRow key={f.id} fiche={f} first={i === 0} />
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.section}>Questions fréquentes</Text>
          {FAQ.map((q) => (
            <FaqItem key={q.id} question={q} />
          ))}

          <Pressable style={styles.replay} onPress={() => router.push({ pathname: '/welcome', params: { replay: '1' } })}>
            <Ionicons name="play-circle-outline" size={20} color={Colors.accent} />
            <Text style={styles.replayText}>Revoir la présentation</Text>
          </Pressable>
        </>
      )}

      <SupportButton />
    </ScrollView>
  );
}

function FaqItem({ question, initiallyOpen }: { question: Question; initiallyOpen?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={styles.card}>
      <Pressable style={styles.faqHead} onPress={() => setOpen(!open)} accessibilityState={{ expanded: open }}>
        <Text style={styles.faqQ}>{question.q}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </Pressable>
      {open && (
        <View style={styles.faqBody}>
          {question.r.map((line, i) => (
            <Text key={i} style={styles.faqLine}>
              • {line}
            </Text>
          ))}
          {question.fiches?.map((id) => {
            const fiche = ficheById(id);
            if (!fiche) return null;
            return (
              <Pressable key={id} onPress={() => openFiche(id)}>
                <Text style={styles.faqLink}>
                  {fiche.emoji} {fiche.titre} ›
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: Type.body, paddingVertical: 12, color: Colors.text },
  section: {
    fontSize: Type.small,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
    marginLeft: 4,
  },
  theme: { gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, paddingHorizontal: 16 },
  empty: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', padding: 24 },
  webNote: { fontSize: Type.body, color: Colors.text, backgroundColor: Colors.accentSoft, borderRadius: Radius.md, padding: 12 },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  faqQ: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  faqBody: { gap: 8, paddingBottom: 16 },
  faqLine: { fontSize: Type.body, lineHeight: 21, color: Colors.text },
  faqLink: { fontSize: Type.body, fontWeight: '700', color: Colors.accent, marginTop: 4 },
  replay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  replayText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
}));
