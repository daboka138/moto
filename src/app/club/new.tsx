import * as Location from 'expo-location';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';

import { PhotoPicker } from '@/components/photo-picker';
import { Button, Chip, Field, Section } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { IS_WEB } from '@/lib/app-link';
import { fetchClub, JOIN_POLICIES, saveClub, type JoinPolicy } from '@/lib/clubs';
import type { PhotoValue } from '@/lib/profile';
import { useSession } from '@/lib/session';

/** Créer un club (ou le modifier : ?id=…, réservé à ses admins). */
export default function NewClubScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('open');
  const [logo, setLogo] = useState<PhotoValue>({ path: null, localUri: null });
  const [useZone, setUseZone] = useState(true);
  const [zone, setZone] = useState<{ latitude: number; longitude: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (!id || !userId) return;
    let cancelled = false;
    fetchClub(id, userId)
      .then((c) => {
        if (cancelled || !c) return;
        setName(c.name);
        setDescription(c.description ?? '');
        setCity(c.city ?? '');
        setJoinPolicy(c.joinPolicy);
        setLogo({ path: c.logoPath, localUri: null });
        setUseZone(c.latitude !== null);
        if (c.latitude !== null && c.longitude !== null) setZone({ latitude: c.latitude, longitude: c.longitude });
        setLoaded(true);
      })
      .catch((e) => Alert.alert('Oups', e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  // Zone du club (recherche « près de moi ») : ma position, arrondie à ~1 km par le serveur
  useEffect(() => {
    if (id) return;
    Location.getLastKnownPositionAsync()
      .then((p) => p && setZone({ latitude: p.coords.latitude, longitude: p.coords.longitude }))
      .catch(() => {});
  }, [id]);

  if (!userId || !loaded) return null;

  const submit = async () => {
    if (name.trim().length < 3) {
      Alert.alert('À compléter', 'Donne un nom au club (3 caractères au moins).');
      return;
    }
    setSaving(true);
    try {
      const clubId = await saveClub(userId, { name, description, city, joinPolicy, logo, zone: useZone ? zone : null }, id);
      if (id) router.back();
      else router.replace({ pathname: '/club/[id]', params: { id: clubId } });
    } catch (e) {
      Alert.alert(id ? 'Modification impossible' : 'Création impossible', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: id ? 'Modifier le club' : 'Créer un club' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <PhotoPicker value={logo} onChange={setLogo} shape="round" label="Logo" />
        </View>
        <Field label="Nom du club" required value={name} onChangeText={setName} maxLength={60} placeholder="ex. Les Motards du Vieux-Port" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
          multiline
          placeholder="Votre façon de rouler, vos sorties, l’esprit du club…"
        />
        <Field label="Ville ou zone" value={city} onChangeText={setCity} maxLength={80} placeholder="ex. Marseille, Pays d’Aix" />
        {!IS_WEB && (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Apparaître dans « Clubs près de moi »</Text>
              <Text style={styles.small}>Zone du club = ta position actuelle, arrondie à ~1 km.</Text>
            </View>
            <Switch value={useZone && !!zone} onValueChange={setUseZone} disabled={!zone} trackColor={{ true: Colors.accent, false: Colors.border }} thumbColor={Colors.white} />
          </View>
        )}
        <Section title="Qui peut rejoindre ?">
          <View style={styles.chips}>
            {JOIN_POLICIES.map((p) => (
              <Chip key={p.value} label={p.label} selected={joinPolicy === p.value} onPress={() => setJoinPolicy(p.value)} />
            ))}
          </View>
          <Text style={styles.small}>{JOIN_POLICIES.find((p) => p.value === joinPolicy)?.description}</Text>
        </Section>
        <Button title={id ? 'Enregistrer' : 'Créer le club'} onPress={submit} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 760, alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12 },
}));
