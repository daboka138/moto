import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, View } from 'react-native';

import { ExpandableMap } from '@/components/expandable-map';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { IS_WEB } from '@/lib/app-link';
import { setPendingRoad } from '@/lib/places';
import {
  elevationGain,
  openOutingImage,
  outingFromRide,
  outingFromTrip,
  saveOuting,
  shareOutingLink,
  trimEnds,
  useTripReward,
  type OutingDraft,
} from '@/lib/outings';
import { useSession } from '@/lib/session';
import { useTrips } from '@/lib/trips';

const formatDuration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/**
 * « Ta sortie » : récap d'une navigation, d'une boucle (?trip=ID) ou d'une balade (?ride=ID).
 * Tracé, km, durée, dénivelé, participants, points / badges gagnés. Jamais de vitesse.
 */
export default function OutingScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { trip: tripId, ride: rideId } = useLocalSearchParams<{ trip?: string; ride?: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const trips = useTrips();
  const reward = useTripReward(tripId);
  const [draft, setDraft] = useState<OutingDraft | null | undefined>(undefined);
  const [elevation, setElevation] = useState<{ key: string; gain: number | null } | null>(null);
  const [hideEnds, setHideEnds] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ key: string; id: string } | null>(null);

  const trip = tripId ? trips.find((t) => t.id === tripId) : undefined;
  useEffect(() => {
    let cancelled = false;
    if (tripId) {
      Promise.resolve(trip ? outingFromTrip(trip) : null).then((d) => !cancelled && setDraft(d));
    } else if (rideId && userId) {
      outingFromRide(rideId, userId)
        .then((d) => !cancelled && setDraft(d))
        .catch(() => !cancelled && setDraft(null));
    }
    return () => {
      cancelled = true;
    };
  }, [tripId, rideId, userId, trip]);

  const source = draft?.source;
  useEffect(() => {
    if (!draft || !source) return;
    let cancelled = false;
    elevationGain(draft.track).then((gain) => !cancelled && setElevation({ key: source, gain }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const shown = useMemo(() => (draft ? (hideEnds ? trimEnds(draft.track) : draft.track) : []), [draft, hideEnds]);

  if (draft === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (draft === null) {
    return (
      <View style={styles.center}>
        <Ionicons name="map-outline" size={40} color={Colors.textMuted} />
        <Text style={styles.muted}>Pas de tracé pour cette sortie (trace GPS non gardée ou balade sans itinéraire).</Text>
      </View>
    );
  }

  const gain = elevation && elevation.key === draft.source ? elevation.gain : null;
  const points = reward?.points ?? null;
  const badges = reward?.badges ?? [];
  const saveKey = `${draft.source}:${hideEnds}:${gain}:${points}:${badges.length}`;

  /** Enregistre le récap (une fois par réglage) puis lance l'action */
  const withSaved = async (action: string, fn: (id: string) => void | Promise<void>) => {
    if (!userId) return;
    setBusy(action);
    try {
      const id = saved && saved.key === saveKey ? saved.id : await saveOuting(userId, draft, { hideEnds, elevationGainM: gain, points, badges });
      setSaved({ key: saveKey, id });
      await fn(id);
    } catch (e) {
      Alert.alert('Partage impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const fit = shown.length >= 2 ? shown : draft.track;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>{draft.kind === 'ride' ? 'Balade terminée' : draft.kind === 'loop' ? 'Boucle terminée' : 'Ta sortie'}</Text>
      <Text style={styles.title}>{draft.title}</Text>
      <Text style={styles.muted}>
        {new Date(draft.startedAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </Text>

      <ExpandableMap
        style={styles.map}
        position={null}
        routes={[{ id: 'outing', points: shown.map((p) => [p.latitude, p.longitude] as [number, number]) }]}
        fitPoints={fit}
        title={draft.title}
        subtitle={`${(draft.distanceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km · ${formatDuration(draft.durationS)}`}
      />

      <View style={styles.stats}>
        <Stat value={(draft.distanceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} label="km" />
        <Stat value={formatDuration(draft.durationS)} label="durée" />
        <Stat value={gain !== null ? `${gain.toLocaleString('fr-FR')} m` : '—'} label="dénivelé +" />
        {draft.participants !== null && <Stat value={String(draft.participants)} label="motards" />}
      </View>

      {draft.participantNames.length > 0 && (
        <Text style={styles.text}>Avec {draft.participantNames.map((n) => `@${n}`).join(', ')}</Text>
      )}
      {(points !== null || badges.length > 0) && (
        <View style={styles.reward}>
          {points !== null && <Text style={styles.rewardText}>🛡️ +{points} points de bon comportement</Text>}
          {badges.map((b) => (
            <Text key={b} style={styles.rewardText}>
              Nouveau badge : {b}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Masquer le départ et l’arrivée</Text>
          <Text style={styles.small}>Les 500 premiers et derniers mètres ne sont pas partagés (ton domicile reste secret).</Text>
        </View>
        <Switch
          value={hideEnds}
          onValueChange={setHideEnds}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.white}
          {...(IS_WEB && ({ activeThumbColor: Colors.white } as object))}
        />
      </View>

      <Button title="Partager ma sortie (lien)" loading={busy === 'link'} onPress={() => withSaved('link', (id) => shareOutingLink(id, draft))} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button
            title="Image story"
            variant="secondary"
            loading={busy === 'story'}
            onPress={() => withSaved('story', (id) => openOutingImage(id, 'story'))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Image carrée"
            variant="secondary"
            loading={busy === 'square'}
            onPress={() => withSaved('square', (id) => openOutingImage(id, 'square'))}
          />
        </View>
      </View>
      {draft.track.length >= 2 && (
        <Button
          title="Noter une portion de route"
          icon="star-outline"
          variant="ghost"
          onPress={() => {
            setPendingRoad({ line: draft.track });
            router.push('/road/new');
          }}
        />
      )}
      <Text style={styles.small}>
        Les images s’ouvrent sur passeryder.fr : « Partager l’image » ou « Télécharger », puis publie-la en story. Ni vitesse
        maximale ni vitesse moyenne n’y figurent. Qui a le lien peut voir le récap (tracé, km, durée, ton pseudo).
      </Text>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.small}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: Colors.background },
  kicker: { fontSize: Type.small, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text },
  text: { fontSize: Type.body, color: Colors.text, lineHeight: 21 },
  muted: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center' },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17 },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  map: { height: 280, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface },
  stats: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: Type.large, fontWeight: '900', color: Colors.accent },
  reward: { backgroundColor: Colors.accentSoft, borderRadius: Radius.md, padding: 12, gap: 4 },
  rewardText: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12 },
  row: { flexDirection: 'row', gap: 12 },
}));
