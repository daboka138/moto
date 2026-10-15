import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { Stars } from '@/components/community-cards';
import { LeafletMap } from '@/components/leaflet-map';
import { PhotoPicker } from '@/components/photo-picker';
import { Card } from '@/components/profile-view';
import { Button, Field } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { goToPlace } from '@/lib/app-link';
import { timeAgo } from '@/lib/feed';
import { askReport } from '@/lib/moderation';
import {
  deletePlace,
  deleteReview,
  fetchPlace,
  fetchReviews,
  placeKindInfo,
  saveReview,
  type CommunityPlace,
  type PlaceReview,
} from '@/lib/places';
import type { PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';

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
  const [photo, setPhoto] = useState<PhotoValue>({ path: null, localUri: null });
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

  const startEdit = () => {
    setRating(mine?.rating ?? 0);
    setBody(mine?.body ?? '');
    setPhoto({ path: mine?.photoPath ?? null, localUri: null });
    setEditing(true);
  };

  const save = async () => {
    if (!rating) {
      Alert.alert('Ton avis', 'Choisis une note de 1 à 5 étoiles.');
      return;
    }
    setSaving(true);
    try {
      await saveReview(userId, place.id, { rating, body, photo: photo.localUri || photo.path ? photo : null, previousPhotoPath: mine?.photoPath ?? null });
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
        <View style={styles.map}>
          <LeafletMap position={null} pins={[{ id: 'p', kind: 'place', label: kind.emoji, latitude: place.latitude, longitude: place.longitude }]} fitPoints={[place]} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.kind}>
          {kind.emoji} {kind.label}
        </Text>
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
        {!!place.description && <Text style={styles.description}>{place.description}</Text>}
        <Text style={styles.muted}>Ajouté par @{place.creatorName}</Text>

        <Button title="Y aller" onPress={() => goToPlace({ ...place, label: place.name })} />

        {place.photoUrl && (
          <View style={styles.mapSmall}>
            <LeafletMap position={null} pins={[{ id: 'p', kind: 'place', label: kind.emoji, latitude: place.latitude, longitude: place.longitude }]} fitPoints={[place]} />
          </View>
        )}

        <Card title={mine ? 'Mon avis' : 'Donner mon avis'}>
          {editing ? (
            <View style={styles.form}>
              <Stars value={rating} size={34} onChange={setRating} />
              <Field label="Commentaire" value={body} onChangeText={setBody} multiline maxLength={500} placeholder="Accueil, ambiance, état de la route…" />
              <PhotoPicker shape="wide" label="Photo (facultatif)" value={photo} onChange={setPhoto} />
              <Button title="Publier mon avis" loading={saving} onPress={save} />
              <Button title="Annuler" variant="ghost" onPress={() => setEditing(false)} />
            </View>
          ) : (
            <Button title={mine ? 'Modifier mon avis' : '★ Noter ce lieu'} variant="secondary" onPress={startEdit} />
          )}
        </Card>

        <Card title={`Avis (${reviews.length})`}>
          {reviews.length === 0 && <Text style={styles.muted}>Aucun avis pour l’instant.</Text>}
          {reviews.map((r) => (
            <Pressable key={r.id} style={styles.review} onLongPress={() => reviewMenu(r)} delayLongPress={350}>
              <View style={styles.reviewHeader}>
                {!!r.avatarUrl && <Image source={{ uri: r.avatarUrl }} style={styles.avatar} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.username}>{r.authorId === userId ? 'Moi' : `@${r.username}`}</Text>
                  <View style={styles.ratingRow}>
                    <Stars value={r.rating} size={13} />
                    <Text style={styles.time}>{timeAgo(r.createdAt)}</Text>
                  </View>
                </View>
                <Pressable onPress={() => reviewMenu(r)} hitSlop={10} accessibilityLabel="Options de l’avis">
                  <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
              {!!r.body && <Text style={styles.reviewText}>{r.body}</Text>}
              {r.photoUrl && <Image source={{ uri: r.photoUrl }} style={styles.reviewPhoto} contentFit="cover" />}
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
  muted: { color: Colors.textMuted, fontSize: 14 },
  photo: { width: '100%', height: 240, backgroundColor: Colors.border },
  map: { height: 220, backgroundColor: Colors.border },
  mapSmall: { height: 160, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.border },
  body: { padding: 16, gap: 14 },
  kind: { fontSize: 14, fontWeight: '700', color: Colors.accent },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  description: { fontSize: 15, lineHeight: 21, color: Colors.text },
  form: { gap: 12 },
  review: { gap: 6, paddingVertical: 6 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.border },
  username: { fontSize: 14, fontWeight: '800', color: Colors.text },
  time: { fontSize: 12, color: Colors.textMuted },
  reviewText: { fontSize: 14, lineHeight: 19, color: Colors.text },
  reviewPhoto: { width: '100%', height: 180, borderRadius: 12, backgroundColor: Colors.border },
}));
