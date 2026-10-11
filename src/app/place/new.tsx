import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { PlaceField } from '@/components/form-fields';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Chip, Field, Section } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import type { Place } from '@/lib/geocoding';
import { pickPlace } from '@/lib/place-picker';
import { createPlace, PLACE_KINDS, type PlaceKind } from '@/lib/places';
import type { PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';

/** Ajouter un spot motard (onglet Sorties, bouton « + » ou appui long sur la carte). */
export default function NewPlaceScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  // name / description : préremplis par « Enregistrer comme belle route » (boucle)
  const params = useLocalSearchParams<{ label?: string; lat?: string; lng?: string; kind?: string; name?: string; description?: string }>();
  const [place, setPlace] = useState<Place | null>(() => {
    const latitude = Number(params.lat);
    const longitude = Number(params.lng);
    return params.lat && params.lng && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { label: params.label || `Point ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude }
      : null;
  });
  const [kind, setKind] = useState<PlaceKind>(() => PLACE_KINDS.find((k) => k.value === params.kind)?.value ?? 'biker_cafe');
  const [rating, setRating] = useState(0);
  const [name, setName] = useState(params.name ?? '');
  const [description, setDescription] = useState(params.description ?? '');
  const [photo, setPhoto] = useState<PhotoValue>({ path: null, localUri: null });
  const [saving, setSaving] = useState(false);

  if (!session) return null;

  const submit = async () => {
    const errors: string[] = [];
    if (name.trim().length < 2) errors.push('Donne un nom au spot.');
    if (!place) errors.push('Choisis l’emplacement.');
    if (!rating) errors.push('Donne une note de 1 à 5 étoiles.');
    if (errors.length) {
      Alert.alert('À compléter', errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const id = await createPlace(session.user.id, {
        kind,
        name,
        description,
        photo,
        rating,
        latitude: place!.latitude,
        longitude: place!.longitude,
      });
      router.replace({ pathname: '/place/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Ajout impossible', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Catégorie">
          <ScrollView horizontal={false} contentContainerStyle={styles.chips}>
            {PLACE_KINDS.map((k) => (
              <Chip key={k.value} label={`${k.emoji} ${k.label}`} selected={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </ScrollView>
        </Section>
        <Field label="Nom" required value={name} onChangeText={setName} maxLength={80} placeholder="ex. Le Relais des Crêtes" />
        <PlaceField
          label="Emplacement"
          required
          value={place}
          placeholder="Choisir sur la carte"
          onPress={async () => {
            const p = await pickPlace({ title: 'Emplacement du lieu', initial: place });
            if (p) setPlace(p);
          }}
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={1000}
          placeholder={kind === 'road' ? 'Départ, arrivée, ce qui la rend géniale…' : 'Pourquoi les motards vont adorer'}
          style={styles.description}
        />
        <Section title="Ta note">
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}>
                <Text style={[styles.star, { color: n <= rating ? Colors.warning : Colors.border }]}>★</Text>
              </Pressable>
            ))}
          </View>
        </Section>
        <PhotoPicker shape="wide" label="Photo (facultatif)" value={photo} onChange={setPhoto} />
        <Text style={styles.hint}>
          Le spot sera visible par tous les membres, qui pourront le noter et donner leur avis. Un spot signalé par 3 membres est
          masqué.
        </Text>
        <Button title="Ajouter le spot" loading={saving} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  description: { minHeight: 90, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: Colors.textMuted },
  stars: { flexDirection: 'row', gap: 8 },
  star: { fontSize: 40 },
}));
