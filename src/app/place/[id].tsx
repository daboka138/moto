import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { Stars } from '@/components/community-cards';
import { ExpandableMap } from '@/components/expandable-map';
import { Card } from '@/components/profile-view';
import { CriteriaBars, CriteriaInput, PhotosInput } from '@/components/road-criteria';
import { Button, Field } from '@/components/ui';
import { makeStyles, Radius, RoadRatingColors, Type, useColors } from '@/constants/theme';
import { goToPlace, IS_WEB } from '@/lib/app-link';
import { formatDistance } from '@/lib/routing';
import { setPendingGpx } from '@/lib/gpx';
import { timeAgo } from '@/lib/feed';
import { askReport } from '@/lib/moderation';
import {
  deletePlace,
  deleteReview,
  fetchPlace,
  fetchReviews,
  placeKindInfo,
  reviewPhotos,
  saveReview,
  type CommunityPlace,
  type PlaceReview,
} from '@/lib/places';
import type { PhotoValue } from '@/lib/profile';
import { criteriaComplete, criteriaRating, roadTier, type RoadCriteria } from '@/lib/road-rules';
import { useSession } from '@/lib/session';
import { PlaceIcon } from '@/components/map-icon';
import { placePinIcon } from '@/lib/map-pin-icons';
import { UserName } from '@/components/user-name';

/** Fiche d'un lieu motard : photo, carte, note moyenne, avis ; mon avis (note, texte, photo). */
export default function PlaceScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const [place, setPlace] = useState<CommunityPlace | null | undefined>(undefined);
  const [reviews, setReviews] = useState<PlaceReview[]>([]);
  // Mon avis en cours d'écriture
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<PhotoValue[]>([]);
  const [criteria, setCriteria] = useState<Partial<RoadCriteria>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetchPlace(id), fetchReviews(id)]);
      setPlace(p);
      setReviews(r);
    } catch (e) {
      console.warn('Lieu indisponible', e);
      setPlace((p) => p ?? null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (place === undefined || !userId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (place === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Lieu introuvable ou supprimé.</Text>
      </View>
    );
  }

  const kind = placeKindInfo(place.kind);
  const mine = reviews.find((r) => r.authorId === userId) ?? null;
  const isCreator = place.createdBy === userId;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const isRoad = place.kind === 'road';
  const line = place.line;
  const mapRoutes = line ? [{ id: 'road', points: line.map((p) => [p.latitude, p.longitude] as [number, number]), color: RoadRatingColors[roadTier(avg)] }] : undefined;
  const mapFit = line ?? [place];

  const startEdit = () => {
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? '');
    setPhotos(mine ? reviewPhotos(mine).map((p) => ({ path: p.path, localUri: null })) : []);
    setCriteria(mine?.criteria ?? {});
    setEditing(true);
  };

  const save = async () => {
    if (isRoad ? !criteriaComplete(criteria) : !rating) {
      Alert.alert('Ton avis', isRoad ? 'Note les 4 critères (1 à 5 étoiles).' : 'Choisis une note de 1 à 5 étoiles.');
      return;
    }
    setSaving(true);
    try {
      await saveReview(userId, place.id, {
        rating: isRoad && criteriaComplete(criteria) ? criteriaRating(criteria) : rating,
        body,
        photos,
        previousPhotoPaths: mine ? reviewPhotos(mine).map((p) => p.path) : [],
        criteria: isRoad && criteriaComplete(criteria) ? criteria : null,
      });
      await load();
      setEditing(false);
    } catch (e) {
      Alert.alert('Avis', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const reviewMenu = (r: PlaceReview) => {
    const own = r.authorId === userId;
    showActionSheet({
      title: `Avis de @${r.username}`,
      options: [
        ...(own || isCreator
          ? [
              {
                label: 'Supprimer l’avis',
                destructive: true,
                onPress: async () => {
                  try {
                    await deleteReview(r, userId);
                    setReviews((list) => list.filter((x) => x.id !== r.id));
                  } catch (e) {
                    Alert.alert('Suppression impossible', String(e));
                  }
                },
              },
            ]
          : []),
        ...(!own ? [{ label: 'Signaler cet avis', destructive: true, onPress: () => askReport('place_review', r.id) }] : []),
      ],
    });
  };

  // Route avec tracé : navigation le long de la route (app) ; sinon jusqu'au lieu
  const goThere = () => {
    if (line && !IS_WEB) {
      setPendingGpx({ name: place.name, points: line, waypoints: [] });
      router.navigate({ pathname: '/', params: { gpx: String(Date.now()) } });
      return;
    }
    const start = line?.[0] ?? place;
    goToPlace({ latitude: start.latitude, longitude: start.longitude, label: place.name });
  };

  // Balade avec ce tracé (même chemin que l'import GPX) ; route sans tracé : RDV au point
  const createRide = () => {
    if (line) {
      setPendingGpx({ name: place.name, points: line, waypoints: [] });
      router.push({ pathname: '/ride/new', params: { gpx: '1', role: 'meeting', label: place.name, lat: String(line[0].latitude), lng: String(line[0].longitude) } });
      return;
    }
    router.push({ pathname: '/ride/new', params: { role: 'meeting', label: place.name, lat: String(place.latitude), lng: String(place.longitude) } });
  };

  const placeMenu = () =>
    showActionSheet({
      title: place.name,
      options: isCreator
        ? [
            {
              label: 'Supprimer ce lieu',
              destructive: true,
              onPress: () =>
                Alert.alert('Supprimer ce lieu ?', 'Le lieu et tous ses avis seront supprimés.', [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Supprimer',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deletePlace(place, reviews);
                        router.back();
                      } catch (e) {
                        Alert.alert('Suppression impossible', String(e));
                      }
                    },
                  },
                ]),
            },
          ]
        : [{ label: 'Signaler ce lieu', destructive: true, onPress: () => askReport('place', place.id) }],
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable onPress={placeMenu} hitSlop={10} accessibilityLabel="Options du lieu">
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
            </Pressable>
          ),
        }}
      />
      {place.photoUrl ? (
        <Image source={{ uri: place.photoUrl }} style={styles.photo} contentFit="cover" />
      ) : (
        <ExpandableMap
          style={styles.map}
          position={null}
          pins={[{ id: 'p', kind: 'place', label: kind.short, icon: placePinIcon(place.kind), latitude: place.latitude, longitude: place.longitude }]}
          routes={mapRoutes}
          fitPoints={mapFit}
          title={place.name}
          subtitle={kind.label}
        />
      )}
      <View style={styles.body}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PlaceIcon kind={place.kind} size={22} />
          <Text style={styles.kind}>{line ? `Route plaisir${place.lengthM ? ` · ${formatDistance(place.lengthM)}` : ''}` : kind.label}</Text>
        </View>
        <Text style={styles.title}>{place.name}</Text>
        <View style={styles.ratingRow}>
          {avg !== null ? (
            <>
              <Stars value={avg} size={20} />
              <Text style={styles.ratingText}>
                {avg.toFixed(1).replace('.', ',')} · {reviews.length} avis
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>Pas encore d’avis : sois le premier !</Text>
          )}
        </View>
        {place.criteria && <CriteriaBars value={place.criteria} />}
        {!!place.description && <Text style={styles.description}>{place.description}</Text>}
        <Text style={styles.muted}>Ajouté par @{place.creatorName}</Text>

        <Button title="Y aller" icon="navigate" onPress={goThere} />
        {isRoad && <Button title="Créer une balade ici" icon="flag-outline" variant="secondary" onPress={createRide} />}
        {isRoad && <Text style={styles.reminder}>Belle route = plaisir des yeux et des virages, dans le respect du code de la route.</Text>}

        {place.photoUrl && (
          <ExpandableMap
            style={styles.mapSmall}
            position={null}
            pins={[{ id: 'p', kind: 'place', label: kind.short, icon: placePinIcon(place.kind), latitude: place.latitude, longitude: place.longitude }]}
            routes={mapRoutes}
            fitPoints={mapFit}
            title={place.name}
            subtitle={kind.label}
          />
        )}

        <Card title={mine ? 'Mon avis' : 'Donner mon avis'}>
          {editing ? (
            <View style={styles.form}>
              {isRoad ? <CriteriaInput value={criteria} onChange={setCriteria} /> : <Stars value={rating} size={34} onChange={setRating} />}
              <Field label="Commentaire" value={body} onChangeText={setBody} multiline maxLength={500} placeholder="Accueil, ambiance, état de la route…" />
              <PhotosInput value={photos} onChange={setPhotos} max={isRoad ? 4 : 1} />
              <Button title="Publier mon avis" loading={saving} onPress={save} />
              <Button title="Annuler" variant="ghost" onPress={() => setEditing(false)} />
            </View>
          ) : (
            <Button title={mine ? 'Modifier mon avis' : isRoad ? 'Noter cette route' : 'Noter ce lieu'} icon="star-outline" variant="secondary" onPress={startEdit} />
          )}
        </Card>

        <Card title={`Avis (${reviews.length})`}>
          {reviews.length === 0 && <Text style={styles.muted}>Aucun avis pour l’instant.</Text>}
          {reviews.map((r) => (
            <Pressable key={r.id} style={styles.review} onLongPress={() => reviewMenu(r)} delayLongPress={350}>
              <View style={styles.reviewHeader}>
                {!!r.avatarUrl && <Image source={{ uri: r.avatarUrl }} style={styles.avatar} />}
                <View style={{ flex: 1 }}>
                  {r.authorId === userId ? (
                    <Text style={styles.username}>Moi</Text>
                  ) : (
                    <UserName variant="inline" userId={r.authorId} username={r.username} style={styles.username} />
                  )}
                  <View style={styles.ratingRow}>
                    <Stars value={r.rating} size={13} />
                    <Text style={styles.time}>{timeAgo(r.createdAt)}</Text>
                  </View>
                </View>
                <Pressable onPress={() => reviewMenu(r)} hitSlop={10} accessibilityLabel="Options de l’avis">
                  <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
              {r.criteria && <CriteriaBars value={r.criteria} compact />}
              {!!r.body && <Text style={styles.reviewText}>{r.body}</Text>}
              {reviewPhotos(r).length === 1 && <Image source={{ uri: reviewPhotos(r)[0].url }} style={styles.reviewPhoto} contentFit="cover" />}
              {reviewPhotos(r).length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {reviewPhotos(r).map((ph) => (
                    <Image key={ph.path} source={{ uri: ph.url }} style={styles.reviewThumb} contentFit="cover" />
                  ))}
                </ScrollView>
              )}
            </Pressable>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: Type.body },
  photo: { width: '100%', height: 240, backgroundColor: Colors.border },
  map: { height: 220, backgroundColor: Colors.border },
  mapSmall: { height: 160, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.border },
  body: { padding: 16, gap: 16 },
  kind: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingText: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  description: { fontSize: Type.body, lineHeight: 21, color: Colors.text },
  form: { gap: 12 },
  review: { gap: 8, paddingVertical: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.border },
  username: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  time: { fontSize: Type.small, color: Colors.textMuted },
  reviewText: { fontSize: Type.body, lineHeight: 19, color: Colors.text },
  reviewPhoto: { width: '100%', height: 180, borderRadius: Radius.md, backgroundColor: Colors.border },
  reviewThumb: { width: 140, height: 105, borderRadius: Radius.md, backgroundColor: Colors.border },
  reminder: { fontSize: Type.small, color: Colors.textMuted, textAlign: 'center' },
}));
