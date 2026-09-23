import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { RideView } from '@/components/ride-view';
import { Button } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useDemoMode } from '@/demo/demo-context';
import { demoRide } from '@/demo/rides';
import { DEMO_LIVE_RIDE_ID } from '@/demo/social';
import { photoUrl } from '@/lib/profile';
import { computeRoute, type ComputedRoute } from '@/lib/routing';
import { useSession } from '@/lib/session';

// Tracés calculés une seule fois par balade de démo
const routeCache = new Map<string, ComputedRoute>();

/** Fiche d'une balade de démo (mêmes écrans que les vraies, données locales). */
export default function DemoRideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demo = useDemoMode();
  const { session, profile } = useSession();
  const [route, setRoute] = useState<{ id: string; route: ComputedRoute } | null>(() => {
    const cached = routeCache.get(id);
    return cached ? { id, route: cached } : null;
  });

  const me = {
    id: session?.user.id ?? 'me',
    username: profile?.username ?? 'moi',
    avatarUrl: profile ? photoUrl(profile.avatar_path) : '',
  };
  const ride = demoRide(id, demo, me);
  const stopsKey = ride ? JSON.stringify([ride.start, ...ride.waypoints, ride.end]) : null;

  useEffect(() => {
    if (!stopsKey || routeCache.has(id)) return;
    let cancelled = false;
    computeRoute(JSON.parse(stopsKey)).then((r) => {
      routeCache.set(id, r);
      if (!cancelled) setRoute({ id, route: r });
    });
    return () => {
      cancelled = true;
    };
  }, [id, stopsKey]);

  if (!ride) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Balade introuvable.</Text>
      </View>
    );
  }

  const computed = route?.id === id ? route.route : null;
  const details = computed
    ? { ...ride, route: computed.points, distanceM: computed.distanceM, durationS: computed.durationS }
    : ride;
  const full = ride.maxParticipants !== null && ride.participantsCount >= ride.maxParticipants;
  const canJoin = !ride.joined && ride.status !== 'ended' && (ride.invited || ride.visibility !== 'private');

  const join = () =>
    Alert.alert(
      'Participer à la balade',
      'Pendant la balade, les autres participants verront ta position sur la carte, même si tu es en mode fantôme.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Je participe', onPress: () => demo.joinRide(ride.id) },
      ],
    );

  const leave = () =>
    Alert.alert('Se désister', 'Tu ne participeras plus à cette balade.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Me désister', style: 'destructive', onPress: () => demo.leaveRide(ride.id) },
    ]);

  const actions = (
    <View style={styles.actions}>
      {ride.status === 'live' && ride.joined && (
        <Button title="Voir les participants sur la carte" onPress={() => router.navigate('/')} />
      )}
      {ride.joined ? (
        <Button title="Je me désiste" variant="secondary" onPress={leave} />
      ) : canJoin ? (
        full ? (
          <Button title="Complet" variant="secondary" disabled onPress={() => {}} />
        ) : (
          <Button title={ride.invited ? 'Tu es invité · Je participe' : 'Je participe'} onPress={join} />
        )
      ) : null}
      {ride.id === DEMO_LIVE_RIDE_ID && (
        <Text style={styles.hint}>
          Démo : Julie est en mode fantôme mais tu la vois sur la carte tant que cette balade est en cours et que tu y
          participes.
        </Text>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <RideView
        ride={details}
        actions={actions}
        onPersonPress={(pid) => pid.startsWith('demo-') && router.push({ pathname: '/demo-rider/[id]', params: { id: pid } })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted },
  actions: { gap: 10 },
  hint: { fontSize: 13, color: Colors.textMuted },
});
