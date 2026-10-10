import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { dueText, fuelRange, kindInfo, planStatus, useMyGarage } from '@/lib/garage';
import { photoUrl } from '@/lib/profile';
import { useSession } from '@/lib/session';

/** Garage : mes motos, compteur, autonomie et prochain entretien. */
export default function GarageScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, profile } = useSession();
  const garage = useMyGarage(session?.user.id);
  const motos = profile?.motorcycles ?? [];

  if (!motos.length) {
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="garage" size={48} color={Colors.textMuted} />
        <Text style={styles.muted}>Ajoute d’abord ta moto dans ton profil pour suivre son kilométrage et ses entretiens.</Text>
        <Button title="Modifier mon profil" onPress={() => router.push('/profile-edit')} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {motos.map((m) => {
        const data = garage?.[m.id];
        const g = data?.garage ?? null;
        const range = fuelRange(g);
        // Entretien le plus proche
        const next = (data?.plans ?? [])
          .map((p) => ({ p, s: planStatus(p, g?.odometerKm ?? null) }))
          .sort((a, b) => ['due', 'soon', 'ok'].indexOf(a.s.level) - ['due', 'soon', 'ok'].indexOf(b.s.level) || (a.s.kmLeft ?? 1e9) - (b.s.kmLeft ?? 1e9))[0];
        return (
          <Pressable key={m.id} style={styles.card} onPress={() => router.push({ pathname: '/garage/[id]', params: { id: m.id } })}>
            {m.photo_path ? (
              <Image source={{ uri: photoUrl(m.photo_path) }} style={styles.photo} contentFit="cover" />
            ) : (
              <View style={[styles.photo, styles.noPhoto]}>
                <MaterialCommunityIcons name="motorbike" size={36} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.body}>
              <Text style={styles.name}>
                {m.brand} {m.model}
                {m.is_main ? '  ⭐' : ''}
              </Text>
              <Text style={styles.line}>
                {g ? `${g.odometerKm.toLocaleString('fr-FR')} km` : 'Compteur à renseigner'}
                {range?.leftKm != null ? ` · autonomie ~${Math.round(range.leftKm)} km` : ''}
              </Text>
              {next ? (
                <Text style={[styles.line, next.s.level !== 'ok' && { color: next.s.level === 'due' ? Colors.danger : Colors.warning, fontWeight: '800' }]}>
                  {kindInfo(next.p.kind).emoji} {kindInfo(next.p.kind).label} : {dueText(next.s).toLowerCase()}
                </Text>
              ) : (
                <Text style={styles.muted}>Aucun rappel d’entretien</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </Pressable>
        );
      })}
      <Text style={styles.hint}>
        Le compteur avance tout seul à la fin de chaque navigation faite avec ta moto principale. Ces données ne sont
        visibles que par toi.
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  empty: { flex: 1, alignItems: 'stretch', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: 14, textAlign: 'left' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 18, padding: 12 },
  photo: { width: 72, height: 72, borderRadius: 14, backgroundColor: Colors.border },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 17, fontWeight: '800', color: Colors.text },
  line: { fontSize: 14, color: Colors.text },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
}));
