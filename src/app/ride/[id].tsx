import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { RideView } from '@/components/ride-view';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  canStartNow,
  deleteRide,
  endRide,
  fetchRide,
  joinRide,
  leaveRide,
  startRide,
  type RideDetails,
} from '@/lib/rides';
import { useSession } from '@/lib/session';

export default function RideScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const [loaded, setLoaded] = useState<{ id: string; ride: RideDetails | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoaded({ id, ride: await fetchRide(id, userId) });
    } catch (e) {
      console.warn('Chargement de la balade impossible', e);
      setLoaded({ id, ride: null });
    }
  }, [id, userId]);

  // Rechargée à chaque affichage (retour de l'écran d'invitation, etc.)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const ride = loaded?.id === id ? loaded.ride : undefined;

  if (ride === undefined || !userId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (ride === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Balade introuvable ou réservée à ses invités.</Text>
      </View>
    );
  }

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    try {
      await action();
      if (after) after();
      else await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const isOrganizer = ride.organizer.id === userId;
  const full = ride.maxParticipants !== null && ride.participantsCount >= ride.maxParticipants;
  const canJoin = !ride.joined && ride.status !== 'ended' && (ride.invited || ride.visibility !== 'private');

  const confirmJoin = () =>
    Alert.alert(
      'Participer à la balade',
      'Pendant la balade, les autres participants verront ta position sur la carte, même si tu es en mode fantôme.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Je participe', onPress: () => run(() => joinRide(ride.id, userId, ride.invited)) },
      ],
    );

  const confirmLeave = () =>
    Alert.alert('Se désister', 'Tu ne participeras plus à cette balade.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Me désister', style: 'destructive', onPress: () => run(() => leaveRide(ride.id, userId)) },
    ]);

  const confirmStart = () =>
    Alert.alert('Démarrer la balade', 'Les participants vont se voir sur la carte jusqu’à la fin de la balade.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Démarrer', onPress: () => run(() => startRide(ride.id)) },
    ]);

  const confirmEnd = () =>
    Alert.alert('Terminer la balade', 'Les participants ne se verront plus (selon leurs réglages habituels).', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', onPress: () => run(() => endRide(ride.id)) },
    ]);

  const confirmDelete = () =>
    Alert.alert('Supprimer la balade', 'La balade et toutes les inscriptions seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => run(() => deleteRide(ride.id), () => router.back()) },
    ]);

  const actions = (
    <View style={styles.actions}>
      {ride.status === 'live' && ride.joined && (
        <Button title="Voir les participants sur la carte" onPress={() => router.navigate('/')} />
      )}

      {isOrganizer ? (
        <>
          {ride.status === 'upcoming' && canStartNow(ride.meetingAt) && (
            <Button title="Démarrer la balade" loading={busy} onPress={confirmStart} />
          )}
          {ride.status === 'upcoming' && !canStartNow(ride.meetingAt) && (
            <Text style={styles.hint}>Tu pourras démarrer la balade le jour J, 2 h avant le regroupement.</Text>
          )}
          {ride.status === 'live' && <Button title="Terminer la balade" loading={busy} onPress={confirmEnd} />}
          {ride.status !== 'ended' && (
            <Button
              title="Inviter des amis"
              variant="secondary"
              onPress={() => router.push({ pathname: '/ride/invite', params: { id: ride.id } })}
            />
          )}
          <Button title="Supprimer la balade" variant="ghost" onPress={confirmDelete} />
        </>
      ) : ride.joined ? (
        ride.status !== 'ended' && <Button title="Je me désiste" variant="secondary" loading={busy} onPress={confirmLeave} />
      ) : canJoin ? (
        full ? (
          <Button title="Complet" variant="secondary" disabled onPress={() => {}} />
        ) : (
          <Button title={ride.invited ? 'Tu es invité · Je participe' : 'Je participe'} loading={busy} onPress={confirmJoin} />
        )
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <RideView
        ride={ride}
        actions={actions}
        onPersonPress={(pid) => pid !== userId && router.push({ pathname: '/user/[id]', params: { id: pid } })}
      />
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, textAlign: 'center' },
  actions: { gap: 10 },
  hint: { fontSize: 13, color: Colors.textMuted },
}));
