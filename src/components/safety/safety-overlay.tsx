import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Text, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useColors } from '@/constants/theme';
import { fetchMemberContacts, getPhoneContacts, resolveSos, sendSos, type SosResult } from '@/lib/emergency';
import type { LatLng } from '@/lib/geo';
import { speakAlarm } from '@/lib/voice';

/** Délai pour répondre « Je vais bien » après une chute */
const COUNTDOWN_S = 30;

type Phase = 'countdown' | 'sending' | 'sent';

/**
 * Plein écran de sécurité. Chute : « Tout va bien ? » + compte à rebours, puis SOS automatique.
 * SOS manuel : envoi immédiat. Ensuite : résumé, appel du 112, « Je vais bien » (lève l'alerte).
 * Monté seulement quand une alerte est en cours.
 */
export function SafetyOverlay({
  kind,
  userId,
  position,
  onClose,
}: {
  kind: 'fall' | 'manual';
  userId: string;
  position: LatLng | null;
  onClose: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>(kind === 'fall' ? 'countdown' : 'sending');
  const [left, setLeft] = useState(COUNTDOWN_S);
  const [result, setResult] = useState<SosResult | null>(null);
  const [members, setMembers] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  const send = async () => {
    setPhase('sending');
    Vibration.cancel();
    const r = await sendSos(kind, position);
    setResult(r);
    setPhase('sent');
  };

  // SOS manuel : envoyé dès l'ouverture
  useEffect(() => {
    const timer = kind === 'manual' ? setTimeout(send, 0) : null;
    fetchMemberContacts(userId)
      .then((list) => setMembers(list.length))
      .catch(() => setMembers(null));
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chute : vibration, voix, compte à rebours
  useEffect(() => {
    if (phase !== 'countdown') return;
    Vibration.vibrate([0, 700, 500], true);
    speakAlarm('Chute détectée. Tout va bien ? Appuie sur Je vais bien, sinon tes contacts seront alertés dans 30 secondes.');
    const tick = setInterval(() => setLeft((s) => s - 1), 1000);
    // Sans réponse : alerte envoyée
    const timeout = setTimeout(send, COUNTDOWN_S * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(timeout);
      Vibration.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const imFine = async () => {
    if (!result?.id) return onClose();
    setResolving(true);
    try {
      await resolveSos(result.id);
    } catch (e) {
      console.warn('Levée de l’alerte impossible', e);
    } finally {
      setResolving(false);
      onClose();
    }
  };

  const phones = getPhoneContacts().length;
  const nobody = members === 0 && phones === 0;

  return (
    <Modal visible animationType="fade" onRequestClose={() => phase !== 'sending' && onClose()} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        {phase === 'countdown' && (
          <>
            <MaterialCommunityIcons name="alert-octagon" size={72} color={Colors.white} style={styles.center} />
            <Text style={styles.title}>Chute détectée</Text>
            <Text style={styles.subtitle}>Tout va bien ?</Text>
            <Text style={styles.count}>{Math.max(0, left)}</Text>
            <Text style={styles.text}>Sans réponse, tes contacts d’urgence reçoivent une alerte avec ta position.</Text>
            <Pressable style={({ pressed }) => [styles.fine, pressed && styles.pressed]} onPress={onClose}>
              <Ionicons name="checkmark-circle" size={44} color={Colors.guidance} />
              <Text style={styles.fineText}>Je vais bien</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={send}>
              <Text style={styles.secondaryText}>Envoyer l’alerte maintenant</Text>
            </Pressable>
          </>
        )}

        {phase === 'sending' && (
          <>
            <ActivityIndicator size="large" color={Colors.white} />
            <Text style={styles.title}>Envoi de l’alerte…</Text>
          </>
        )}

        {phase === 'sent' && result && (
          <>
            <MaterialCommunityIcons name="bullhorn" size={64} color={Colors.white} style={styles.center} />
            <Text style={styles.title}>{result.error ? 'Alerte non envoyée' : 'Alerte envoyée'}</Text>
            {result.error ? (
              <Text style={styles.text}>Serveur injoignable ({result.error}). Appelle les secours si besoin.</Text>
            ) : (
              <Text style={styles.text}>
                {members === null
                  ? 'Tes contacts d’urgence ont reçu une notification et un message avec ta position.'
                  : members > 0
                    ? `${members} ami${members > 1 ? 's' : ''} prévenu${members > 1 ? 's' : ''} (notification + message avec ta position).`
                    : 'Aucun ami contact d’urgence dans l’app.'}
              </Text>
            )}
            {result.smsOpened && <Text style={styles.text}>SMS prérempli ouvert : vérifie qu’il est bien parti.</Text>}
            {nobody && (
              <Pressable
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                onPress={() => {
                  onClose();
                  router.push('/emergency-contacts');
                }}>
                <Text style={styles.secondaryText}>Ajouter des contacts d’urgence</Text>
              </Pressable>
            )}
            <Pressable style={({ pressed }) => [styles.call, pressed && styles.pressed]} onPress={() => Linking.openURL('tel:112')}>
              <Ionicons name="call" size={30} color={Colors.danger} />
              <Text style={styles.callText}>Appeler le 112</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.fine, pressed && styles.pressed]} onPress={imFine} disabled={resolving}>
              {resolving ? (
                <ActivityIndicator color={Colors.guidance} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={36} color={Colors.guidance} />
                  <Text style={styles.fineSmall}>{result.id ? 'Je vais bien (lever l’alerte)' : 'Fermer'}</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.danger, paddingHorizontal: 24, justifyContent: 'center', gap: 16 },
  center: { alignSelf: 'center' },
  title: { color: Colors.white, fontSize: 32, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: Colors.white, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  count: { color: Colors.white, fontSize: 96, fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  text: { color: Colors.white, fontSize: 17, textAlign: 'center', lineHeight: 24 },
  // Gros bouton, utilisable avec des gants
  fine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 110,
    borderRadius: 28,
    backgroundColor: Colors.white,
  },
  fineText: { color: Colors.guidance, fontSize: 32, fontWeight: '900' },
  fineSmall: { color: Colors.guidance, fontSize: 20, fontWeight: '900' },
  call: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 76,
    borderRadius: 24,
    backgroundColor: Colors.white,
  },
  callText: { color: Colors.danger, fontSize: 24, fontWeight: '900' },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  secondaryText: { color: Colors.white, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.7 },
}));
