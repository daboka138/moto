import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { Flag } from '@/components/history/flag';
import { NeutralCover } from '@/components/history/history-ui';
import { Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { countryName, readingMinutes, useHistoryIndex, type HistoryBrand } from '@/lib/history';

type Sort = 'popular' | 'alpha' | 'country' | 'year';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'popular', label: 'Les plus connues' },
  { value: 'alpha', label: 'A → Z' },
  { value: 'country', label: 'Par pays' },
  { value: 'year', label: 'Par date de création' },
];

/** Sans majuscules ni accents, pour la recherche */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function sortBrands(list: HistoryBrand[], sort: Sort) {
  const byName = (a: HistoryBrand, b: HistoryBrand) => a.name.localeCompare(b.name, 'fr');
  const copy = [...list];
  switch (sort) {
    case 'alpha':
      return copy.sort(byName);
    case 'country':
      return copy.sort((a, b) => countryName(a.country).localeCompare(countryName(b.country), 'fr') || byName(a, b));
    case 'year':
      return copy.sort((a, b) => (a.foundedYear ?? 9999) - (b.foundedYear ?? 9999) || byName(a, b));
    default:
      return copy.sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
  }
}

/** Accueil « Histoire de la moto » : chapitres puis fiches des marques (app : depuis le Mur ; web : onglet) */
export function HistoryHome() {
  const Colors = useColors();
  const styles = useStyles();
  const { data, error, reload } = useHistoryIndex();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('popular');

  const brands = useMemo(() => {
    if (!data) return [];
    const q = fold(query.trim());
    const found = q
      ? data.brands.filter((b) => fold(`${b.name} ${countryName(b.country)} ${b.founders ?? ''} ${b.foundedPlace ?? ''}`).includes(q))
      : data.brands;
    return sortBrands(found, sort);
  }, [data, query, sort]);

  if (!data) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.muted}>Chargement impossible. Vérifie ta connexion.</Text>
            <Pressable onPress={reload}>
              <Text style={styles.link}>Réessayer</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator color={Colors.accent} />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} colors={[Colors.accent]} />}>
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>📜</Text>
        <Text style={styles.heroTitle}>Histoire de la moto</Text>
        <Text style={styles.heroText}>Des premiers deux-roues aux grandes marques : la culture moto, racontée simplement.</Text>
      </View>

      {data.chapters.map((c) => (
        <Pressable
          key={c.id}
          style={({ pressed }) => [styles.chapter, c.hidden && styles.hidden, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: '/history/chapitre/[slug]', params: { slug: c.slug } })}>
          {c.images[0] ? (
            <Image source={{ uri: c.images[0].url }} style={styles.chapterImage} contentFit="cover" />
          ) : (
            <NeutralCover label={c.title} height={140} />
          )}
          <View style={styles.chapterBody}>
            <Text style={styles.kicker}>Chapitre · {readingMinutes(c.body)} min de lecture</Text>
            <Text style={styles.chapterTitle}>
              {c.title}
              {c.hidden ? ' (masqué)' : ''}
            </Text>
            {!!c.subtitle && <Text style={styles.muted}>{c.subtitle}</Text>}
          </View>
        </Pressable>
      ))}

      <Text style={styles.section}>Les marques</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher une marque, un pays…"
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
        />
        {!!query && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer">
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
      </ScrollView>

      {!brands.length && <Text style={styles.muted}>Aucune marque ne correspond.</Text>}
      {brands.map((b, i) => {
        // Tri par pays : intertitre à chaque nouveau pays
        const header = sort === 'country' && (i === 0 || brands[i - 1].country !== b.country);
        return (
          <View key={b.id}>
            {header && (
              <View style={styles.countryHeader}>
                <Flag country={b.country} width={22} />
                <Text style={styles.countryName}>{countryName(b.country)}</Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.brand, b.hidden && styles.hidden, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/history/[slug]', params: { slug: b.slug } })}>
              {b.images[0] ? (
                <Image source={{ uri: b.images[0].url }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text style={styles.thumbLetter}>{b.name[0]}</Text>
                </View>
              )}
              <View style={styles.brandBody}>
                <View style={styles.brandTop}>
                  <Flag country={b.country} width={20} />
                  <Text style={styles.brandName} numberOfLines={1}>
                    {b.name}
                    {b.hidden ? ' (masquée)' : ''}
                  </Text>
                </View>
                <Text style={styles.brandMeta}>
                  {countryName(b.country)}
                  {b.foundedYear ? ` · depuis ${b.foundedYear}` : ''}
                </Text>
                {!!b.tagline && (
                  <Text style={styles.tagline} numberOfLines={2}>
                    {b.tagline}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          </View>
        );
      })}

      <Pressable style={styles.credits} onPress={() => router.push('/history/credits')}>
        <Text style={styles.creditsText}>Crédits des images (licences libres)</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: 14 },
  link: { color: Colors.accent, fontWeight: '800' },
  hero: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  heroEmoji: { fontSize: 40 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: Colors.text },
  heroText: { fontSize: 15, color: Colors.textMuted, textAlign: 'center' },
  chapter: { backgroundColor: Colors.surface, borderRadius: 16, overflow: 'hidden' },
  chapterImage: { width: '100%', height: 160, backgroundColor: Colors.border },
  chapterBody: { padding: 14, gap: 4 },
  kicker: { fontSize: 12, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase' },
  chapterTitle: { fontSize: 20, fontWeight: '900', color: Colors.text },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: Colors.text },
  sorts: { gap: 8, paddingVertical: 2 },
  countryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 6 },
  countryName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 14, padding: 10 },
  thumb: { width: 72, height: 54, borderRadius: 10, backgroundColor: Colors.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent },
  thumbLetter: { color: Colors.white, fontSize: 24, fontWeight: '900' },
  brandBody: { flex: 1, gap: 2 },
  brandTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text },
  brandMeta: { fontSize: 12, color: Colors.textMuted },
  tagline: { fontSize: 13, color: Colors.text },
  hidden: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  credits: { alignItems: 'center', paddingVertical: 12 },
  creditsText: { color: Colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
}));
