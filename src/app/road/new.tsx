import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExpandableMap } from '@/components/expandable-map';
import { TipBubble } from '@/components/guide/tip-bubble';
import { LeafletMap } from '@/components/leaflet-map';
import type { MapPin, MapRoute } from '@/components/map-types';
import { CriteriaInput, PhotosInput } from '@/components/road-criteria';
import { Button, Field, Section } from '@/components/ui';
import { makeStyles, Radius, RoadRatingColors, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import type { LatLng } from '@/lib/geo';
import { trackLengthM } from '@/lib/gpx';
import { createRoad, takePendingRoad } from '@/lib/places';
import type { PhotoValue } from '@/lib/profile';
import { criteriaComplete, nearestIndex, ROAD_MIN_M, sliceLine, type RoadCriteria } from '@/lib/road-rules';
import { computeRoute, formatDistance } from '@/lib/routing';
import { useSession } from '@/lib/session';
import { readTrack, useTrips } from '@/lib/trips';

type Mode = 'choose' | 'pick' | 'draw';

const toLine = (pts: LatLng[]) => pts.map((p) => [p.latitude, p.longitude] as [number, number]);

/**
 * Noter une route plaisir : portion choisie sur un de mes trajets / une boucle / une balade
 * (toucher le début puis la fin sur le tracé), ou tracée sur la carte (points touchés, route
 * calculée entre eux). Puis les 4 critères (virages, revêtement, paysage, trafic), avis, photos.
 */
export default function NewRoadScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const params = useLocalSearchParams<{ trip?: string }>();
  const trips = useTrips();
  const withTrack = trips.filter((t) => t.hasTrack);

  // Tracé de départ : boucle / balade / sortie (en attente), ou trajet de « Mes trajets »
  const [pending] = useState(() => takePendingRoad());
  const [base, setBase] = useState<LatLng[] | null>(() => pending?.line ?? (params.trip ? readTrack(params.trip) : null));
  const [mode, setMode] = useState<Mode>(base ? 'pick' : 'choose');
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  // Tracé à la main
  const [stops, setStops] = useState<LatLng[]>([]);
  const [drawn, setDrawn] = useState<LatLng[] | null>(null);
  const [routing, setRouting] = useState(false);
  const routeSeq = useRef(0);
  const [me, setMe] = useState<LatLng | null>(null);

  const [step, setStep] = useState<'select' | 'form'>('select');
  const [name, setName] = useState(pending?.name ?? '');
  const [description, setDescription] = useState(pending?.description ?? '');
  const [criteria, setCriteria] = useState<Partial<RoadCriteria>>({});
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<PhotoValue[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Location.getLastKnownPositionAsync()
      .then((p) => p && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
      .catch(() => {});
  }, []);

  // Route calculée entre les points touchés (un calcul à la fois, le dernier gagne)
  const updateStops = (next: LatLng[]) => {
    setStops(next);
    const seq = ++routeSeq.current;
    if (next.length < 2) {
      setDrawn(null);
      setRouting(false);
      return;
    }
    setRouting(true);
    computeRoute(next)
      .then((r) => seq === routeSeq.current && setDrawn(r.points.map(([latitude, longitude]) => ({ latitude, longitude }))))
      .catch((e) => seq === routeSeq.current && Alert.alert('Oups', errorMessage(e)))
      .finally(() => seq === routeSeq.current && setRouting(false));
  };

  const selection = useMemo(() => {
    if (mode === 'draw') return drawn;
    if (!base) return null;
    if (a === null || b === null) return null;
    return sliceLine(base, a, b);
  }, [mode, drawn, base, a, b]);
  const lengthM = selection ? trackLengthM(selection) : 0;

  if (!session) return null;

  const onMapPress = (p: LatLng) => {
    if (mode === 'draw') {
      if (stops.length >= 10) return;
      updateStops([...stops, p]);
      return;
    }
    if (!base) return;
    const i = nearestIndex(base, p);
    if (a === null || b !== null) {
      setA(i);
      setB(null);
    } else setB(i);
  };

  const routes: MapRoute[] = [
    ...(mode === 'pick' && base ? [{ id: 'base', points: toLine(base), color: Colors.textFaint, muted: true }] : []),
    ...(selection ? [{ id: 'sel', points: toLine(selection), color: RoadRatingColors.selection }] : []),
  ];
  const pins: MapPin[] =
    mode === 'draw'
      ? stops.map((s, i) => ({ id: `s${i}`, kind: i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'step', label: String(i + 1), ...s }))
      : base
        ? [
            ...(a !== null ? [{ id: 'a', kind: 'start' as const, label: 'Début', ...base[a] }] : []),
            ...(b !== null ? [{ id: 'b', kind: 'end' as const, label: 'Fin', ...base[b] }] : []),
          ]
        : [];

  const next = () => {
    if (!selection || lengthM < ROAD_MIN_M) {
      Alert.alert('Portion trop courte', `Choisis au moins ${formatDistance(ROAD_MIN_M)} de route.`);
      return;
    }
    setStep('form');
  };

  const submit = async () => {
    const errors: string[] = [];
    if (name.trim().length < 2) errors.push('Donne un nom à la route (ex. « Route des Crêtes »).');
    if (!criteriaComplete(criteria)) errors.push('Note les 4 critères.');
    if (errors.length) {
      Alert.alert('À compléter', errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const id = await createRoad(session.user.id, {
        name,
        description,
        line: selection!,
        criteria: criteria as RoadCriteria,
        body,
        photos,
      });
      router.replace({ pathname: '/place/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
      setSaving(false);
    }
  };

  // ---------- Choix de la source ----------
  if (mode === 'choose') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Noter une route' }} />
        <TipBubble id="routes-plaisir" />
        <Text style={styles.intro}>
          Une route qui t’a régalé ? Note-la pour les copains : virages, revêtement, paysage et trafic. Jamais de vitesse ici, juste
          le plaisir de rouler, dans le respect du code de la route.
        </Text>
        <Pressable style={styles.choice} onPress={() => setMode('draw')}>
          <Ionicons name="create-outline" size={26} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.choiceTitle}>Tracer sur la carte</Text>
            <Text style={styles.small}>Touche le départ, les passages puis l’arrivée : la route se dessine toute seule.</Text>
          </View>
        </Pressable>
        <Section title="Depuis un de mes trajets">
          {withTrack.length === 0 ? (
            <Text style={styles.small}>
              {Platform.OS === 'web'
                ? 'Tes trajets sont enregistrés par l’appli Android pendant la navigation.'
                : 'Aucun trajet avec sa trace pour l’instant. Lance une navigation : tes trajets apparaîtront ici.'}
            </Text>
          ) : (
            withTrack.slice(0, 15).map((t) => (
              <Pressable
                key={t.id}
                style={styles.trip}
                onPress={() => {
                  const track = readTrack(t.id);
                  if (!track || track.length < 2) {
                    Alert.alert('Oups', 'La trace de ce trajet n’est plus disponible.');
                    return;
                  }
                  setBase(track);
                  setMode('pick');
                }}>
                <Ionicons name="navigate-outline" size={20} color={Colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripTitle} numberOfLines={1}>
                    {t.destination}
                  </Text>
                  <Text style={styles.small}>
                    {new Date(t.startedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {formatDistance(t.distanceM)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </Pressable>
            ))
          )}
        </Section>
      </ScrollView>
    );
  }

  // ---------- Formulaire ----------
  if (step === 'form' && selection) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Stack.Screen options={{ title: 'Noter la route' }} />
        <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ExpandableMap
            style={styles.miniMap}
            position={null}
            routes={[{ id: 'sel', points: toLine(selection), color: RoadRatingColors.selection }]}
            fitPoints={selection}
            title={name || 'Route plaisir'}
            subtitle={formatDistance(lengthM)}
          />
          <Pressable onPress={() => setStep('select')} hitSlop={6}>
            <Text style={styles.link}>{formatDistance(lengthM)} · modifier la portion</Text>
          </Pressable>
          <Field label="Nom de la route" required value={name} onChangeText={setName} maxLength={80} placeholder="ex. Route des Crêtes, D952 Gorges du Verdon" />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
            placeholder="Par où passer, le bon sens, la pause café…"
            style={styles.multiline}
          />
          <Section title="Ta note">
            <CriteriaInput value={criteria} onChange={setCriteria} />
          </Section>
          <Field label="Ton avis" value={body} onChangeText={setBody} multiline maxLength={500} placeholder="Ce qui la rend géniale, les pièges à connaître…" style={styles.multiline} />
          <Section title="Photos (4 au plus)">
            <PhotosInput value={photos} onChange={setPhotos} max={4} />
          </Section>
          <Text style={styles.small}>
            La route sera visible par tous les membres, qui pourront la noter à leur tour. Un avis signalé par 3 membres est masqué.
            Roule toujours dans le respect du code de la route.
          </Text>
          <Button title="Publier la route" icon="checkmark" loading={saving} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---------- Choix de la portion / tracé ----------
  const help =
    mode === 'draw'
      ? stops.length === 0
        ? 'Touche le départ de la route sur la carte.'
        : stops.length === 1
          ? 'Touche maintenant l’arrivée (ou un passage).'
          : 'Ajoute des passages pour suivre la bonne route, ou continue.'
      : a === null
        ? 'Touche le début de la portion sur ton tracé (en gris).'
        : b === null
          ? 'Touche maintenant la fin de la portion.'
          : 'Touche à nouveau pour recommencer.';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: mode === 'draw' ? 'Tracer la route' : 'Choisir la portion' }} />
      <View style={{ flex: 1 }}>
        <LeafletMap
          position={null}
          routes={routes}
          pins={pins}
          onMapPress={onMapPress}
          fitPoints={base ?? undefined}
          defaultView={me ? { ...me, zoom: 12 } : null}
        />
      </View>
      <View style={styles.panel}>
        <Text style={styles.help}>{help}</Text>
        <View style={styles.panelRow}>
          {routing ? <ActivityIndicator color={Colors.accent} /> : null}
          <Text style={styles.length}>{selection ? formatDistance(lengthM) : ' '}</Text>
          {mode === 'draw' && stops.length > 0 && (
            <Pressable onPress={() => updateStops(stops.slice(0, -1))} hitSlop={8} style={styles.undo}>
              <Ionicons name="arrow-undo" size={18} color={Colors.accent} />
              <Text style={styles.link}>Annuler le dernier point</Text>
            </Pressable>
          )}
          {mode === 'pick' && base && (
            <Pressable
              onPress={() => {
                setA(0);
                setB(base.length - 1);
              }}
              hitSlop={8}>
              <Text style={styles.link}>Tout le tracé</Text>
            </Pressable>
          )}
        </View>
        <Button title="Continuer" disabled={!selection || routing} onPress={next} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  intro: { fontSize: Type.body, lineHeight: 21, color: Colors.text },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  choiceTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  tripTitle: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
  link: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  miniMap: { height: 200, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.border },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  panel: { padding: 16, gap: 12, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  help: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  length: { flex: 1, fontSize: Type.large, fontWeight: '900', color: Colors.text },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));
