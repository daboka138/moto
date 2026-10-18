import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { QrCode } from '@/components/qr-code';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { fetchMyInvite, inviteUrl, shareInvite, type MyInvite } from '@/lib/invite';
import { photoUrl } from '@/lib/profile';

/** « Inviter des potes » : lien + code à partager, QR code à scanner en vrai, mes filleuls. */
export default function InviteScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const [data, setData] = useState<MyInvite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchMyInvite()
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, []),
  );

  if (!data?.code) {
    return <View style={styles.center}>{error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={Colors.accent} />}</View>;
  }
  const code = data.code;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Fais venir tes potes</Text>
      <Text style={styles.text}>
        Partage ton lien : en s’inscrivant avec ton code, ton pote devient ton ami sur PasseRyder tout de suite.
      </Text>

      <Button title="Partager mon lien d’invitation" onPress={() => shareInvite(code)} />

      <View style={styles.qrCard}>
        <Text style={styles.label}>À scanner en vrai (au café, au rasso)</Text>
        <QrCode value={inviteUrl(code)} size={230} />
        <Text style={styles.code} selectable>
          {code}
        </Text>
        <Text style={styles.small} selectable>
          {inviteUrl(code)}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          Mes filleuls · {data.count}
          {data.count > 0 ? ` (${data.qualified} actif${data.qualified > 1 ? 's' : ''})` : ''}
        </Text>
        {data.referees.length === 0 ? (
          <Text style={styles.muted}>Personne pour l’instant. Montre ton QR code à ta prochaine sortie !</Text>
        ) : (
          data.referees.map((r) => (
            <Pressable key={r.id} style={styles.row} onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.id } })}>
              <Image source={{ uri: photoUrl(r.avatarPath) }} style={styles.avatar} />
              <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>
                @{r.username}
              </Text>
              <Ionicons
                name={r.qualified ? 'checkmark-circle' : 'time-outline'}
                size={20}
                color={r.qualified ? Colors.success : Colors.textMuted}
              />
            </Pressable>
          ))
        )}
        <Text style={styles.small}>
          Points de bon comportement (si tu les as activés) : +30 quand ton filleul a terminé son profil et fait une 1re action
          (rejoindre une balade, ajouter un ami, signaler un danger), crédités 7 jours après son inscription. 10 filleuls
          récompensés par mois au plus. Badges Recruteur (3) et Ambassadeur (10).
        </Text>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  text: { fontSize: Type.body, color: Colors.text, lineHeight: 21 },
  muted: { fontSize: Type.body, color: Colors.textMuted, lineHeight: 20 },
  small: { fontSize: Type.small, color: Colors.textMuted, lineHeight: 17, textAlign: 'center' },
  label: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  qrCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 12, alignItems: 'center' },
  code: { fontSize: Type.title, fontWeight: '900', letterSpacing: 4, color: Colors.accent },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
}));
