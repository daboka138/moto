import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { LeafletMap } from '@/components/leaflet-map';
import { OpenInApp } from '@/components/open-in-app';
import { Button, Chip } from '@/components/ui';
import { TipBubble } from '@/components/guide/tip-bubble';
import { makeStyles, useColors } from '@/constants/theme';
import { IS_WEB } from '@/lib/app-link';
import type { LatLng } from '@/lib/geo';
import { setPendingGpx } from '@/lib/gpx';
import {
  CURVINESS,
  curvinessLabel,
  generateLoops,
  LOOP_DISTANCES_KM,
  LOOP_DURATIONS_MIN,
  type Curviness,
  type Loop,
  type LoopTarget,
} from '@/lib/loop';
import { mainCategory } from '@/lib/profile';
import { loopAttractors } from '@/lib/scenic';
import { formatDistance } from '@/lib/routing';
import { useSession } from '@/lib/session';
import { FeatureGate } from '@/components/feature-gate';
import { PlaceField } from '@/components/form-fields';
import { PartnerIdeas } from '@/components/partner-ideas';
import { SpotSuggestions } from '@/components/spot-suggestions';
import type { Place } from '@/lib/geocoding';
import { pickPlace } from '@/lib/place-picker';

const ORIGIN_TITLE = 'Lieu de départ de la boucle';

const durationLabel = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`);

/**
 * « Fais-moi une boucle » : 2-3 boucles avec un score de sinuosité, qui partent et reviennent au lieu
 * de départ (ma position par défaut, ou une adresse, un favori, un spot, un point de la carte).
 */
function LoopScreenContent() {
  const Colors = useColors();
  const styles = useStyles();
  const { profile } = useSession();
  const scooter50 = mainCategory(profile) === 'cyclo';
  const [me, setMe] = useState<LatLng | null>(null);
  // Lieu de départ choisi (null = ma position)
  const [origin, setOrigin] = useState<Place | null>(null);
  const [locError, setLocError] = useState(false);
  const [mode, setMode] = useState<'duration' | 'distance'>('duration');
  const [minutes, setMinutes] = useState(90);
  const [km, setKm] = useState(80);
  const [curviness, setCurviness] = useState<Curviness>('twisty');
  const [avoidHighways, setAvoidHighways] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [loops, setLoops] = useState<Loop[] | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (!granted) throw new Error('refusée');
        const last = await Location.getLastKnownPositionAsync();
        const p = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!cancelled) setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      } catch {
        if (cancelled) return;
        // Position refusée ou indisponible (web) : on propose tout de suite de choisir le départ
        setLocError(true);
        const place = await pickPlace({ title: ORIGIN_TITLE, initial: null, suggest: true });
        if (!cancelled && place) setOrigin(place);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start: LatLng | null = origin ?? me;

  async function chooseOrigin(initial: LatLng | null) {
    const place = await pickPlace({ title: ORIGIN_TITLE, initial, suggest: true });
    if (place) changeOrigin(place);
  }

  // « 📍 Ma position » choisi dans le sélecteur = revenir au suivi de ma position
  function changeOrigin(place: Place | null) {
    setOrigin(place && me && place.label === '📍 Ma position' ? null : place);
    setLoops(null);
  }

  const generate = async () => {
    if (!start) return;
    const target: LoopTarget = mode === 'duration' ? { kind: 'duration', minutes } : { kind: 'distance', km };
    setProgress(0);
    setLoops(null);
    try {
      // Cols / routes réputés et spots bien notés autour du départ (rien de bloquant si indisponible)
      const attractors = await loopAttractors(start).catch(() => []);
      const result = await generateLoops({ start, target, curviness, avoidHighways, scooter50, attractors }, (done, total) =>
        setProgress(done / total),
      );
      setLoops(result);
      setSelected(0);
    } catch (e) {
      Alert.alert('Boucle impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const loop = loops?.[selected] ?? null;
  const title = (l: Loop) => `Boucle ${curvinessLabel(l.score).toLowerCase()} · ${formatDistance(l.route.distanceM)}`;

  // Navigation / création de balade : même chemin que l'import GPX (tracé + points de passage)
  const handOff = (l: Loop) => setPendingGpx({ name: title(l), points: l.route.points, waypoints: [] });

  const go = (l: Loop) => {
    handOff(l);
    router.navigate({ pathname: '/', params: { gpx: String(Date.now()) } });
  };

  // Le lieu de départ choisi devient le point de rendez-vous de la balade (ma position : le départ du tracé)
  const createRide = (l: Loop) => {
    handOff(l);
    const meeting = origin
      ? { role: 'meeting', label: origin.label, lat: String(origin.latitude), lng: String(origin.longitude) }
      : {};
    router.push({ pathname: '/ride/new', params: { gpx: '1', ...meeting } });
  };

  const saveRoad = (l: Loop) =>
    router.push({
      pathname: '/place/new',
      params: {
        kind: 'road',
        lat: String(start!.latitude),
        lng: String(start!.longitude),
        label: origin?.label ?? 'Départ de la boucle',
        name: title(l),
        description: `Boucle de ${formatDistance(l.route.distanceM)}, environ ${durationLabel(l.durationMin)}, sinuosité ${String(l.score).replace('.', ',')}/10.`,
      },
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TipBubble id="boucle" />
      <PlaceField
        label="Départ"
        value={origin ?? (me ? { label: '📍 Ma position', ...me } : null)}
        placeholder="Choisir le lieu de départ"
        onPress={() => chooseOrigin(start)}
        onClear={origin && me ? () => changeOrigin(null) : undefined}
      />
      <SpotSuggestions title="Départs populaires (pratiques pour donner RDV)" center={me ?? origin} selected={origin} onPick={changeOrigin} />
      <Text style={styles.hint}>La boucle part et revient à ce lieu.</Text>

      <Text style={styles.section}>Durée ou distance</Text>
      <View style={styles.row}>
        <Chip label="⏱️ Durée" selected={mode === 'duration'} onPress={() => setMode('duration')} />
        <Chip label="📏 Distance" selected={mode === 'distance'} onPress={() => setMode('distance')} />
      </View>
      <View style={styles.row}>
        {mode === 'duration'
          ? LOOP_DURATIONS_MIN.map((m) => <Chip key={m} label={durationLabel(m)} selected={minutes === m} onPress={() => setMinutes(m)} />)
          : LOOP_DISTANCES_KM.map((d) => <Chip key={d} label={`${d} km`} selected={km === d} onPress={() => setKm(d)} />)}
      </View>

      <Text style={styles.section}>Virages</Text>
      <View style={styles.row}>
        {CURVINESS.map((c) => (
          <Chip key={c.value} label={`${c.emoji} ${c.label}`} selected={curviness === c.value} onPress={() => setCurviness(c.value)} />
        ))}
      </View>

      <View style={[styles.card, styles.switchRow]}>
        <Text style={styles.label}>Éviter les autoroutes</Text>
        <Switch
          value={avoidHighways || scooter50}
          disabled={scooter50}
          onValueChange={setAvoidHighways}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.white}
        />
      </View>
      {scooter50 && <Text style={styles.hint}>50 cm³ : jamais d’autoroute ni de voie rapide.</Text>}

      {!start ? (
        locError ? (
          <Button title="Choisir le lieu de départ" variant="secondary" onPress={() => chooseOrigin(null)} />
        ) : (
          <View style={styles.progress}>
            <ActivityIndicator color={Colors.accent} />
            <Text style={styles.hint}>Recherche de ta position…</Text>
          </View>
        )
      ) : progress !== null ? (
        <View style={styles.progress}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.hint}>Recherche de belles boucles… {Math.round(progress * 100)} %</Text>
        </View>
      ) : (
        <Button title={loops ? 'Générer d’autres boucles' : 'Générer mes boucles'} onPress={generate} disabled={!start} />
      )}

      {loops && loops.length > 0 && start && (
        <>
          <View style={styles.map}>
            <LeafletMap
              position={null}
              pins={[{ id: 'start', kind: 'start', label: '🏁', latitude: start.latitude, longitude: start.longitude }]}
              routes={loops.map((l, i) => ({
                id: l.id,
                points: l.route.points.map((p) => [p.latitude, p.longitude] as [number, number]),
                ...(i === selected ? {} : { color: Colors.textFaint, muted: true }),
              }))}
              fitPoints={loop?.route.points.filter((_, i) => i % 20 === 0)}
            />
          </View>
          {loops.map((l, i) => (
            <Pressable
              key={l.id}
              style={[styles.card, styles.loopCard, i === selected && styles.loopSelected]}
              onPress={() => setSelected(i)}>
              <Ionicons
                name={i === selected ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={i === selected ? Colors.accent : Colors.textMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  Boucle {i + 1} · {formatDistance(l.route.distanceM)} · ≈ {durationLabel(l.durationMin)}
                </Text>
                <Text style={styles.hint}>
                  Sinuosité {String(l.score).replace('.', ',')}/10 · {curvinessLabel(l.score)}
                  {l.urban != null ? ` · ${Math.round(l.urban * 100)} % en ville` : ''}
                  {l.overlap > 0.15 ? ' · un peu d’aller-retour' : ''}
                </Text>
                {l.offTarget && (
                  <Text style={styles.warn}>Pas de boucle à la durée demandée ici : la plus proche est proposée.</Text>
                )}
              </View>
              <View style={styles.scoreBar}>
                <View style={[styles.scoreFill, { width: `${l.score * 10}%` }]} />
              </View>
            </Pressable>
          ))}
          {loop && (
            <View style={styles.actions}>
              {IS_WEB ? <OpenInApp path="/loop" compact /> : <Button title="Partir" onPress={() => go(loop)} />}
              <Button title="Créer une balade (inviter des amis)" variant="secondary" onPress={() => createRide(loop)} />
              <Button title="Enregistrer comme belle route" variant="ghost" onPress={() => saveRoad(loop)} />
            </View>
          )}
          <Text style={styles.credit}>Itinéraires : Valhalla (OpenStreetMap). Durée estimée selon la sinuosité.</Text>
        </>
      )}

      <PartnerIdeas near={start} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 13, color: Colors.textMuted },
  warn: { fontSize: 12, color: Colors.warning, fontWeight: '700' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  map: { height: 280, borderRadius: 16, overflow: 'hidden' },
  loopCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: Colors.surface },
  loopSelected: { borderColor: Colors.accent },
  scoreBar: { width: 50, height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  scoreFill: { height: '100%', backgroundColor: Colors.warning },
  actions: { gap: 8 },
  credit: { fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
}));

export default function LoopScreen() {
  return (
    <FeatureGate feature="loop">
      <LoopScreenContent />
    </FeatureGate>
  );
}
