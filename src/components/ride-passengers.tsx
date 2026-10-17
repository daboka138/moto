import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card } from '@/components/profile-view';
import { Chip } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { openDirectConversation } from '@/lib/messages';
import {
  pairRidePassenger,
  PASSENGER_GEAR_NOTICE,
  PASSENGER_MODES,
  passengerSeatsLabel,
  setRidePassenger,
  type PassengerMode,
  type RideDetails,
} from '@/lib/rides';

/**
 * Passagers (« sac de sable ») : chacun coche « J'ai une place » ou « Je cherche une place ».
 * Demande = message privé pré-rempli au pilote ; le pilote accepte avec « Je l'emmène ».
 */
export function RidePassengers({ ride, meId, onChanged }: { ride: RideDetails; meId: string; onChanged: () => void }) {
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const joined = ride.participants.filter((p) => p.status === 'joined');
  const me = joined.find((p) => p.id === meId);
  const byId = new Map(joined.map((p) => [p.id, p]));
  const offers = joined.filter((p) => p.passenger === 'offer');
  const seekers = joined.filter((p) => p.passenger === 'seek');
  const open = ride.status !== 'ended';
  if (!open && !offers.length && !seekers.length) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      Alert.alert('Passager', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (mode: PassengerMode) => run(() => setRidePassenger(ride.id, me?.passenger === mode ? null : mode));

  const ask = async (pilotId: string) => {
    try {
      const conv = await openDirectConversation(pilotId);
      const draft =
        `Salut ! Je cherche une place passager pour la balade « ${ride.title} » : je peux monter avec toi ? ` +
        'J’ai mon casque homologué et mes gants certifiés 🙂';
      router.push({ pathname: '/chat/[id]', params: { id: conv, draft } });
    } catch (e) {
      Alert.alert('Message', errorMessage(e));
    }
  };

  const take = (seekerId: string) => {
    const who = byId.get(seekerId)?.username ?? '?';
    Alert.alert('Emmener en passager', `Tu emmènes @${who} ? Une notification lui sera envoyée.\n\n${PASSENGER_GEAR_NOTICE}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Je l’emmène', onPress: () => run(() => pairRidePassenger(ride.id, seekerId)) },
    ]);
  };

  const myFreeSeat = me?.passenger === 'offer' && !me.passengerPartner;
  const iSeek = me?.passenger === 'seek' && !me.passengerPartner;

  return (
    <Card title="Passagers">
      <Text style={styles.counter}>
        🏍️ {passengerSeatsLabel(ride.passengerSeats)}
        {ride.passengerSeekers > 0 ? `  ·  🎒 ${ride.passengerSeekers} cherche${ride.passengerSeekers > 1 ? 'nt' : ''} une place` : ''}
      </Text>
      {open && me && (
        <View style={styles.chips}>
          {(['offer', 'seek'] as PassengerMode[]).map((m) => (
            <Chip
              key={m}
              label={`${PASSENGER_MODES[m].emoji} ${PASSENGER_MODES[m].label}`}
              selected={me.passenger === m}
              onPress={() => !busy && choose(m)}
            />
          ))}
        </View>
      )}
      {offers.map((p) => {
        const partner = p.passengerPartner ? byId.get(p.passengerPartner) : null;
        return (
          <View key={p.id} style={styles.row}>
            <Text style={styles.rowText} numberOfLines={2}>
              🏍️ @{p.username}
              {partner ? ` emmène 🎒 @${partner.username}` : ' · place libre'}
            </Text>
            {open && iSeek && !partner && p.id !== meId && (
              <Pressable style={styles.action} onPress={() => ask(p.id)} disabled={busy}>
                <Text style={styles.actionText}>Demander la place</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {seekers
        .filter((p) => !p.passengerPartner)
        .map((p) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.rowText} numberOfLines={2}>
              🎒 @{p.username} cherche une place
            </Text>
            {open && myFreeSeat && p.id !== meId && (
              <Pressable style={styles.action} onPress={() => take(p.id)} disabled={busy}>
                <Text style={styles.actionText}>Je l’emmène</Text>
              </Pressable>
            )}
          </View>
        ))}
      <Text style={styles.notice}>⚠️ {PASSENGER_GEAR_NOTICE}</Text>
    </Card>
  );
}

const useStyles = makeStyles((Colors) => ({
  counter: { fontSize: 15, fontWeight: '800', color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, fontSize: 15, color: Colors.text },
  action: { backgroundColor: Colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
  notice: { fontSize: 13, color: Colors.textMuted },
}));
