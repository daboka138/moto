import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { RideView } from '@/components/ride-view';
import { Button } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import { useDemoMode } from '@/demo/demo-context';
import { useDemoMessages } from '@/demo/messages';
import { demoRide } from '@/demo/rides';
import { DEMO_LIVE_RIDE_ID } from '@/demo/social';
import { mainCategory, photoUrl } from '@/lib/profile';
import { rideRouteOptions } from '@/lib/rides';
import { computeRoute, type ComputedRoute } from '@/lib/routing';
import { useSession } from '@/lib/session';
import { confirmJoinRide } from '@/lib/join-ride';

// Tracés calculés une seule fois par balade de démo
const routeCache = new Map<string, ComputedRoute>();

/** Fiche d'une balade de démo (mêmes écrans que les vraies, données locales). */
export default function DemoRideScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const demo = useDemoMode();
  const demoMessages = useDemoMessages();
  const { session, profile } = useSession();
  const myCategory = mainCategory(profile);
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
  const routeOptions = ride ? rideRouteOptions(ride.categories, ride.surface) : undefined;
  const stopsKey = ride
    ? JSON.stringify({ stops: [ride.start, ...ride.waypoints, ride.end], options: routeOptions ?? null })
    : null;

  useEffect(() => {
    if (!stopsKey || routeCache.has(id)) return;
    let cancelled = false;
    const parsed = JSON.parse(stopsKey);
    computeRoute(parsed.stops, parsed.options ?? undefined).then((r) => {
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
    confirmJoinRide(ride.categories, myCategory, () => demo.joinRide(ride.id));

  const leave = () =>
    Alert.alert('Se désister', 'Tu ne participeras plus à cette balade.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Me désister', style: 'destructive', onPress: () => demo.leaveRide(ride.id) },
    ]);

  const openChat = () => {
    const riderIds = ride.participants.filter((p) => p.id.startsWith('demo-') && p.status === 'joined').map((p) => p.id);
    const conversationId = demoMessages.openRide(ride.id, ride.title, riderIds);
    router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
  };

  const actions = (
    <View style={styles.actions}>
      {ride.joined && <Button title="💬 Discussion de la balade" onPress={openChat} />}
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
        myCategory={myCategory}
        actions={actions}
        onPersonPress={(pid) => pid.startsWith('demo-') && router.push({ pathname: '/demo-rider/[id]', params: { id: pid } })}
      />
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  muted: { color: Colors.textMuted },
  actions: { gap: 10 },
  hint: { fontSize: 13, color: Colors.textMuted },
}));
