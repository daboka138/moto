import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { distanceM, type LatLng } from '@/lib/geo';
import { categoryFromQuery, NEARBY_CATEGORIES, searchNearby, type NearbyCategory } from '@/lib/nearby';
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

/** Lieux d'abord (restos, commerces…), puis adresses de la BAN, puis le reste de Photon */
function mergeResults(photon: SearchResult[], ban: SearchResult[]): SearchResult[] {
  const places = photon.filter((r) => r.source === 'lieu');
  const photonAddresses = photon.filter((r) => r.source === 'adresse' && !ban.some((b) => sameSpot(b, r)));
  const out: SearchResult[] = [];
  for (const r of [...places, ...ban, ...photonAddresses]) if (!out.some((o) => sameSpot(o, r))) out.push(r);
  return out.slice(0, 10);
}

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
  const [nearby, setNearby] = useState<{ cat: NearbyCategory; key: string; results: SearchResult[]; error?: boolean } | null>(null);

  const q = query.trim();
  const typedCategory = q.length >= 3 ? categoryFromQuery(q) : null;
  const category = typedCategory ?? (q.length < 3 ? chip : null);
  const nearKey = near ? `${near.latitude.toFixed(3)},${near.longitude.toFixed(3)}` : null;

  // Lieux + adresses, 350 ms après la dernière frappe (Photon et BAN en parallèle, chacun en repli de l'autre)
  useEffect(() => {
    if (q.length < 3) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [photon, ban] = await Promise.all([
        searchPhoton(q, near).catch((e) => {
          console.warn('Recherche de lieux impossible (Photon)', e);
          return [] as SearchResult[];
        }),
        searchAddresses(q, near).catch((e) => {
          console.warn('Recherche d’adresse impossible', e);
          return [] as SearchResult[];
        }),
      ]);
      if (!cancelled) setLive({ query: q, results: mergeResults(photon, ban) });
    }, 350);
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
    searchNearby(category, near)
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

  const shownLive = live?.query === q ? live.results : null;
  const shownPlaces = places?.query === q ? places.results.filter((p) => !shownLive?.some((l) => sameSpot(l, p))) : null;
  const shownNearby = category && nearby?.cat === category && nearby.key === (nearKey ?? '') ? nearby : null;
  // La liste ne dépend pas du clavier : le fermer (bouton retour Android) retire le focus,
  // et la liste disparaissait avant l'appui sur un résultat. Elle reste tant qu'une recherche est tapée.
  const open = !locked && (focused || q.length >= 3 || !!chip);
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
              ) : !shownNearby ? (
                <ActivityIndicator color={Colors.accent} style={styles.spinner} />
              ) : shownNearby.results.length === 0 ? (
                <Text style={styles.empty}>
                  {shownNearby.error ? 'Recherche indisponible pour le moment, réessaie dans un instant.' : 'Rien trouvé à moins de 20 km.'}
                </Text>
              ) : (
                shownNearby.results.map((r, i) => <ResultRow key={`n${i}`} result={r} onPress={() => select(r)} />)
              )}
            </>
          )}
          {q.length < 3 ? (
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
              {shownLive === null ? (
                <ActivityIndicator color={Colors.accent} style={styles.spinner} />
              ) : (
                shownLive.map((r, i) => <ResultRow key={`a${i}`} result={r} onPress={() => select(r)} />)
              )}
              {shownPlaces?.map((r, i) => (
                <ResultRow key={`p${i}`} result={r} onPress={() => select(r)} />
              ))}
              {!shownPlaces && (
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
              {shownPlaces?.length === 0 && shownLive?.length === 0 && <Text style={styles.empty}>Aucun résultat.</Text>}
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
  wrap: { gap: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    elevation: 5,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  boxLocked: { opacity: 0.6 },
  input: { flex: 1, paddingVertical: 13, fontSize: 17, color: Colors.text },
  chips: { gap: 6, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  chipTextOn: { color: Colors.white },
  results: { maxHeight: 360, backgroundColor: Colors.surface, borderRadius: 16, elevation: 5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12 },
  section: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  sectionPad: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 },
  clear: { fontSize: 13, color: Colors.accent, fontWeight: '700' },
  spinner: { padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  emoji: { fontSize: 19, width: 22, textAlign: 'center' },
  rowText: { flex: 1 },
  label: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  detail: { fontSize: 13, color: Colors.textMuted },
  distance: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  placesButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  placesText: { flex: 1, color: Colors.accent, fontWeight: '700' },
  empty: { padding: 14, color: Colors.textMuted },
}));
