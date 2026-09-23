import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { photoUrl, RIDING_STYLES, type Motorcycle } from '@/lib/profile';
import { useSession } from '@/lib/session';

export default function ProfileScreen() {
  const { profile } = useSession();

  // En-tête sombre : barre d'état claire tant que l'onglet est affiché
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  if (!profile) return null;

  const licenseYears = profile.license_year ? new Date().getFullYear() - profile.license_year : null;
  const styleLabels = profile.riding_styles.map((s) => RIDING_STYLES.find((r) => r.value === s)?.label ?? s);

  const confirmSignOut = () =>
    Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <SafeAreaView edges={['top']} style={styles.heroInner}>
          <Image source={{ uri: photoUrl(profile.avatar_path) }} style={styles.avatar} contentFit="cover" />
          <Text style={styles.name}>
            {profile.first_name} {profile.last_name}
          </Text>
          <Text style={styles.username}>@{profile.username}</Text>
          {!!profile.city && (
            <View style={styles.cityRow}>
              <Ionicons name="location-sharp" size={14} color={Colors.accent} />
              <Text style={styles.city}>{profile.city}</Text>
            </View>
          )}
        </SafeAreaView>
      </View>

      <View style={styles.stats}>
        <Stat value={profile.motorcycles.length} label={profile.motorcycles.length > 1 ? 'motos' : 'moto'} />
        <View style={styles.statDivider} />
        <Stat value={licenseYears ?? '–'} label={licenseYears !== null && licenseYears > 1 ? 'ans de permis' : 'an de permis'} />
      </View>

      <View style={styles.body}>
        <Button title="Modifier mon profil" variant="secondary" onPress={() => router.push('/profile-edit')} />

        {!!profile.bio && (
          <Card title="Bio">
            <Text style={styles.bio}>{profile.bio}</Text>
          </Card>
        )}

        {styleLabels.length > 0 && (
          <Card title="Style de conduite">
            <View style={styles.chips}>
              {styleLabels.map((s) => (
                <Chip key={s} label={s} selected />
              ))}
            </View>
          </Card>
        )}

        <Card title="Mon garage">
          {profile.motorcycles.length === 0 ? (
            <Text style={styles.muted}>Aucune moto pour l&apos;instant.</Text>
          ) : (
            profile.motorcycles.map((m) => <MotoCard key={m.id} moto={m} />)
          )}
        </Card>

        {profile.interests.length > 0 && (
          <Card title="Centres d'intérêt">
            <View style={styles.chips}>
              {profile.interests.map((i) => (
                <Chip key={i} label={i} />
              ))}
            </View>
          </Card>
        )}

        <Button title="Se déconnecter" variant="ghost" onPress={confirmSignOut} />
      </View>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MotoCard({ moto }: { moto: Motorcycle }) {
  const details = [
    moto.year?.toString(),
    moto.displacement_cc ? `${moto.displacement_cc} cc` : null,
    moto.color,
  ].filter(Boolean);

  return (
    <View style={styles.moto}>
      {moto.photo_path ? (
        <Image source={{ uri: photoUrl(moto.photo_path) }} style={styles.motoPhoto} contentFit="cover" />
      ) : (
        <View style={[styles.motoPhoto, styles.motoPlaceholder]}>
          <MaterialCommunityIcons name="motorbike" size={48} color={Colors.textMuted} />
        </View>
      )}
      <View style={styles.motoInfo}>
        <Text style={styles.motoBrand}>{moto.brand}</Text>
        <Text style={styles.motoModel}>{moto.model}</Text>
        {details.length > 0 && <Text style={styles.muted}>{details.join(' · ')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 32 },
  hero: {
    backgroundColor: Colors.dark,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingBottom: 48,
  },
  heroInner: { alignItems: 'center', paddingTop: 24, gap: 4 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: Colors.accent,
    marginBottom: 12,
  },
  name: { fontSize: 26, fontWeight: '900', color: '#fff' },
  username: { fontSize: 16, color: Colors.accent, fontWeight: '600' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  city: { color: '#D4D4D8', fontSize: 14 },
  stats: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    marginHorizontal: 24,
    marginTop: -32,
    borderRadius: 18,
    paddingVertical: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 13, color: Colors.textMuted },
  statDivider: { width: 1, backgroundColor: Colors.border },
  body: { padding: 16, gap: 16 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  bio: { fontSize: 16, lineHeight: 22, color: Colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muted: { color: Colors.textMuted, fontSize: 14 },
  moto: { borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.background },
  motoPhoto: { width: '100%', aspectRatio: 16 / 9 },
  motoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.border },
  motoInfo: { padding: 12, gap: 2 },
  motoBrand: { fontSize: 13, fontWeight: '700', color: Colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  motoModel: { fontSize: 20, fontWeight: '800', color: Colors.text },
});
