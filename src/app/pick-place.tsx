import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeafletMap } from '@/components/leaflet-map';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import type { LatLng } from '@/lib/geo';
import { reverseGeocode, searchPlaces, type Place } from '@/lib/geocoding';
import { pickerInitialPoint, resolvePick } from '@/lib/place-picker';

/** Choix d'un lieu : recherche d'adresse ou appui sur la carte. */
export default function PickPlaceScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { title } = useLocalSearchParams<{ title?: string }>();
  const [initial] = useState(pickerInitialPoint);
  const [me, setMe] = useState<LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; places: Place[] } | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [resolving, setResolving] = useState(false);
  // Zone affichée : point initial, puis ma position, puis le résultat de recherche choisi
  const [focus, setFocus] = useState<LatLng | null>(initial);
  const validated = useRef(false);
  const { locked } = useDrivingLock();

  // Sans validation (retour arrière), on renvoie null à l'écran appelant
  useEffect(() => () => {
    if (!validated.current) resolvePick(null);
  }, []);

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((p) => {
        if (!p) return;
        const point = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        setMe(point);
        setFocus((f) => f ?? point);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) return;
    const q = query;
    const timer = setTimeout(() => {
      searchPlaces(q, me ?? initial)
        .then((places) => setResults({ query: q, places }))
        .catch((e) => console.warn('Recherche d\'adresse impossible', e));
    }, 400);
    return () => clearTimeout(timer);
  }, [query, me, initial]);

  const choose = (place: Place) => {
    setSelected(place);
    setFocus({ latitude: place.latitude, longitude: place.longitude });
    setResults(null);
    setQuery('');
    Keyboard.dismiss();
  };

  const onMapPress = async (point: LatLng) => {
    Keyboard.dismiss();
    setResolving(true);
    setSelected({ ...point, label: 'Recherche de l\'adresse…' });
    const place = await reverseGeocode(point);
    setSelected(place);
    setResolving(false);
  };

  const validate = () => {
    if (!selected) return;
    validated.current = true;
    resolvePick(selected);
    router.back();
  };

  const shownResults = query.trim().length >= 3 && results?.query === query ? results.places : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: title ?? 'Choisir un lieu' }} />
      <LeafletMap
        position={me ? { ...me, accuracy: null } : null}
        onMapPress={onMapPress}
        pins={
          selected
            ? [{ id: 'selected', kind: 'meeting', label: '●', latitude: selected.latitude, longitude: selected.longitude }]
            : []
        }
        fitPoints={focus ? [focus] : undefined}
      />

      <View style={styles.search} pointerEvents="box-none">
        <View style={styles.inputBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            editable={!locked}
            placeholder={locked ? 'Recherche désactivée en roulant' : 'Rechercher une adresse, un lieu…'}
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        {query.trim().length >= 3 && (
          <View style={styles.results}>
            {shownResults === null ? (
              <ActivityIndicator color={Colors.accent} style={{ padding: 12 }} />
            ) : shownResults.length === 0 ? (
              <Text style={styles.empty}>Aucun résultat</Text>
            ) : (
              shownResults.map((p, i) => (
                <Pressable key={i} style={styles.result} onPress={() => choose(p)}>
                  <Ionicons name="location-outline" size={18} color={Colors.accent} />
                  <Text style={styles.resultText} numberOfLines={2}>
                    {p.label}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}
        {!selected && query.length === 0 && (
          <Text style={styles.hint}>… ou appuie sur la carte pour placer le point.</Text>
        )}
      </View>

      {selected && (
        <SafeAreaView edges={['bottom']} style={styles.bottom}>
          <View style={styles.selected}>
            <Ionicons name="location" size={20} color={Colors.accent} />
            <Text style={styles.selectedText} numberOfLines={2}>
              {selected.label}
            </Text>
          </View>
          <Button title="Valider ce lieu" onPress={validate} disabled={resolving} />
        </SafeAreaView>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  container: { flex: 1 },
  search: { position: 'absolute', top: 12, left: 12, right: 12, gap: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: Colors.text },
  results: { backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden', elevation: 4 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  resultText: { flex: 1, fontSize: 15, color: Colors.text },
  empty: { padding: 12, color: Colors.textMuted },
  hint: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.overlay,
    color: Colors.white,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 12,
  },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedText: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.text },
}));
