import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { LeafletMap } from '@/components/leaflet-map';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { fetchSos, mapLink, resolveSos, SOS_KIND_LABELS, type SosEvent } from '@/lib/emergency';
import { openDirectConversation } from '@/lib/messages';
import { useSession } from '@/lib/session';

/** Détail d'une alerte SOS (ouvert depuis la notification) : qui, quand, où. */
export default function SosScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [sos, setSos] = useState<SosEvent | null | undefined>(undefined);

  const load = useCallback(() => {
    fetchSos(id)
      .then(setSos)
      .catch(() => setSos(null));
  }, [id]);

  useEffect(() => {
    load();
    // Tant que l'alerte est en cours, on regarde si elle a été levée
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (sos === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (!sos) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Alerte introuvable (supprimée après 30 jours, ou tu n’es plus contact d’urgence).</Text>
      </View>
    );
  }

  const mine = sos.userId === session?.user.id;
  const point = sos.latitude != null && sos.longitude != null ? { latitude: sos.latitude, longitude: sos.longitude } : null;
  const when = new Date(sos.createdAt);

  const write = async () => {
    try {
      const conv = await openDirectConversation(sos.userId);
      router.push({ pathname: '/chat/[id]', params: { id: conv } });
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.banner, sos.resolvedAt ? styles.bannerOk : null]}>
        <Ionicons name={sos.resolvedAt ? 'checkmark-circle' : 'alert-circle'} size={32} color={Colors.white} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>{sos.resolvedAt ? 'Alerte levée : tout va bien' : 'SOS en cours'}</Text>
          <Text style={styles.bannerText}>{SOS_KIND_LABELS[sos.kind]}</Text>
        </View>
      </View>

      <View style={styles.person}>
        <Image source={{ uri: sos.avatarUrl }} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{mine ? 'Ton alerte' : `@${sos.username}`}</Text>
          <Text style={styles.muted}>
            le {when.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à{' '}
            {when.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {point ? (
        <>
          <View style={styles.map}>
            <LeafletMap
              position={null}
              pins={[{ id: 'sos', kind: 'end', label: '🆘', latitude: point.latitude, longitude: point.longitude }]}
              fitPoints={[point]}
            />
          </View>
          <Button title="Ouvrir dans Maps (itinéraire)" onPress={() => Linking.openURL(mapLink(point))} />
        </>
      ) : (
        <Text style={styles.muted}>Position inconnue au moment de l’alerte.</Text>
      )}

      {!mine && <Button title={`Écrire à @${sos.username}`} variant="secondary" onPress={write} />}
      <Pressable style={({ pressed }) => [styles.call, pressed && { opacity: 0.7 }]} onPress={() => Linking.openURL('tel:112')}>
        <Ionicons name="call" size={24} color={Colors.white} />
        <Text style={styles.callText}>Appeler le 112</Text>
      </Pressable>
      {mine && !sos.resolvedAt && (
        <Button
          title="Je vais bien (lever l’alerte)"
          variant="secondary"
          onPress={() =>
            resolveSos(sos.id)
              .then(load)
              .catch((e) => Alert.alert('Oups', e instanceof Error ? e.message : String(e)))
          }
        />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.danger, borderRadius: 18, padding: 16 },
  bannerOk: { backgroundColor: Colors.guidance },
  bannerTitle: { color: Colors.white, fontSize: 19, fontWeight: '900' },
  bannerText: { color: Colors.white, fontSize: 14 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.border },
  name: { fontSize: 18, fontWeight: '800', color: Colors.text },
  muted: { fontSize: 14, color: Colors.textMuted, textAlign: 'left' },
  map: { height: 260, borderRadius: 18, overflow: 'hidden' },
  call: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: Colors.danger,
  },
  callText: { color: Colors.white, fontSize: 17, fontWeight: '900' },
}));
