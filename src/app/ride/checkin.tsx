import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { showActionSheet, type SheetOption } from '@/components/action-sheet';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { roleLabel } from '@/lib/convoy';
import {
  canStartNow,
  checkInRide,
  fetchRide,
  formatRideDate,
  RIDE_ROLES,
  setRideRole,
  type RideDetails,
  type RideParticipant,
  type RideRole,
} from '@/lib/rides';
import { useSession } from '@/lib/session';

const REFRESH_MS = 10_000;

/** Qui est au RDV ? Pointage des inscrits, rôles ouvreur / serre-file (organisateur). */
export default function RideCheckInScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const [ride, setRide] = useState<RideDetails | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setRide(await fetchRide(id, userId));
    } catch (e) {
      console.warn('Chargement de la balade impossible', e);
      setRide((r) => r ?? null);
    }
  }, [id, userId]);

  // Liste rafraîchie toutes les 10 s tant que l'écran est affiché
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

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
        <Text style={styles.muted}>Balade introuvable.</Text>
      </View>
    );
  }

  const isOrganizer = ride.organizer.id === userId;
  const joined = ride.participants.filter((p) => p.status === 'joined');
  const present = joined.filter((p) => p.checkedInAt);
  const me = joined.find((p) => p.id === userId);
  const open = canStartNow(ride.meetingAt) && ride.status !== 'ended';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const manage = (p: RideParticipant) => {
    if (!isOrganizer) return;
    const options: SheetOption[] = [];
    if (open) {
      options.push(
        p.checkedInAt
          ? { label: 'Annuler le pointage', onPress: () => run(() => checkInRide(ride.id, p.id, false)) }
          : { label: '✅ Pointer présent', onPress: () => run(() => checkInRide(ride.id, p.id)) },
      );
    }
    (Object.keys(RIDE_ROLES) as RideRole[]).forEach((role) => {
      if (p.role !== role) {
        options.push({
          label: `${RIDE_ROLES[role].emoji} ${RIDE_ROLES[role].label}`,
          onPress: () => run(() => setRideRole(ride.id, p.id, role)),
        });
      }
    });
    if (p.role) options.push({ label: 'Retirer le rôle', destructive: true, onPress: () => run(() => setRideRole(ride.id, p.id, null)) });
    showActionSheet({ title: p.id === userId ? 'Moi' : `@${p.username}`, options });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[Colors.accent]} />}>
      <View style={styles.header}>
        <Text style={styles.title}>{ride.title}</Text>
        <Text style={styles.muted}>
          RDV {formatRideDate(ride.meetingAt)} · {ride.meeting.label}
        </Text>
        <View style={styles.counter}>
          <Text style={styles.counterValue}>
            {present.length}/{joined.length}
          </Text>
          <Text style={styles.counterLabel}>au RDV</Text>
        </View>
      </View>

      {me && open && (
        me.checkedInAt ? (
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            <Text style={styles.doneText}>
              Tu es pointé présent ({new Date(me.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
            </Text>
          </View>
        ) : (
          <Button title="Je suis au RDV" loading={busy} onPress={() => run(() => checkInRide(ride.id))} />
        )
      )}
      {!open && ride.status !== 'ended' && (
        <Text style={styles.hint}>Le pointage ouvre le jour J, 2 h avant le RDV.</Text>
      )}
      <Text style={styles.hint}>
        {isOrganizer
          ? 'Touche un participant pour le pointer ou lui donner un rôle : l’ouvreur mène le groupe, le serre-file ferme la marche. Vous recevez une alerte si quelqu’un décroche.'
          : 'Avec l’app ouverte, tu es pointé automatiquement en arrivant au RDV.'}
      </Text>

      <View style={styles.list}>
        {joined.map((p) => {
          const role = roleLabel(p);
          return (
            <Pressable key={p.id} style={styles.row} onPress={() => manage(p)} disabled={!isOrganizer}>
              <Image source={{ uri: p.avatarUrl }} style={[styles.avatar, !p.checkedInAt && { opacity: 0.5 }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  @{p.username}
                  {p.id === ride.organizer.id ? ' · organisateur' : ''}
                </Text>
                {role && <Text style={styles.role}>{role}</Text>}
              </View>
              {p.checkedInAt ? (
                <View style={styles.status}>
                  <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                  <Text style={styles.time}>
                    {new Date(p.checkedInAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ) : (
                <View style={styles.status}>
                  <Ionicons name="time-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.time}>attendu</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <Button title="Voir la balade" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: 14 },
  header: { gap: 4 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text },
  counter: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  counterValue: { fontSize: 40, fontWeight: '900', color: Colors.accent },
  counterLabel: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successSoft, borderRadius: 12, padding: 12 },
  doneText: { flex: 1, color: Colors.successDark, fontWeight: '700' },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  list: { backgroundColor: Colors.surface, borderRadius: 18, padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, minHeight: 60 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  role: { fontSize: 13, color: Colors.accent, fontWeight: '700' },
  status: { alignItems: 'center', minWidth: 52 },
  time: { fontSize: 11, color: Colors.textMuted },
}));
