import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LeafletMap } from '@/components/leaflet-map';
import { SearchBar } from '@/components/nav/search-bar';
import { Button, Chip } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { FAVORITE_LABELS, sortFavorites, useFavorites } from '@/lib/favorites';
import { distanceM, type LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';
import { currentPickRequest, resolvePick } from '@/lib/place-picker';
import { fetchPopularSpots, MEETING_KINDS, placeKindInfo, spotAsPlace, type CommunityPlace } from '@/lib/places';
import { formatDistance } from '@/lib/routing';
import { reverseGeocode } from '@/lib/search';
import { PlaceIcon } from '@/components/map-icon';
import { placePinIcon } from '@/lib/map-pin-icons';

/**
 * Choix d'un lieu : recherche d'adresse (même barre que l'onglet Carte), appui (ou appui long) sur
 * la carte, et avec suggest : ma position, Maison / Travail / favoris, spots PasseRyder proches.
 */
export default function PickPlaceScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { title } = useLocalSearchParams<{ title?: string }>();
  // Demande qui a ouvert l'écran : le lieu validé n'est renvoyé qu'à elle
  const [request] = useState(currentPickRequest);
  const initial = request?.initial ?? null;
  const suggest = request?.suggest ?? false;
  const favorites = sortFavorites(useFavorites());
  const [spots, setSpots] = useState<CommunityPlace[]>([]);
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
    (async () => {
      // Sans autorisation, pas de demande ici : l'écran sert justement quand la position manque
      const p =
        (await Location.getLastKnownPositionAsync().catch(() => null)) ??
        ((await Location.getForegroundPermissionsAsync().catch(() => null))?.granted
          ? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
          : null);
      if (!p) return;
      const point = { latitude: p.coords.latitude, longitude: p.coords.longitude };
      setMe(point);
      setFocus((f) => f ?? point);
    })();
  }, []);

  // Spots proches (cafés, points de vue, stations, parkings) : autour du point initial, sinon de moi
  const spotsCenter = initial ?? me;
  const spotsKey = spotsCenter ? `${spotsCenter.latitude.toFixed(2)},${spotsCenter.longitude.toFixed(2)}` : null;
  useEffect(() => {
    if (!suggest || !spotsKey) return;
    const [latitude, longitude] = spotsKey.split(',').map(Number);
    let cancelled = false;
    fetchPopularSpots({ latitude, longitude }, { kinds: MEETING_KINDS, limit: 6 })
      .then((list) => !cancelled && setSpots(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [suggest, spotsKey]);

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
        onMapLongPress={onMapPress}
        pins={[
          ...spots.map((p) => ({ id: p.id, kind: 'place' as const, label: placeKindInfo(p.kind).short, icon: placePinIcon(p.kind), latitude: p.latitude, longitude: p.longitude })),
          ...(selected
            ? [{ id: 'selected', kind: 'meeting' as const, label: '●', latitude: selected.latitude, longitude: selected.longitude }]
            : []),
        ]}
        onPinPress={(id) => {
          const spot = spots.find((p) => p.id === id);
          if (spot) choose(spotAsPlace(spot));
        }}
        fitPoints={focus ? [focus] : undefined}
      />

      <View style={styles.search} pointerEvents="box-none">
        <SearchBar near={me ?? initial} onSelect={choose} placeholder="Rechercher une adresse, un lieu…" />
        {!selected && <Text style={styles.hint}>… ou appuie sur la carte (ou un spot) pour placer le point.</Text>}
      </View>

      {suggest && !selected && (me || favorites.length > 0 || spots.length > 0) && (
        <SafeAreaView edges={['bottom']} style={styles.bottom}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {me && <Chip label="📍 Ma position" onPress={() => choose({ label: '📍 Ma position', ...me })} />}
            {favorites.map((f) => (
              <Chip
                key={f.id}
                label={f.kind === 'custom' ? `⭐ ${f.label}` : `${f.kind === 'home' ? '🏠' : '💼'} ${FAVORITE_LABELS[f.kind]}`}
                onPress={() => choose({ label: f.kind === 'custom' ? f.label : FAVORITE_LABELS[f.kind], latitude: f.latitude, longitude: f.longitude })}
              />
            ))}
          </ScrollView>
          {spots.length > 0 && (
            <View style={styles.spots}>
              <Text style={styles.spotsTitle}>Spots PasseRyder proches</Text>
              {spots.slice(0, 4).map((p) => (
                <Pressable key={p.id} style={({ pressed }) => [styles.spot, pressed && { opacity: 0.6 }]} onPress={() => choose(spotAsPlace(p))}>
                  <PlaceIcon kind={p.kind} size={24} />
                  <Text style={styles.spotName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.spotMeta}>
                    {p.rating != null ? `★ ${p.rating.toFixed(1).replace('.', ',')} · ` : ''}
                    {spotsCenter ? formatDistance(distanceM(spotsCenter, p)) : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </SafeAreaView>
      )}

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
  search: { position: 'absolute', top: 12, left: 12, right: 12, gap: 8 },
  hint: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.overlay,
    color: Colors.white,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: Type.small,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 16,
    gap: 12,
  },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedBody: { flex: 1 },
  selectedText: { fontSize: Type.body, fontWeight: '600', color: Colors.text },
  resolving: { fontSize: Type.small, color: Colors.textMuted },
  chips: { gap: 8 },
  spots: { gap: 2 },
  spotsTitle: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  spot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  spotEmoji: { fontSize: Type.large },
  spotName: { flex: 1, fontSize: Type.body, fontWeight: '600', color: Colors.text },
  spotMeta: { fontSize: Type.small, color: Colors.textMuted },
}));
