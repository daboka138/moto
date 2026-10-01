import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { LinkGroup, LinkRow, LinkSeparator } from '@/components/link-row';
import { Chip } from '@/components/ui';
import { UpdateCard } from '@/components/update-card';
import { makeStyles, useColors, useTheme, type ThemePreference } from '@/constants/theme';
import { DemoToggle } from '@/demo/demo-toggle'; // DEMO
import { signOut } from '@/lib/auth';
import { fetchDiscoverable, setDiscoverable } from '@/lib/discovery';
import { useSession } from '@/lib/session';
import { CONTACT_EMAIL, LEGAL_NOTICE_URL, PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/terms';
import { useMapLayers, type MapStyle } from '@/lib/map-layers';
import { privacyLabel } from '@/lib/privacy';
import { usePrivacy } from '@/lib/privacy-context';
import { REPORT_TYPES } from '@/lib/reports';
import { testVoice, updateVoiceSettings, useVoiceSettings, VOICE_RATES, VOICE_VOLUMES } from '@/lib/voice';

type Option<T> = { value: T; label: string; description: string; icon: keyof typeof Ionicons.glyphMap };

const THEMES: Option<ThemePreference>[] = [
  { value: 'light', label: 'Clair', description: 'Toujours en thème clair', icon: 'sunny' },
  { value: 'dark', label: 'Sombre', description: 'Toujours en thème sombre', icon: 'moon' },
  { value: 'system', label: 'Automatique', description: 'Suit le réglage du téléphone', icon: 'phone-portrait' },
];

const MAP_STYLES: Option<MapStyle>[] = [
  { value: 'classic', label: 'Classique', description: 'Carte claire et lisible (MapTiler)', icon: 'map' },
  { value: 'dark', label: 'Sombre', description: 'Toujours sombre', icon: 'moon' },
  { value: 'auto', label: 'Automatique', description: 'Sombre du coucher au lever du soleil', icon: 'partly-sunny' },
];

export default function SettingsScreen() {
  const styles = useStyles();
  const { preference, setPreference } = useTheme();
  const { settings } = usePrivacy();
  const layers = useMapLayers();
  const { session } = useSession();
  const userId = session?.user.id;
  const [discoverable, setDiscoverableState] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchDiscoverable(userId)
      .then(setDiscoverableState)
      .catch(() => setDiscoverableState(false));
  }, [userId]);

  const toggleDiscoverable = async (value: boolean) => {
    if (!userId) return;
    setDiscoverableState(value);
    try {
      const p = value ? await Location.getLastKnownPositionAsync().catch(() => null) : null;
      await setDiscoverable(userId, value, p ? { latitude: p.coords.latitude, longitude: p.coords.longitude } : null);
    } catch (e) {
      setDiscoverableState(!value);
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => signOut() },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.section}>Apparence</Text>
      <View style={styles.card}>
        <RadioOptions options={THEMES} value={preference} onChange={setPreference} />
      </View>

      <Text style={styles.section}>Style de carte</Text>
      <View style={styles.card}>
        <RadioOptions options={MAP_STYLES} value={layers.mapStyle} onChange={layers.setMapStyle} />
      </View>

      <Text style={styles.section}>Carte</Text>
      <View style={styles.card}>
        <SwitchRow
          label="Signalements routiers"
          description="Les alertes vocales de danger restent actives même masqués (réglages dans Voix et alertes)."
          value={layers.showReports}
          onChange={layers.setShowReports}
        />
        <SwitchRow label="Points de RDV des balades" value={layers.showRides} onChange={layers.setShowRides} />
      </View>

      <VoiceSection />

      <Text style={styles.section}>Confidentialité</Text>
      <LinkGroup>
        <LinkRow
          icon={settings?.mode === 'ghost' ? 'eye-off' : 'location'}
          label="Qui voit ma position"
          value={settings ? privacyLabel(settings.mode) : '…'}
          onPress={() => router.push('/privacy')}
        />
      </LinkGroup>

      <View style={styles.card}>
        <SwitchRow
          label="Apparaître dans « Trouver des motards »"
          description="Les autres voient ton pseudo, ta moto et une distance approximative (~5 km près), jamais ta position. Jamais en mode fantôme."
          value={discoverable ?? false}
          onChange={toggleDiscoverable}
        />
      </View>

      <DemoToggle /* DEMO */ />

      <Text style={styles.section}>Compte</Text>
      <LinkGroup>
        <LinkRow icon="create-outline" label="Modifier mon profil" onPress={() => router.push('/profile-edit')} />
        <LinkSeparator />
        <LinkRow icon="log-out-outline" label="Se déconnecter" danger onPress={confirmSignOut} />
        <LinkSeparator />
        <LinkRow icon="trash-outline" label="Supprimer mon compte" danger onPress={() => router.push('/delete-account')} />
      </LinkGroup>

      <Text style={styles.section}>Informations</Text>
      <LinkGroup>
        <LinkRow icon="document-text-outline" label="Conditions d'utilisation" onPress={() => Linking.openURL(TERMS_URL)} />
        <LinkSeparator />
        <LinkRow
          icon="shield-checkmark-outline"
          label="Politique de confidentialité"
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        />
        <LinkSeparator />
        <LinkRow icon="information-circle-outline" label="Mentions légales" onPress={() => Linking.openURL(LEGAL_NOTICE_URL)} />
        <LinkSeparator />
        <LinkRow icon="mail-outline" label="Contact" value={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
      </LinkGroup>

      <UpdateCard />
    </ScrollView>
  );
}

/** Voix et alertes : guidage vocal, alertes de danger (par type), débit, volume, test. */
function VoiceSection() {
  const Colors = useColors();
  const styles = useStyles();
  const voice = useVoiceSettings();
  const toggleType = (type: (typeof REPORT_TYPES)[number]['value']) =>
    updateVoiceSettings({
      mutedDangerTypes: voice.mutedDangerTypes.includes(type)
        ? voice.mutedDangerTypes.filter((t) => t !== type)
        : [...voice.mutedDangerTypes, type],
    });
  return (
    <>
      <Text style={styles.section}>Voix et alertes</Text>
      <View style={styles.card}>
        {voice.muted && (
          <SwitchRow
            label="Voix coupée"
            description="Coupée avec le bouton muet de la navigation : aucune annonce n’est lue."
            value={voice.muted}
            onChange={(v) => updateVoiceSettings({ muted: v })}
          />
        )}
        <SwitchRow
          label="Guidage vocal GPS"
          description="Instructions de direction pendant la navigation."
          value={voice.guidance}
          onChange={(v) => updateVoiceSettings({ guidance: v })}
        />
        <SwitchRow
          label="Alertes vocales des dangers"
          description="Annonce vers 600 m puis rappel à 200 m quand un danger signalé est sur ta route."
          value={voice.dangers}
          onChange={(v) => updateVoiceSettings({ dangers: v })}
        />
        {voice.dangers && (
          <View style={styles.voiceBlock}>
            <Text style={styles.optionLabel}>Dangers annoncés</Text>
            <View style={styles.chips}>
              {REPORT_TYPES.map((t) => (
                <Chip
                  key={t.value}
                  label={`${t.emoji} ${t.label}`}
                  selected={!voice.mutedDangerTypes.includes(t.value)}
                  onPress={() => toggleType(t.value)}
                />
              ))}
            </View>
          </View>
        )}
        <SwitchRow
          label="Limitation de vitesse"
          description="Panneau de la limitation de la route à côté du compteur (données OpenStreetMap, pas toujours connues)."
          value={voice.speedLimit}
          onChange={(v) => updateVoiceSettings({ speedLimit: v })}
        />
        <SwitchRow
          label="Alerte de dépassement"
          description="Compteur en rouge et petit bip quand tu dépasses la limitation."
          value={voice.speedAlert}
          onChange={(v) => updateVoiceSettings({ speedAlert: v })}
        />
        <View style={styles.voiceBlock}>
          <Text style={styles.optionLabel}>Débit de la voix</Text>
          <View style={styles.chips}>
            {VOICE_RATES.map((r) => (
              <Chip key={r.value} label={r.label} selected={voice.rate === r.value} onPress={() => updateVoiceSettings({ rate: r.value })} />
            ))}
          </View>
          <Text style={styles.optionLabel}>Volume de la voix</Text>
          <View style={styles.chips}>
            {VOICE_VOLUMES.map((v) => (
              <Chip
                key={v.value}
                label={v.label}
                selected={voice.volume === v.value}
                onPress={() => updateVoiceSettings({ volume: v.value })}
              />
            ))}
          </View>
          <Text style={styles.optionDescription}>Le volume dépend aussi du volume média du téléphone.</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.testVoice, pressed && { opacity: 0.7 }]} onPress={testVoice}>
          <Ionicons name="volume-high" size={20} color={Colors.accent} />
          <Text style={styles.testVoiceText}>Tester la voix</Text>
        </Pressable>
      </View>
    </>
  );
}

function SwitchRow({ label, description, value, onChange }: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.switchRow}>
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
        {!!description && <Text style={styles.optionDescription}>{description}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.accent, false: Colors.border }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
    marginLeft: 4,
  },
  card: { backgroundColor: Colors.surface, borderRadius: 18, padding: 8, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 },
  optionSelected: { backgroundColor: Colors.accentSoft },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  optionDescription: { fontSize: 13, color: Colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  voiceBlock: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  testVoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 },
  testVoiceText: { fontSize: 16, fontWeight: '700', color: Colors.accent },
}));

function RadioOptions<T extends string>({ options, value, onChange }: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <>
      {options.map((t) => {
        const selected = value === t.value;
        return (
          <Pressable
            key={t.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(t.value)}>
            <Ionicons name={t.icon} size={22} color={selected ? Colors.accent : Colors.textMuted} />
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{t.label}</Text>
              <Text style={styles.optionDescription}>{t.description}</Text>
            </View>
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? Colors.accent : Colors.textMuted}
            />
          </Pressable>
        );
      })}
    </>
  );
}
