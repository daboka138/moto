import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { distanceM, type LatLng } from '@/lib/geo';
import { searchPlaces as searchSpots } from '@/lib/global-search';
import { categoryFromQuery, NEARBY_CATEGORIES, searchNearby, type NearbyCategory } from '@/lib/nearby';
import { placeKindInfo } from '@/lib/places';
import { formatDistance } from '@/lib/routing';
import {
  addToHistory,
  clearHistory,
  readHistory,
  searchAddresses,
  searchPhoton,
  searchPlaces,
  type SearchResult,
} from '@/lib/search';

type Props = {
  near: LatLng | null;
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
  /** Affiché sous la barre quand aucune recherche n'est ouverte (raccourcis favoris…) */
  below?: ReactNode;
  /** Raccourcis Station / Café-Resto / Parking moto / Garage moto sous la barre (oui par défaut) */
  categories?: boolean;
};

/** Doublon : même nom (ou adresse) à moins de 80 m */
const sameSpot = (a: SearchResult, b: SearchResult) =>
  distanceM(a, b) < 80 && (a.label === b.label || a.source === 'adresse' || b.source === 'adresse');

/** Un lieu « proche » passe devant tout le reste, du plus près au plus loin */
const NEAR_M = 50_000;
const byDistance = (a: SearchResult, b: SearchResult) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity);
const isNear = (r: SearchResult) => r.distanceM != null && r.distanceM <= NEAR_M;

/**
 * Ordre des suggestions : spots PasseRyder proches, lieux proches (restos, commerces…) du plus près au
 * plus loin, puis villes / adresses (BAN d'abord), puis les lieux lointains et le reste.
 */
function mergeResults(spots: SearchResult[], photon: SearchResult[], ban: SearchResult[]): SearchResult[] {
  const places = photon.filter((r) => r.source === 'lieu');
  const photonAddresses = photon.filter((r) => r.source === 'adresse' && !ban.some((b) => sameSpot(b, r)));
  const ordered = [
    ...spots.filter(isNear).sort(byDistance),
    ...places.filter(isNear).sort(byDistance),
    ...photonAddresses.filter((r) => r.emoji === '🏙️' || r.emoji === '🏘️'),
    ...ban,
    ...photonAddresses,
    ...spots.filter((r) => !isNear(r)),
    ...places.filter((r) => !isNear(r)),
  ];
  const out: SearchResult[] = [];
  for (const r of ordered) if (!out.some((o) => o === r || sameSpot(o, r))) out.push(r);
  return out.slice(0, 10);
}

/** Recherche sans majuscules ni accents (historique) */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Suggestions déjà calculées (retour arrière, même recherche) : affichées sans attendre */
const liveCache = new Map<string, SearchResult[]>();
const liveKey = (q: string, nearKey: string | null) => `${fold(q)}|${nearKey ?? ''}`;
/** Suggestions dès 2 lettres (Photon, spots) ; adresses BAN dès 3 */
const MIN_LIVE = 2;

/**
 * Recherche de destination : lieux et adresses en direct (Photon + API Adresse), catégories en 1 tap
 * (station, café / resto, parking moto, garage moto : les plus proches), Nominatim en repli.
 * Utilisée par l'onglet Carte, « Choisir un lieu » (départ d'une boucle, balades).
 */
export function SearchBar({ near, onSelect, placeholder = 'Où va-t-on ?', below, categories = true }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [live, setLive] = useState<{ query: string; results: SearchResult[] } | null>(null);
  const [places, setPlaces] = useState<{ query: string; results: SearchResult[] } | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [history, setHistory] = useState(readHistory);
  // Catégorie touchée (ou reconnue dans la recherche : « parking moto »)
  const [chip, setChip] = useState<NearbyCategory | null>(null);
  const [nearby, setNearby] = useState<{
    cat: NearbyCategory;
    key: string;
    results: SearchResult[];
    loading?: boolean;
    error?: boolean;
  } | null>(null);

  const q = query.trim();
  const typedCategory = q.length >= 3 ? categoryFromQuery(q) : null;
  const category = typedCategory ?? (q.length < 3 ? chip : null);
  const nearKey = near ? `${near.latitude.toFixed(3)},${near.longitude.toFixed(3)}` : null;

  // Lieux + adresses + spots, 250 ms après la dernière frappe (en parallèle, chacun en repli des autres)
  useEffect(() => {
    if (q.length < MIN_LIVE) return;
    let cancelled = false;
    const cacheKey = liveKey(q, nearKey);
    if (liveCache.has(cacheKey)) return;
    const timer = setTimeout(async () => {
      const [photon, ban, spots] = await Promise.all([
        searchPhoton(q, near).catch((e) => {
          console.warn('Recherche de lieux impossible (Photon)', e);
          return [] as SearchResult[];
        }),
        q.length >= 3
          ? searchAddresses(q, near).catch((e) => {
              console.warn('Recherche d’adresse impossible', e);
              return [] as SearchResult[];
            })
          : Promise.resolve([] as SearchResult[]),
        searchSpots(q)
          .then((list) =>
            list.map(
              (s): SearchResult => ({
                latitude: s.latitude,
                longitude: s.longitude,
                label: s.name,
                detail: [`Spot PasseRyder · ${placeKindInfo(s.kind).short}`, s.rating != null ? `★ ${s.rating.toFixed(1).replace('.', ',')}` : null]
                  .filter(Boolean)
                  .join(' · '),
                source: 'lieu',
                emoji: placeKindInfo(s.kind).emoji,
                distanceM: near ? distanceM(near, s) : undefined,
              }),
            ),
          )
          .catch(() => [] as SearchResult[]),
      ]);
      const results = mergeResults(spots, photon, ban);
      liveCache.set(cacheKey, results);
      if (liveCache.size > 60) liveCache.delete(liveCache.keys().next().value!);
      if (!cancelled) setLive({ query: q, results });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // near change à chaque position GPS : seule une vraie différence (≈ 100 m) relance la recherche
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nearKey]);

  // Catégorie : les plus proches de moi
  useEffect(() => {
    if (!category || !near) return;
    let cancelled = false;
    const key = nearKey ?? '';
    // Résultats affichés dès qu'une source répond (cache, spots, Photon), complétés ensuite
    searchNearby(category, near, (results) => !cancelled && setNearby({ cat: category, key, results, loading: true }))
      .then((results) => !cancelled && setNearby({ cat: category, key, results }))
      .catch((e) => {
        console.warn('Recherche autour de moi impossible', e);
        if (!cancelled) setNearby({ cat: category, key, results: [], error: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, nearKey]);

  const searchPlacesNow = async () => {
    if (q.length < 3) return;
    setPlacesLoading(true);
    try {
      setPlaces({ query: q, results: await searchPlaces(q, near) });
    } catch (e) {
      console.warn('Recherche de lieux impossible', e);
      setPlaces({ query: q, results: [] });
    } finally {
      setPlacesLoading(false);
    }
  };

  const select = (r: SearchResult) => {
    const { distanceM: _d, ...kept } = r;
    addToHistory(kept);
    setHistory(readHistory());
    setQuery('');
    setChip(null);
    setFocused(false);
    Keyboard.dismiss();
    onSelect(r);
  };

  // Pendant le chargement, les suggestions précédentes restent affichées (pas de clignotement)
  const cachedLive = q.length >= MIN_LIVE ? liveCache.get(liveKey(q, nearKey)) : undefined;
  const liveFresh = live?.query === q || !!cachedLive;
  const shownLive = cachedLive ?? (live && q.length >= MIN_LIVE ? live.results : null);
  const shownPlaces = places?.query === q ? places.results.filter((p) => !shownLive?.some((l) => sameSpot(l, p))) : null;
  // Destinations récentes qui correspondent à la frappe, en tête
  const historyHits =
    q.length >= MIN_LIVE
      ? history.filter((h) => fold(h.label).includes(fold(q)) || fold(h.detail ?? '').includes(fold(q))).slice(0, 3)
      : [];
  const shownNearby = category && nearby?.cat === category && nearby.key === (nearKey ?? '') ? nearby : null;
  // La liste ne dépend pas du clavier : le fermer (bouton retour Android) retire le focus,
  // et la liste disparaissait avant l'appui sur un résultat. Elle reste tant qu'une recherche est tapée.
  const open = !locked && (focused || q.length >= MIN_LIVE || !!chip);
  const withDistance = (r: SearchResult) => ({ ...r, distanceM: r.distanceM ?? (near ? distanceM(near, r) : undefined) });
  const catInfo = category ? NEARBY_CATEGORIES.find((c) => c.value === category)! : null;

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, locked && styles.boxLocked]}>
        <Ionicons name="search" size={20} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            if (t) setChip(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={searchPlacesNow}
          editable={!locked}
          placeholder={locked ? 'Recherche désactivée en roulant' : placeholder}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
        />
        {(query.length > 0 || chip) && !locked && (
          <Pressable
            onPress={() => {
              setQuery('');
              setChip(null);
            }}
            hitSlop={10}
            accessibilityLabel="Effacer la recherche">
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {categories && !locked && (q.length < 3 || chip) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="always">
          {NEARBY_CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              style={[styles.chip, chip === c.value && styles.chipOn]}
              onPress={() => {
                Keyboard.dismiss();
                setQuery('');
                setChip(chip === c.value ? null : c.value);
              }}
              accessibilityLabel={`${c.label} les plus proches`}>
              <Text style={[styles.chipText, chip === c.value && styles.chipTextOn]}>
                {c.emoji} {c.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {open && (
        <ScrollView style={styles.results} keyboardShouldPersistTaps="always">
          {catInfo && (
            <>
              <Text style={[styles.section, styles.sectionPad]}>
                {catInfo.emoji} {catInfo.label} · les plus proches
              </Text>
              {!near ? (
                <Text style={styles.empty}>Position inconnue : active la localisation pour voir ce qui est autour de toi.</Text>
              ) : !shownNearby || (shownNearby.loading && shownNearby.results.length === 0) ? (
                <ActivityIndicator color={Colors.accent} style={styles.spinner} />
              ) : shownNearby.results.length === 0 ? (
                <Text style={styles.empty}>
                  {shownNearby.error
                    ? 'Recherche indisponible pour le moment, réessaie dans un instant.'
                    : category === 'parking'
                      ? 'Aucun parking moto connu à moins de 5 km.'
                      : 'Rien trouvé à moins de 20 km.'}
                </Text>
              ) : (
                <>
                  {shownNearby.results.map((r, i) => (
                    <ResultRow key={`n${i}`} result={r} onPress={() => select(r)} />
                  ))}
                  {shownNearby.loading && (
                    <View style={styles.moreRow}>
                      <ActivityIndicator size="small" color={Colors.accent} />
                      <Text style={styles.moreText}>Recherche d’autres lieux…</Text>
                    </View>
                  )}
                </>
              )}
            </>
          )}
          {q.length < MIN_LIVE ? (
            !chip &&
            (history.length > 0 ? (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Recherches récentes</Text>
                  <Pressable
                    onPress={() => {
                      clearHistory();
                      setHistory([]);
                    }}
                    hitSlop={8}>
                    <Text style={styles.clear}>Effacer</Text>
                  </Pressable>
                </View>
                {history.map((h, i) => (
                  <ResultRow key={`h${i}`} icon="time-outline" result={withDistance(h)} onPress={() => select(h)} />
                ))}
              </>
            ) : (
              <Text style={styles.empty}>Tape une adresse, une ville, un resto, un commerce…</Text>
            ))
          ) : (
            <>
              {catInfo && <Text style={[styles.section, styles.sectionPad]}>Autres résultats</Text>}
              {historyHits.map((h, i) => (
                <ResultRow key={`hh${i}`} icon="time-outline" result={withDistance(h)} onPress={() => select(h)} />
              ))}
              {shownLive === null ? (
                <ActivityIndicator color={Colors.accent} style={styles.spinner} />
              ) : (
                <View style={!liveFresh && styles.stale}>
                  {shownLive
                    .filter((r) => !historyHits.some((h) => sameSpot(h, r)))
                    .map((r, i) => (
                      <ResultRow key={`a${i}`} result={r} onPress={() => select(r)} />
                    ))}
                </View>
              )}
              {shownPlaces?.map((r, i) => (
                <ResultRow key={`p${i}`} result={r} onPress={() => select(r)} />
              ))}
              {!shownPlaces && q.length >= 3 && (
                <Pressable style={styles.placesButton} onPress={searchPlacesNow} disabled={placesLoading}>
                  {placesLoading ? (
                    <ActivityIndicator color={Colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={18} color={Colors.accent} />
                      <Text style={styles.placesText}>Pas trouvé ? Chercher « {q} » plus loin</Text>
                    </>
                  )}
                </Pressable>
              )}
              {liveFresh && shownLive?.length === 0 && historyHits.length === 0 && (!places || shownPlaces?.length === 0) && (
                <Text style={styles.empty}>{q.length < 3 ? 'Continue à taper…' : 'Aucun résultat.'}</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
      {!open && below}
    </View>
  );
}

function ResultRow({
  icon = 'location-outline',
  result,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  result: SearchResult;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={styles.row} onPress={onPress}>
      {result.emoji && icon !== 'time-outline' ? (
        <Text style={styles.emoji}>{result.emoji}</Text>
      ) : (
        <Ionicons name={icon} size={20} color={Colors.accent} />
      )}
      <View style={styles.rowText}>
        <Text style={styles.label} numberOfLines={1}>
          {result.label}
        </Text>
        {!!result.detail && (
          <Text style={styles.detail} numberOfLines={1}>
            {result.detail}
          </Text>
        )}
      </View>
      {result.distanceM != null && <Text style={styles.distance}>{formatDistance(result.distanceM)}</Text>}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 8 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  boxLocked: { opacity: 0.6 },
  input: { flex: 1, paddingVertical: 12, fontSize: Type.large, color: Colors.text },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  chipTextOn: { color: Colors.white },
  results: { maxHeight: 360, backgroundColor: Colors.surface, borderRadius: Radius.md, elevation: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  section: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  sectionPad: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
  clear: { fontSize: Type.small, color: Colors.accent, fontWeight: '700' },
  spinner: { padding: 12 },
  stale: { opacity: 0.55 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  moreText: { fontSize: Type.small, color: Colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  emoji: { fontSize: Type.large, width: 22, textAlign: 'center' },
  rowText: { flex: 1 },
  label: { fontSize: Type.body, color: Colors.text, fontWeight: '600' },
  detail: { fontSize: Type.small, color: Colors.textMuted },
  distance: { fontSize: Type.small, color: Colors.textMuted, fontWeight: '600' },
  placesButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  placesText: { flex: 1, color: Colors.accent, fontWeight: '700' },
  empty: { padding: 16, color: Colors.textMuted },
}));
