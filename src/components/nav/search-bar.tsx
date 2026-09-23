import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import type { LatLng } from '@/lib/geo';
import {
  addToHistory,
  clearHistory,
  readHistory,
  searchAddresses,
  searchPlaces,
  type SearchResult,
} from '@/lib/search';

type Props = {
  near: LatLng | null;
  onSelect: (result: SearchResult) => void;
};

/** Recherche de destination : adresses (API Adresse) en direct, lieux (Nominatim) sur demande. */
export function SearchBar({ near, onSelect }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [addresses, setAddresses] = useState<{ query: string; results: SearchResult[] } | null>(null);
  const [places, setPlaces] = useState<{ query: string; results: SearchResult[] } | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [history, setHistory] = useState(readHistory);

  const q = query.trim();

  // Autocomplétion des adresses, 300 ms après la dernière frappe
  useEffect(() => {
    if (q.length < 3) return;
    const timer = setTimeout(() => {
      searchAddresses(q, near)
        .then((results) => setAddresses({ query: q, results }))
        .catch((e) => console.warn('Recherche d’adresse impossible', e));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, near]);

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
    addToHistory(r);
    setHistory(readHistory());
    setQuery('');
    setFocused(false);
    Keyboard.dismiss();
    onSelect(r);
  };

  const shownAddresses = addresses?.query === q ? addresses.results : null;
  const shownPlaces = places?.query === q ? places.results : null;
  const open = focused && !locked;

  return (
    <View style={styles.wrap}>
      <View style={[styles.box, locked && styles.boxLocked]}>
        <Ionicons name="search" size={20} color={Colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onSubmitEditing={searchPlacesNow}
          editable={!locked}
          placeholder={locked ? 'Recherche désactivée en roulant' : 'Où va-t-on ?'}
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && !locked && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      {open && (
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
          {q.length < 3 ? (
            history.length > 0 ? (
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
                  <ResultRow key={`h${i}`} icon="time-outline" result={h} onPress={() => select(h)} />
                ))}
              </>
            ) : (
              <Text style={styles.empty}>Tape une adresse, une ville ou un lieu.</Text>
            )
          ) : (
            <>
              {shownAddresses === null ? (
                <ActivityIndicator color={Colors.accent} style={{ padding: 12 }} />
              ) : (
                shownAddresses.map((r, i) => <ResultRow key={`a${i}`} icon="location-outline" result={r} onPress={() => select(r)} />)
              )}
              {shownPlaces?.map((r, i) => (
                <ResultRow key={`p${i}`} icon="storefront-outline" result={r} onPress={() => select(r)} />
              ))}
              {!shownPlaces && (
                <Pressable style={styles.placesButton} onPress={searchPlacesNow} disabled={placesLoading}>
                  {placesLoading ? (
                    <ActivityIndicator color={Colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="restaurant-outline" size={18} color={Colors.accent} />
                      <Text style={styles.placesText}>Chercher « {q} » dans les lieux (restos, stations…)</Text>
                    </>
                  )}
                </Pressable>
              )}
              {shownPlaces?.length === 0 && shownAddresses?.length === 0 && (
                <Text style={styles.empty}>Aucun résultat.</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ResultRow({
  icon,
  result,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  result: SearchResult;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={Colors.accent} />
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
  results: { maxHeight: 360, backgroundColor: Colors.surface, borderRadius: 16, elevation: 5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12 },
  section: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase' },
  clear: { fontSize: 13, color: Colors.accent, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowText: { flex: 1 },
  label: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  detail: { fontSize: 13, color: Colors.textMuted },
  placesButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  placesText: { flex: 1, color: Colors.accent, fontWeight: '700' },
  empty: { padding: 14, color: Colors.textMuted },
}));
