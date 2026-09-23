import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { PhotoPicker } from '@/components/photo-picker';
import { Button, Chip, Field, Section } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import {
  emptyMotorcycleDraft,
  INTEREST_SUGGESTIONS,
  profileToDraft,
  RIDING_STYLES,
  saveProfile,
  validateDraft,
  type MotorcycleDraft,
  type PrivateIdentity,
  type Profile,
  type ProfileDraft,
} from '@/lib/profile';

type Props = {
  userId: string;
  profile: Profile | null;
  /** Prénom et nom actuels (privés), null à la création */
  identity: PrivateIdentity | null;
  submitLabel: string;
  onSaved: () => void | Promise<void>;
  header?: React.ReactNode;
};

export function ProfileForm({ userId, profile, identity, submitLabel, onSaved, header }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const [draft, setDraft] = useState<ProfileDraft>(() => profileToDraft(profile, identity));
  const [interestInput, setInterestInput] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setMoto = (key: string, patch: Partial<MotorcycleDraft>) =>
    setDraft((d) => ({ ...d, motorcycles: d.motorcycles.map((m) => (m.key === key ? { ...m, ...patch } : m)) }));

  const removeMoto = (key: string) =>
    setDraft((d) => ({ ...d, motorcycles: d.motorcycles.filter((m) => m.key !== key) }));

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const addInterest = () => {
    const value = interestInput.trim();
    if (value && !draft.interests.includes(value)) set('interests', [...draft.interests, value]);
    setInterestInput('');
  };

  const submit = async () => {
    const errors = validateDraft(draft);
    if (errors.length) {
      Alert.alert('À compléter', errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      await saveProfile(userId, draft, profile);
      await onSaved();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const customInterests = draft.interests.filter((i) => !INTEREST_SUGGESTIONS.includes(i));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <Section title="Identité privée">
          <View style={styles.privateNote}>
            <Ionicons name="lock-closed" size={16} color={Colors.textMuted} />
            <Text style={styles.privateText}>
              Visible uniquement par toi. Les autres motards ne voient que ton pseudo.
            </Text>
          </View>
          <Field label="Prénom" required value={draft.firstName} onChangeText={(v) => set('firstName', v)} />
          <Field label="Nom" required value={draft.lastName} onChangeText={(v) => set('lastName', v)} />
        </Section>

        <Section title="Profil public">
          <PhotoPicker
            shape="round"
            label="Photo de profil *"
            value={draft.avatar}
            onChange={(v) => set('avatar', v)}
          />
          <Field
            label="Pseudo (nom de rider)"
            required
            value={draft.username}
            onChangeText={(v) => set('username', v)}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ex. rider_du_59"
          />
        </Section>

        <Section title="Mes motos">
          {draft.motorcycles.length === 0 && <Text style={styles.hint}>Facultatif : ajoute une ou plusieurs motos.</Text>}
          {draft.motorcycles.map((moto, index) => (
            <View key={moto.key} style={styles.moto}>
              <View style={styles.motoHeader}>
                <Text style={styles.motoTitle}>Moto {index + 1}</Text>
                <Pressable onPress={() => removeMoto(moto.key)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                </Pressable>
              </View>
              <PhotoPicker
                shape="wide"
                label="Photo de la moto"
                value={moto.photo}
                onChange={(v) => setMoto(moto.key, { photo: v })}
              />
              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Marque" required value={moto.brand} onChangeText={(v) => setMoto(moto.key, { brand: v })} placeholder="Yamaha" />
                </View>
                <View style={styles.col}>
                  <Field label="Modèle" required value={moto.model} onChangeText={(v) => setMoto(moto.key, { model: v })} placeholder="MT-07" />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Field label="Année" value={moto.year} onChangeText={(v) => setMoto(moto.key, { year: v })} keyboardType="number-pad" maxLength={4} />
                </View>
                <View style={styles.col}>
                  <Field label="Cylindrée (cc)" value={moto.displacement} onChangeText={(v) => setMoto(moto.key, { displacement: v })} keyboardType="number-pad" maxLength={4} />
                </View>
              </View>
              <Field label="Couleur" value={moto.color} onChangeText={(v) => setMoto(moto.key, { color: v })} />
            </View>
          ))}
          <Button
            title="+ Ajouter une moto"
            variant="secondary"
            onPress={() => set('motorcycles', [...draft.motorcycles, emptyMotorcycleDraft()])}
          />
        </Section>

        <Section title="À propos">
          <Field
            label="Bio"
            value={draft.bio}
            onChangeText={(v) => set('bio', v)}
            multiline
            maxLength={500}
            placeholder="Quelques mots sur toi et ta façon de rouler"
            style={styles.bio}
          />
          <Text style={styles.label}>Style de conduite</Text>
          <View style={styles.chips}>
            {RIDING_STYLES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                selected={draft.ridingStyles.includes(s.value)}
                onPress={() => set('ridingStyles', toggle(draft.ridingStyles, s.value))}
              />
            ))}
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Field label="Permis depuis (année)" value={draft.licenseYear} onChangeText={(v) => set('licenseYear', v)} keyboardType="number-pad" maxLength={4} placeholder="2015" />
            </View>
            <View style={styles.col}>
              <Field label="Ville" value={draft.city} onChangeText={(v) => set('city', v)} placeholder="Lille" />
            </View>
          </View>
          <Text style={styles.label}>Centres d&apos;intérêt</Text>
          <View style={styles.chips}>
            {[...INTEREST_SUGGESTIONS, ...customInterests].map((i) => (
              <Chip
                key={i}
                label={i}
                selected={draft.interests.includes(i)}
                onPress={() => set('interests', toggle(draft.interests, i))}
              />
            ))}
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Field
                label="Autre centre d'intérêt"
                value={interestInput}
                onChangeText={setInterestInput}
                onSubmitEditing={addInterest}
                returnKeyType="done"
                maxLength={30}
              />
            </View>
            <View style={styles.addInterest}>
              <Button title="Ajouter" variant="secondary" onPress={addInterest} />
            </View>
          </View>
        </Section>

        <Button title={submitLabel} onPress={submit} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  hint: { color: Colors.textMuted },
  privateNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  privateText: { flex: 1, fontSize: 13, color: Colors.textMuted },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  moto: {
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  motoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  motoTitle: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bio: { minHeight: 90, textAlignVertical: 'top' },
  addInterest: { justifyContent: 'flex-end' },
}));
