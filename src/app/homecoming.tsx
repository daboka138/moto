import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { DateTimeField } from '@/components/form-fields';
import { SearchBar } from '@/components/nav/search-bar';
import { Button, Chip } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { alertSmsLabel } from '@/lib/alert-sms';
import { fetchMemberContacts, usePhoneContacts } from '@/lib/emergency';
import { useFavorites } from '@/lib/favorites';
import type { LatLng } from '@/lib/geo';
import { extendHomecoming, finishHomecoming, HOMECOMING_MARGIN_MIN, startHomecoming, useHomecoming } from '@/lib/homecoming';
import type { SearchResult } from '@/lib/search';
import { useSession } from '@/lib/session';

const DELAYS = [30, 60, 90, 120, 180];
const EXTENSIONS = [15, 30, 60];

function clock(d: Date) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function delayLabel(min: number) {
  return min < 60 ? `+${min} min` : `+${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}` : ''}`;
}

const withMargin = (d: Date) => new Date(d.getTime() + HOMECOMING_MARGIN_MIN * 60_000);

/** Mode « Je rentre » : destination + heure d'arrivée prévue, alerte aux contacts si je n'arrive pas. */
export default function HomecomingScreen() {
  const active = useHomecoming();
  return active ? <ActiveHomecoming /> : <NewHomecoming />;
}

function ActiveHomecoming() {
  const Colors = useColors();
  const styles = useStyles();
  const active = useHomecoming()!;
  const [busy, setBusy] = useState(false);
  const deadline = new Date(active.deadline);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Ionicons name="home" size={36} color={Colors.accent} style={{ alignSelf: 'center' }} />
        <Text style={styles.big}>Arrivée prévue vers {clock(deadline)}</Text>
        <Text style={styles.muted} numberOfLines={2}>
          → {active.destination}
        </Text>
        <Text style={styles.muted}>
          Si tu n’es pas arrivé(e) à {clock(withMargin(deadline))}, tes contacts d’urgence reçoivent une alerte avec ta
          dernière position (SMS pour les numéros de téléphone). L’arrivée est détectée toute seule quand l’app est ouverte.
        </Text>
      </View>

      <Text style={styles.section}>Prolonger</Text>
      <View style={styles.row}>
        {EXTENSIONS.map((m) => (
          <Pressable
            key={m}
            style={({ pressed }) => [styles.extend, pressed && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => run(() => extendHomecoming(m))}>
            <Text style={styles.extendText}>{delayLabel(m)}</Text>
          </Pressable>
        ))}
      </View>

      <Button title="Je suis arrivé(e)" onPress={() => run(() => finishHomecoming('arrived'))} loading={busy} />
      <Button title="Annuler « Je rentre »" variant="secondary" onPress={() => run(() => finishHomecoming('cancelled'))} disabled={busy} />
    </ScrollView>
  );
}

function NewHomecoming() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const home = useFavorites().find((f) => f.kind === 'home') ?? null;
  const [dest, setDest] = useState<SearchResult | null>(home);
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 60 * 60_000));
  const [me, setMe] = useState<LatLng | null>(null);
  const [contacts, setContacts] = useState<number | null>(null);
  const phones = usePhoneContacts();
  const nobody = contacts === 0 && phones.length === 0;
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      fetchMemberContacts(userId)
        .then((l) => setContacts(l.length))
        .catch(() => setContacts(null));
      Location.getLastKnownPositionAsync()
        .then((p) => p && setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
        .catch(() => {});
    }, [userId]),
  );

  // Heure choisie au cadran : aujourd'hui, ou demain si elle est déjà passée
  const pickTime = (d: Date) => {
    const next = new Date();
    next.setHours(d.getHours(), d.getMinutes(), 0, 0);
    if (next.getTime() < Date.now() + 60_000) next.setDate(next.getDate() + 1);
    setDeadline(next);
  };

  const start = async () => {
    if (!dest) return;
    setBusy(true);
    try {
      const sms = await startHomecoming(
        userId,
        dest,
        deadline,
        me,
        phones.map((p) => p.phone),
      );
      router.back();
      if (sms) Alert.alert('« Je rentre » démarré', alertSmsLabel(sms));
    } catch (e) {
      Alert.alert('« Je rentre » impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>
        Indique où tu rentres et l’heure d’arrivée prévue. Tes numéros d’urgence reçoivent un SMS au départ. Si tu n’es pas
        arrivé(e) {HOMECOMING_MARGIN_MIN} min après et que tu n’as pas prolongé, tes contacts d’urgence (amis de l’app et
        numéros de téléphone par SMS) sont alertés avec ta dernière position.
      </Text>

      {nobody && (
        <Pressable style={styles.warning} onPress={() => router.push('/emergency-contacts')}>
          <Ionicons name="warning" size={22} color={Colors.danger} />
          <Text style={styles.warningText}>Aucun contact d’urgence (ami ou numéro) : personne ne serait alerté. Ajouter →</Text>
        </Pressable>
      )}

      <Text style={styles.section}>Destination</Text>
      {dest ? (
        <View style={styles.dest}>
          <Ionicons name={dest === home ? 'home' : 'location'} size={22} color={Colors.accent} />
          <Text style={styles.destText} numberOfLines={2}>
            {dest.label}
          </Text>
          <Pressable onPress={() => setDest(null)} hitSlop={10} accessibilityLabel="Changer de destination">
            <Ionicons name="close-circle" size={24} color={Colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <>
          {home && <Chip label="🏠 Maison" onPress={() => setDest(home)} />}
          <SearchBar near={me} onSelect={setDest} placeholder="Adresse d’arrivée" />
        </>
      )}

      <Text style={styles.section}>Arrivée prévue</Text>
      <View style={styles.row}>
        {DELAYS.map((m) => (
          <Chip key={m} label={delayLabel(m)} onPress={() => setDeadline(new Date(Date.now() + m * 60_000))} />
        ))}
      </View>
      <DateTimeField label="Heure d’arrivée" mode="time" value={deadline} onChange={pickTime} />
      <Text style={styles.muted}>
        Alerte à {clock(withMargin(deadline))}
        {withMargin(deadline).toDateString() !== new Date().toDateString() ? ' (demain)' : ''} si tu n’es pas arrivé(e).
        Rappel 10 min avant l’heure prévue pour prolonger.
      </Text>

      <Button title="Démarrer « Je rentre »" onPress={start} loading={busy} disabled={!dest || nobody} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 8 },
  big: { fontSize: 26, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  muted: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  section: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  extend: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentSoft,
  },
  extendText: { fontSize: 20, fontWeight: '900', color: Colors.accent },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 14, padding: 14 },
  destText: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 14, padding: 14 },
  warningText: { flex: 1, color: Colors.danger, fontWeight: '700' },
}));
