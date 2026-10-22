import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';

import { ClubPicker } from '@/components/club-picker';
import { DateTimeField, PlaceField } from '@/components/form-fields';
import { PhotoPicker } from '@/components/photo-picker';
import { Button, Chip, Field, Section } from '@/components/ui';
import { makeStyles, Type, useColors } from '@/constants/theme';
import { createEvent, EVENT_KINDS, normalizeLink, type EventKind, type PriceKind } from '@/lib/events';
import type { Place } from '@/lib/geocoding';
import { pickPlace } from '@/lib/place-picker';
import type { PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';

function defaultStart() {
  // Samedi prochain 10 h
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(10, 0, 0, 0);
  return d;
}

/** Garde le jour de `day` et l'heure de `time` */
function merge(day: Date, time: Date) {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}

/** Créer un événement ou rassemblement (visible par tous les membres, sur la carte et dans Sorties). */
export default function NewEventScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const params = useLocalSearchParams<{ label?: string; lat?: string; lng?: string; club?: string }>();
  const [clubId, setClubId] = useState<string | null>(params.club ?? null);
  const [place, setPlace] = useState<Place | null>(() => {
    const latitude = Number(params.lat);
    const longitude = Number(params.lng);
    return params.lat && params.lng && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { label: params.label || `Point ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude }
      : null;
  });
  const [kind, setKind] = useState<EventKind>('rassemblement');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(defaultStart);
  const [hasEnd, setHasEnd] = useState(false);
  const [end, setEnd] = useState(() => new Date(defaultStart().getTime() + 4 * 3600 * 1000));
  const [max, setMax] = useState('');
  const [photo, setPhoto] = useState<PhotoValue>({ path: null, localUri: null });
  const [organizer, setOrganizer] = useState('');
  const [link, setLink] = useState('');
  const [price, setPrice] = useState<PriceKind | null>(null);
  const [priceText, setPriceText] = useState('');
  const [saving, setSaving] = useState(false);

  if (!session) return null;

  const submit = async () => {
    const errors: string[] = [];
    const maxAttendees = max.trim() ? Number(max) : null;
    if (title.trim().length < 3) errors.push('Donne un titre (3 caractères au moins).');
    if (!place) errors.push('Choisis le lieu.');
    if (start.getTime() < Date.now() - 3600 * 1000) errors.push('La date de début est déjà passée.');
    if (hasEnd && end.getTime() < start.getTime()) errors.push('La fin doit être après le début.');
    if (hasEnd && end.getTime() - start.getTime() > 14 * 24 * 3600 * 1000) errors.push('Un événement dure 14 jours au plus.');
    if (maxAttendees !== null && (!Number.isInteger(maxAttendees) || maxAttendees < 2)) errors.push('Nombre de places : 2 au moins.');
    try {
      normalizeLink(link);
    } catch (e) {
      errors.push((e as Error).message);
    }
    if (errors.length) {
      Alert.alert('À compléter', errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const id = await createEvent(session.user.id, {
        kind,
        title,
        description,
        startsAt: start,
        endsAt: hasEnd ? end : null,
        place: place!,
        maxAttendees,
        photo,
        clubId,
        linkUrl: link,
        priceKind: price,
        priceText,
        organizerLabel: organizer,
      });
      router.replace({ pathname: '/event/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Création impossible', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Titre" required value={title} onChangeText={setTitle} maxLength={100} placeholder="ex. Rassemblement du Vieux-Port" />
        <ClubPicker userId={session.user.id} value={clubId} onChange={setClubId} />
        <Section title="Type">
          <View style={styles.chips}>
            {EVENT_KINDS.map((k) => (
              <Chip key={k.value} label={`${k.emoji} ${k.label}`} selected={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </View>
        </Section>
        <Section title="Quand">
          <View style={styles.row}>
            <View style={styles.col}>
              <DateTimeField label="Début" mode="date" value={start} onChange={(d) => setStart(merge(d, start))} minimumDate={new Date()} />
            </View>
            <View style={styles.colSmall}>
              <DateTimeField label="Heure" mode="time" value={start} onChange={(t) => setStart(merge(start, t))} />
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Date de fin</Text>
            <Switch value={hasEnd} onValueChange={setHasEnd} trackColor={{ true: Colors.accent }} />
          </View>
          {hasEnd && (
            <View style={styles.row}>
              <View style={styles.col}>
                <DateTimeField label="Fin" mode="date" value={end} onChange={(d) => setEnd(merge(d, end))} minimumDate={start} />
              </View>
              <View style={styles.colSmall}>
                <DateTimeField label="Heure" mode="time" value={end} onChange={(t) => setEnd(merge(end, t))} />
              </View>
            </View>
          )}
        </Section>
        <PlaceField
          label="Lieu"
          required
          value={place}
          placeholder="Choisir le lieu"
          onPress={async () => {
            const p = await pickPlace({ title: 'Lieu de l’événement', initial: place });
            if (p) setPlace(p);
          }}
        />
        <Field
          label="Programme"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
          placeholder="Horaires, animations, tarif, équipement…"
          style={styles.description}
        />
        <Field label="Organisateur" value={organizer} onChangeText={setOrganizer} maxLength={80} placeholder="ex. Moto Club du Var (sinon ton pseudo)" />
        <Field
          label="Lien (site, billetterie, page de l’événement)"
          value={link}
          onChangeText={setLink}
          maxLength={300}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://"
        />
        <Section title="Entrée (pour info)">
          <View style={styles.chips}>
            <Chip label="Non précisé" selected={price === null} onPress={() => setPrice(null)} />
            <Chip label="Gratuit" selected={price === 'free'} onPress={() => setPrice('free')} />
            <Chip label="Payant" selected={price === 'paid'} onPress={() => setPrice('paid')} />
          </View>
          {price === 'paid' && <Field label="Tarif" value={priceText} onChangeText={setPriceText} maxLength={60} placeholder="ex. 10 € l’entrée, gratuit pour les passagers" />}
        </Section>
        <Field label="Nombre de places" value={max} onChangeText={setMax} keyboardType="number-pad" maxLength={6} placeholder="Illimité" />
        <PhotoPicker shape="wide" label="Affiche ou photo (facultatif)" value={photo} onChange={setPhoto} />
        <Text style={styles.hint}>
          Visible par tous les membres, sur la carte et dans l’Agenda. Pour ton premier événement, l’équipe jette un œil avant
          (en attendant, tes amis le voient déjà). Gardé dans les archives 1 an après la fin.
        </Text>
        <Button title="Créer l’événement" loading={saving} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 2 },
  colSmall: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: Type.body, fontWeight: '600', color: Colors.text },
  description: { minHeight: 90, textAlignVertical: 'top' },
  hint: { fontSize: Type.small, color: Colors.textMuted },
}));
