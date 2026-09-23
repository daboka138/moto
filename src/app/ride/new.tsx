import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateTimeField, PlaceField } from '@/components/form-fields';
import { LeafletMap } from '@/components/leaflet-map';
import { ridePins } from '@/components/ride-view';
import { Button, Chip, Field, Section } from '@/components/ui';
import { Colors } from '@/constants/theme';
import type { Place } from '@/lib/geocoding';
import { pickPlace } from '@/lib/place-picker';
import { createRide, RIDE_LEVELS, RIDE_VISIBILITIES, type RideLevel, type RideVisibility } from '@/lib/rides';
import { computeRoute, formatDistance, formatDuration, type ComputedRoute } from '@/lib/routing';
import { useSession } from '@/lib/session';

const MAX_WAYPOINTS = 8;

function defaultMeetingAt() {
  // Demain 9 h
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export default function NewRideScreen() {
  const { session } = useSession();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [waypoints, setWaypoints] = useState<Place[]>([]);
  const [meeting, setMeeting] = useState<Place | null>(null);
  const [meetingAt, setMeetingAt] = useState(defaultMeetingAt);
  const [level, setLevel] = useState<RideLevel>('tranquille');
  const [visibility, setVisibility] = useState<RideVisibility>('public');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Tracé recalculé dès que départ, arrivée ou étapes changent
  const stops = start && end ? [start, ...waypoints, end] : null;
  const stopsKey = stops ? JSON.stringify(stops.map((s) => [s.latitude, s.longitude])) : null;
  const [route, setRoute] = useState<{ key: string; route: ComputedRoute } | null>(null);
  const currentRoute = route && route.key === stopsKey ? route.route : null;

  useEffect(() => {
    if (!stopsKey) return;
    const points = (JSON.parse(stopsKey) as [number, number][]).map(([latitude, longitude]) => ({ latitude, longitude }));
    let cancelled = false;
    computeRoute(points)
      .then((r) => !cancelled && setRoute({ key: stopsKey, route: r }))
      .catch((e) => console.warn('Calcul du tracé impossible', e));
    return () => {
      cancelled = true;
    };
  }, [stopsKey]);

  if (!session) return null;
  const near = start ?? meeting ?? null;

  const choose = async (label: string, setter: (p: Place) => void, initial?: Place | null) => {
    const place = await pickPlace({ title: label, initial: initial ?? near });
    if (place) setter(place);
  };

  const setDatePart = (d: Date) =>
    setMeetingAt((prev) => {
      const next = new Date(prev);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      return next;
    });
  const setTimePart = (d: Date) =>
    setMeetingAt((prev) => {
      const next = new Date(prev);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      return next;
    });

  const submit = async () => {
    const errors: string[] = [];
    if (!title.trim()) errors.push('Donne un titre à la balade.');
    if (!start || !end) errors.push('Choisis un départ et une arrivée.');
    if (!meeting && !start) errors.push('Choisis un point de regroupement.');
    if (meetingAt.getTime() < Date.now()) errors.push("L'heure de regroupement est déjà passée.");
    const max = maxParticipants.trim() ? Number(maxParticipants) : null;
    if (max !== null && (!Number.isInteger(max) || max < 2 || max > 100))
      errors.push('Nombre max de participants : entre 2 et 100.');
    if (start && end && !currentRoute) errors.push('Le tracé est encore en cours de calcul, patiente une seconde.');
    if (errors.length) {
      Alert.alert('À compléter', errors.join('\n'));
      return;
    }

    setSaving(true);
    try {
      const id = await createRide(session.user.id, {
        title,
        start: start!,
        end: end!,
        waypoints,
        route: currentRoute!,
        meeting: meeting ?? start!,
        meetingAt,
        level,
        visibility,
        maxParticipants: max,
        description,
      });
      router.replace({ pathname: '/ride/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Création impossible', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const pins = ridePins({ start, end, waypoints, meeting: meeting ?? start });
  const previewPoints = currentRoute?.points ?? pins.filter((p) => p.kind !== 'meeting').map((p) => [p.latitude, p.longitude] as [number, number]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Titre" required value={title} onChangeText={setTitle} placeholder="ex. Tour des Calanques" maxLength={80} />

        <Section title="Itinéraire">
          <PlaceField
            label="Départ (A)"
            required
            color="#16A34A"
            value={start}
            placeholder="Choisir le point de départ"
            onPress={() => choose('Point de départ', setStart, start)}
          />
          {waypoints.map((w, i) => (
            <PlaceField
              key={i}
              label={`Étape ${i + 1}`}
              color="#52525B"
              value={w}
              placeholder=""
              onPress={() => choose(`Étape ${i + 1}`, (p) => setWaypoints((ws) => ws.map((x, j) => (j === i ? p : x))), w)}
              onClear={() => setWaypoints((ws) => ws.filter((_, j) => j !== i))}
            />
          ))}
          {waypoints.length < MAX_WAYPOINTS && (
            <Pressable
              style={styles.addStep}
              onPress={() => choose(`Étape ${waypoints.length + 1}`, (p) => setWaypoints((ws) => [...ws, p]))}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
              <Text style={styles.addStepText}>Ajouter une étape</Text>
            </Pressable>
          )}
          <PlaceField
            label="Arrivée (B)"
            required
            color="#DC2626"
            value={end}
            placeholder="Choisir le point d'arrivée"
            onPress={() => choose("Point d'arrivée", setEnd, end)}
          />

          {start && end && (
            <>
              <View style={styles.preview}>
                <LeafletMap
                  position={null}
                  pins={pins}
                  routes={[{ id: 'route', points: previewPoints }]}
                  fitPoints={previewPoints.map(([latitude, longitude]) => ({ latitude, longitude }))}
                />
              </View>
              {currentRoute ? (
                <Text style={styles.routeInfo}>
                  {formatDistance(currentRoute.distanceM)} · environ {formatDuration(currentRoute.durationS)}
                  {!currentRoute.onRoads && ' (estimation, calcul d’itinéraire indisponible)'}
                </Text>
              ) : (
                <View style={styles.computing}>
                  <ActivityIndicator color={Colors.accent} size="small" />
                  <Text style={styles.routeInfoMuted}>Calcul du tracé…</Text>
                </View>
              )}
            </>
          )}
        </Section>

        <Section title="Regroupement">
          <PlaceField
            label="Point de regroupement"
            required
            value={meeting ?? start}
            placeholder="Par défaut : le point de départ"
            onPress={() => choose('Point de regroupement', setMeeting, meeting ?? start)}
            onClear={meeting ? () => setMeeting(null) : undefined}
          />
          <View style={styles.row}>
            <View style={styles.col}>
              <DateTimeField label="Date" mode="date" value={meetingAt} onChange={setDatePart} minimumDate={new Date()} />
            </View>
            <View style={styles.colSmall}>
              <DateTimeField label="Heure" mode="time" value={meetingAt} onChange={setTimePart} />
            </View>
          </View>
        </Section>

        <Section title="Détails">
          <Text style={styles.label}>Niveau</Text>
          <View style={styles.chips}>
            {RIDE_LEVELS.map((l) => (
              <Chip key={l.value} label={l.label} selected={level === l.value} onPress={() => setLevel(l.value)} />
            ))}
          </View>

          <Text style={styles.label}>Visibilité</Text>
          <View style={styles.chips}>
            {RIDE_VISIBILITIES.map((v) => (
              <Chip key={v.value} label={v.label} selected={visibility === v.value} onPress={() => setVisibility(v.value)} />
            ))}
          </View>
          <Text style={styles.hint}>{RIDE_VISIBILITIES.find((v) => v.value === visibility)?.description}</Text>

          <Field
            label="Nombre max de participants"
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="Illimité"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
            placeholder="Programme, pauses, équipement conseillé…"
            style={styles.description}
          />
        </Section>

        <View style={styles.note}>
          <Ionicons name="people" size={18} color={Colors.textMuted} />
          <Text style={styles.noteText}>
            Le jour J, démarre la balade depuis sa fiche : les participants se verront alors sur la carte, même en
            mode fantôme, jusqu’à ce que tu la termines.
          </Text>
        </View>

        <Button title="Créer la balade" onPress={submit} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  addStep: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  addStepText: { color: Colors.accent, fontWeight: '700', fontSize: 15 },
  preview: { height: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.border },
  routeInfo: { fontSize: 15, fontWeight: '700', color: Colors.text },
  routeInfoMuted: { fontSize: 14, color: Colors.textMuted },
  computing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 2 },
  colSmall: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 13, color: Colors.textMuted, marginTop: -6 },
  description: { minHeight: 90, textAlignVertical: 'top' },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  noteText: { flex: 1, fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
});
