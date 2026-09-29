import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeafletMap } from '@/components/leaflet-map';
import { SearchBar } from '@/components/nav/search-bar';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';
import { currentPickRequest, resolvePick } from '@/lib/place-picker';
import { reverseGeocode } from '@/lib/search';

/** Choix d'un lieu : recherche d'adresse (même barre que l'onglet Carte) ou appui sur la carte. */
export default function PickPlaceScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { title } = useLocalSearchParams<{ title?: string }>();
  // Demande qui a ouvert l'écran : le lieu validé n'est renvoyé qu'à elle
  const [request] = useState(currentPickRequest);
  const initial = request?.initial ?? null;
  const [me, setMe] = useState<LatLng | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [resolving, setResolving] = useState(false);
  // Zone affichée : point initial, puis ma position, puis le résultat de recherche choisi
  const [focus, setFocus] = useState<LatLng | null>(initial);
  // Dernier appui sur la carte : une adresse arrivée en retard ne remplace pas un choix plus récent
  const pressId = useRef(0);

  // Sans validation (retour arrière), on renvoie null à l'écran appelant
  useEffect(() => () => resolvePick(request?.id, null), [request]);

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

  const choose = (place: Place) => {
    pressId.current++;
    setResolving(false);
    setSelected({ label: place.label, latitude: place.latitude, longitude: place.longitude });
    setFocus({ latitude: place.latitude, longitude: place.longitude });
  };

  const onMapPress = async (point: LatLng) => {
    Keyboard.dismiss();
    const id = ++pressId.current;
    const coords = `Point ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
    setSelected({ ...point, label: coords });
    setResolving(true);
    const place = await reverseGeocode(point);
    if (pressId.current !== id) return;
    setSelected(place);
    setResolving(false);
  };

  const validate = () => {
    if (!selected) return;
    resolvePick(request?.id, selected);
    router.back();
  };

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
        <SearchBar near={me ?? initial} onSelect={choose} placeholder="Rechercher une adresse, un lieu…" />
        {!selected && <Text style={styles.hint}>… ou appuie sur la carte pour placer le point.</Text>}
      </View>

      {selected && (
        <SafeAreaView edges={['bottom']} style={styles.bottom}>
          <View style={styles.selected}>
            <Ionicons name="location" size={20} color={Colors.accent} />
            <View style={styles.selectedBody}>
              <Text style={styles.selectedText} numberOfLines={2}>
                {selected.label}
              </Text>
              {resolving && <Text style={styles.resolving}>Recherche de l’adresse…</Text>}
            </View>
          </View>
          {/* Validable tout de suite : sans adresse trouvée, le point garde ses coordonnées */}
          <Button title="Valider ce lieu" onPress={validate} />
        </SafeAreaView>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  container: { flex: 1 },
  search: { position: 'absolute', top: 12, left: 12, right: 12, gap: 6 },
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
  selectedBody: { flex: 1 },
  selectedText: { fontSize: 16, fontWeight: '600', color: Colors.text },
  resolving: { fontSize: 13, color: Colors.textMuted },
}));
