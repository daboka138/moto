import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { LinkGroup, LinkRow, LinkSeparator } from '@/components/link-row';
import { useIsAdmin } from '@/lib/admin';
import { NavEngineDiagnostic } from '@/components/nav-engine-diagnostic';
import { OpenInApp } from '@/components/open-in-app';
import { Chip } from '@/components/ui';
import { UpdateCard } from '@/components/update-card';
import { ReportIcon } from '@/components/map-icon';
import { VoicePicker } from '@/components/voice-picker';
import { makeStyles, Radius, Type, type ThemePreference, useColors, useTheme } from '@/constants/theme';
import { resetTips } from '@/guide/state';
import { IS_WEB } from '@/lib/app-link';
import { signOut } from '@/lib/auth';
import { fetchDiscoverable, setDiscoverable } from '@/lib/discovery';
import { FALL_SENSITIVITIES, updateSafetySettings, useSafetySettings } from '@/lib/fall-detection';
import { useCanUse } from '@/lib/features';
import { fetchMyGoodPoints, initSeenBadges, saveGoodPointsSettings, useGoodPointsEnabled } from '@/lib/good-points';
import { useHomecoming } from '@/lib/homecoming';
import {
  DEFAULT_PREFS,
  fetchNotificationPrefs,
  pushPermission,
  registerForPush,
  saveNotificationPrefs,
  type NotificationPrefs,
  type PushStatus,
} from '@/lib/push';
import { setShowNews, useShowNews } from '@/lib/news';
import { useSession } from '@/lib/session';
import { CONTACT_EMAIL, LEGAL_NOTICE_URL, PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/terms';
import { useMapLayers, type MapStyle } from '@/lib/map-layers';
import { privacyLabel } from '@/lib/privacy';
import { usePrivacy } from '@/lib/privacy-context';
import { REPORT_TYPES } from '@/lib/reports';
import { setSimulation, SIMULATION_SPEEDS, useSimulation } from '@/lib/simulation';
import { setPerfEnabled, usePerfEnabled } from '@/lib/perf-meter';
import { startupReport } from '@/lib/startup';
import { fetchInSuggestions, setInSuggestions } from '@/lib/suggestions';
import { BREAK_OPTIONS, testVoice, updateVoiceSettings, useVoiceSettings, VOICE_RATES, VOICE_VOLUMES } from '@/lib/voice';
import { errorMessage } from '@/lib/errors';
import { fetchReadReceipts, setReadReceipts } from '@/lib/messages';
import { fetchMyWaitlist, PLATFORM_LABELS, setWaitlist, type MyWaitlist, type StorePlatform } from '@/lib/store-waitlist';

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
  const showNews = useShowNews();
  const { session } = useSession();
  // Console développeur : visible pour l'admin seulement (rôle vérifié par le serveur)
  const isAdmin = useIsAdmin(session?.user.id);
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

      <Text style={styles.section}>Mur</Text>
      <View style={styles.card}>
        <SwitchRow
          label="Afficher les actus moto"
          description="Titres et résumés des sites d’actu moto (Le Repaire des Motards, Motoservices…), avec un lien vers l’article. 1 actu max pour 3 posts de la commu."
          value={showNews}
          onChange={setShowNews}
        />
      </View>

      {IS_WEB ? (
        <AppOnlySection />
      ) : (
        <>
          <VoiceSection />
          <Text style={styles.section}>Navigation</Text>
          <View style={styles.card}>
            <NavEngineDiagnostic />
          </View>
          <SafetySection />
        </>
      )}

      <NotificationsSection userId={userId} />

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
        <ReadReceiptsRow userId={userId} />
        <SuggestionsRow userId={userId} />
      </View>

      <GoodPointsSection />

      {isAdmin && (
        <LinkGroup>
          <LinkRow icon="construct-outline" label="Console développeur" onPress={() => router.push('/admin')} />
        </LinkGroup>
      )}
      {isAdmin && !IS_WEB && <SimulationSection />}
      {isAdmin && !IS_WEB && <PerfSection />}
      {isAdmin && (
        <LinkGroup>
          <LinkRow icon="speedometer-outline" label="Mesures du démarrage" onPress={showStartupReport} />
          <LinkSeparator />
          <LinkRow icon="navigate-outline" label="Aperçu de l’écran de navigation" onPress={() => router.push('/nav-preview')} />
        </LinkGroup>
      )}

      <Text style={styles.section}>Aide</Text>
      <LinkGroup>
        <LinkRow icon="help-circle-outline" label="Aide et guide" onPress={() => router.push('/help')} />
        <LinkSeparator />
        <LinkRow
          icon="play-circle-outline"
          label="Revoir la présentation"
          onPress={() => router.push({ pathname: '/welcome', params: { replay: '1' } })}
        />
        <LinkSeparator />
        <LinkRow
          icon="bulb-outline"
          label="Réafficher les astuces"
          onPress={() => {
            resetTips();
            Alert.alert('Astuces', 'Les bulles d’astuces s’afficheront de nouveau sur les écrans clés.');
          }}
        />
      </LinkGroup>

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
        <LinkRow icon="person-circle-outline" label="Qui est derrière l’appli" onPress={() => router.push('/about')} />
        <LinkSeparator />
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

      {!IS_WEB && <UpdateCard />}
    </ScrollView>
  );
}

/** Admin : temps de chaque étape du dernier lancement et blocages du fil JS (saccades) */
function showStartupReport() {
  const { marks, stalls } = startupReport();
  const lines = marks.map((m) => `${(m.ms / 1000).toFixed(2)} s · ${m.label}`);
  const worst = [...stalls].sort((a, b) => parseInt(b.label.replace(/\D/g, ''), 10) - parseInt(a.label.replace(/\D/g, ''), 10)).slice(0, 8);
  const blocks = worst.map((m) => `${(m.ms / 1000).toFixed(2)} s · ${m.label}`);
  Alert.alert(
    'Démarrage (ce lancement)',
    `${lines.join('\n')}\n\nBlocages du fil JS (${stalls.length}, les plus longs) :\n${blocks.join('\n') || 'aucun'}`,
  );
}

/** Admin : images/s, temps de calcul par image et messages/s de la carte, affichés en navigation */
function PerfSection() {
  const styles = useStyles();
  const on = usePerfEnabled();
  return (
    <View style={styles.card}>
      <SwitchRow
        label="Mesures de fluidité (navigation)"
        description="Affiche en haut de la navigation : images/s, temps de calcul par image, pire image et messages/s vers la carte."
        value={on}
        onChange={setPerfEnabled}
      />
    </View>
  );
}

/** Mode développeur (admin) : simuler un trajet pour tester la navigation sans rouler */
function SimulationSection() {
  const styles = useStyles();
  const sim = useSimulation();
  return (
    <View style={styles.card}>
      <SwitchRow
        label="Simulation de trajet (test)"
        description="Pendant une navigation, la position avance seule le long de l’itinéraire. Jamais publiée (amis, partage, Je rentre) ; le trajet ne compte ni km, ni badges, ni points. Désactivée au redémarrage de l’app."
        value={sim.active}
        onChange={(v) => setSimulation({ active: v })}
      />
      {sim.active && (
        <View style={styles.voiceBlock}>
          <Text style={styles.optionLabel}>Allure simulée</Text>
          <View style={styles.chips}>
            {SIMULATION_SPEEDS.map((k) => (
              <Chip key={k} label={`${k} km/h`} selected={sim.kmh === k} onPress={() => setSimulation({ kmh: k })} />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/** Points de bon comportement (opt-in) + bouton Premium (caché tant que l'admin ne l'active pas) */
function GoodPointsSection() {
  const styles = useStyles();
  const allowed = useCanUse('good_points');
  const premiumOffer = useCanUse('premium_offer');
  const enabled = useGoodPointsEnabled();
  const [busy, setBusy] = useState(false);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const mine = await fetchMyGoodPoints();
      await saveGoodPointsSettings(
        on
          ? { ...mine.settings, enabled: true }
          : { ...mine.settings, enabled: false, showOnProfile: false, friendsRanking: false, departmentRanking: false },
      );
      if (on) initSeenBadges(mine.counters);
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!allowed && !premiumOffer) return null;
  return (
    <>
      {allowed && (
        <>
          <Text style={styles.section}>Points de bon comportement</Text>
          <View style={styles.card}>
            <SwitchRow
              label="Gagner des points"
              description="Km propres, trajets sans téléphone, dangers confirmés, balades et spots. Désactivé par défaut ; score privé, jamais lié à la vitesse."
              value={enabled}
              onChange={toggle}
              disabled={busy}
            />
          </View>
          {enabled && (
            <LinkGroup>
              <LinkRow icon="ribbon-outline" label="Mes points" onPress={() => router.push('/points')} />
            </LinkGroup>
          )}
        </>
      )}
      {premiumOffer && (
        <LinkGroup>
          <LinkRow icon="star-outline" label="PasseRyder Premium" onPress={() => router.push('/premium')} />
        </LinkGroup>
      )}
    </>
  );
}

/** Version web : réglages des fonctions réservées à l'app (voix, sécurité). */
function AppOnlySection() {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <>
      <Text style={styles.section}>Voix, sécurité et GPS</Text>
      <View style={[styles.card, styles.appOnly]}>
        <Ionicons name="phone-portrait-outline" size={28} color={Colors.accent} />
        <Text style={styles.optionDescription}>
          Navigation guidée, voix, limitation de vitesse, SOS, contacts d’urgence, détection de chute et « Je rentre » se
          règlent dans l’app Android.
        </Text>
        <OpenInApp path="/settings" />
      </View>
    </>
  );
}

/** Voix et alertes : guidage vocal, alertes de danger (par type), débit, volume, test. */
function VoiceSection() {
  const Colors = useColors();
  const styles = useStyles();
  const voice = useVoiceSettings();
  const { session } = useSession();
  const isAdmin = useIsAdmin(session?.user.id);
  // Liste des types de danger repliée par défaut (longue)
  const [dangersOpen, setDangersOpen] = useState(false);
  const announced = REPORT_TYPES.filter((t) => !voice.mutedDangerTypes.includes(t.value)).length;
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
          description="Annoncée une seule fois, environ 20 secondes avant (250 à 600 m), quand un danger signalé est sur ta route."
          value={voice.dangers}
          onChange={(v) => updateVoiceSettings({ dangers: v })}
        />
        {voice.dangers && (
          <View style={styles.voiceBlock}>
            <Pressable
              style={styles.foldRow}
              onPress={() => setDangersOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: dangersOpen }}>
              <Text style={[styles.optionLabel, styles.foldLabel]}>
                Dangers annoncés : {announced === REPORT_TYPES.length ? 'tous' : `${announced} sur ${REPORT_TYPES.length}`}
              </Text>
              <Text style={styles.foldAction}>{dangersOpen ? 'Fermer' : 'Changer'}</Text>
              <Ionicons name={dangersOpen ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.accent} />
            </Pressable>
            {dangersOpen && (
              <View style={styles.chips}>
                {REPORT_TYPES.map((t) => (
                  <Chip
                    key={t.value}
                    leading={<ReportIcon type={t.value} size={18} />}
                    label={t.label}
                    selected={!voice.mutedDangerTypes.includes(t.value)}
                    onPress={() => toggleType(t.value)}
                  />
                ))}
              </View>
            )}
          </View>
        )}
        <SwitchRow
          label="Annoncer les zones de danger"
          description="« Zone de danger sur 2 kilomètres, prudence. » une seule fois en entrant, d’après les accidents corporels officiels (ONISR) et les dangers confirmés par la commu."
          value={voice.dangerZones}
          onChange={(v) => updateVoiceSettings({ dangerZones: v })}
        />
        <SwitchRow
          label="Limitation de vitesse"
          description="Panneau de la limitation de la route à côté du compteur (données OpenStreetMap, pas toujours connues)."
          value={voice.speedLimit}
          onChange={(v) => updateVoiceSettings({ speedLimit: v })}
        />
        <SwitchRow
          label="Annoncer les changements de limitation"
          description="En navigation : « Limitation à 50. » une seule fois en entrant sur la nouvelle limitation, « Bientôt limitation à 50. » juste avant une baisse. Rien si la limitation est inconnue."
          value={voice.limitChanges}
          onChange={(v) => updateVoiceSettings({ limitChanges: v })}
        />
        {voice.limitChanges && (
          <SwitchRow
            label="Signal sonore si la voix est coupée"
            description="Petite note discrète à la place de l’annonce quand le son du guidage est coupé."
            value={voice.limitChime}
            onChange={(v) => updateVoiceSettings({ limitChime: v })}
          />
        )}
        <SwitchRow
          label="Alerte de dépassement"
          description="Compteur en rouge et petit bip quand tu dépasses la limitation. Jamais par-dessus une annonce vocale, et pas tout de suite après un changement de limitation (le temps de ralentir)."
          value={voice.speedAlert}
          onChange={(v) => updateVoiceSettings({ speedAlert: v })}
        />
        <SwitchRow
          label="Virages serrés"
          description="Annoncés environ 200 m avant, d’après la forme de l’itinéraire (hors carrefours)."
          value={voice.curveAlerts}
          onChange={(v) => updateVoiceSettings({ curveAlerts: v })}
        />
        <SwitchRow
          label="Coucher du soleil et nuit"
          description="Coucher du soleil dans 30 min, ou nuit tombée avant ton arrivée."
          value={voice.sunAlerts}
          onChange={(v) => updateVoiceSettings({ sunAlerts: v })}
        />
        <SwitchRow
          label="Météo sur le trajet"
          description="Pluie, vent fort ou gel devant toi pendant la navigation."
          value={voice.weatherAlerts}
          onChange={(v) => updateVoiceSettings({ weatherAlerts: v })}
        />
        <View style={styles.voiceBlock}>
          <Text style={styles.optionLabel}>Rappel de pause</Text>
          <View style={styles.chips}>
            {[...BREAK_OPTIONS, ...(isAdmin ? [{ value: 2, label: '2 min (test)' }] : [])].map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={voice.breakReminderMin === o.value}
                onPress={() => updateVoiceSettings({ breakReminderMin: o.value })}
              />
            ))}
          </View>
          <Text style={styles.optionDescription}>
            Après ce temps de route, annonce vocale et café ou point de vue proposé à moins de 10 min. Un arrêt de 10 min
            remet le compteur à zéro. L’étape s’ajoute à l’arrêt.
          </Text>
        </View>
        <View style={styles.voiceBlock}>
          <Text style={styles.optionLabel}>Voix du guidage</Text>
          <VoicePicker />
        </View>
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

/** Sécurité : contacts d'urgence, « Je rentre », détection de chute. */
function SafetySection() {
  const styles = useStyles();
  const safety = useSafetySettings();
  const homecoming = useHomecoming();
  return (
    <>
      <Text style={styles.section}>Sécurité</Text>
      <LinkGroup>
        <LinkRow icon="medkit" label="Contacts d'urgence" onPress={() => router.push('/emergency-contacts')} />
        <LinkSeparator />
        <LinkRow
          icon="home"
          label="Je rentre"
          value={homecoming ? 'en cours' : undefined}
          onPress={() => router.push('/homecoming')}
        />
      </LinkGroup>
      <View style={styles.card}>
        <SwitchRow
          label="Détection de chute"
          description="Pendant une navigation ou une balade en cours (app ouverte) : choc fort puis immobilité → « Tout va bien ? », puis alerte à tes contacts sans réponse sous 30 s."
          value={safety.fallDetection}
          onChange={(v) => updateSafetySettings({ fallDetection: v })}
        />
        {safety.fallDetection && (
          <View style={styles.voiceBlock}>
            <Text style={styles.optionLabel}>Sensibilité</Text>
            <View style={styles.chips}>
              {FALL_SENSITIVITIES.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  selected={safety.fallSensitivity === s.value}
                  onPress={() => updateSafetySettings({ fallSensitivity: s.value })}
                />
              ))}
            </View>
            <Text style={styles.optionDescription}>
              {FALL_SENSITIVITIES.find((s) => s.value === safety.fallSensitivity)!.description}. Trop d’alertes sur route
              dégradée ? Passe en « Peu sensible ».
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

const NOTIFICATION_TYPES: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'messages', label: 'Messages', description: 'Nouveaux messages privés et de balade.' },
  { key: 'rides', label: 'Balades', description: 'Invitations, rappel 1 h avant le rendez-vous, commentaires sur tes balades.' },
  { key: 'friends', label: 'Amis et commentaires', description: 'Demandes d’ami, commentaires sur tes photos, J’aime sur tes stories, avis sur tes lieux.' },
  { key: 'dangers', label: 'Dangers près de moi', description: 'Signalement à moins de 3 km de ta dernière position.' },
  { key: 'garage', label: 'Rappels d’entretien', description: 'Vidange, pneus, chaîne, contrôle technique, assurance : selon les rappels de ton Garage.' },
  { key: 'weather', label: 'Météo de mes balades', description: 'La veille au soir, si la météo prévue sur le parcours est mauvaise (pluie, vent fort, gel, forte chaleur).' },
];

/** Notifications : permission du téléphone et types reçus (réglés côté serveur). */
function NotificationsSection({ userId }: { userId: string | undefined }) {
  const Colors = useColors();
  const styles = useStyles();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    pushPermission().then(setStatus);
    if (!userId) return;
    fetchNotificationPrefs(userId)
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_PREFS));
  }, [userId]);

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!userId || !prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await saveNotificationPrefs(userId, next);
    } catch (e) {
      setPrefs(prefs);
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const enable = async () => {
    const s = await registerForPush(true);
    setStatus(s);
    if (s === 'denied') Linking.openSettings();
  };

  return (
    <>
      <Text style={styles.section}>Notifications</Text>
      <View style={styles.card}>
        {status === 'denied' && (
          <Pressable style={({ pressed }) => [styles.testVoice, pressed && { opacity: 0.7 }]} onPress={enable}>
            <Ionicons name="notifications-off" size={20} color={Colors.danger} />
            <Text style={[styles.testVoiceText, { color: Colors.danger }]}>Notifications désactivées : activer</Text>
          </Pressable>
        )}
        {status === 'unavailable' && (
          <Text style={[styles.optionDescription, { padding: 12 }]}>
            {IS_WEB
              ? 'Les notifications arrivent sur ton téléphone, dans l’app Android. Choisis ici celles que tu veux recevoir.'
              : 'Notifications indisponibles sur cette version de l’app.'}
          </Text>
        )}
        <SwitchRow
          label="SOS et sécurité"
          description="Alertes de tes proches, « Je rentre ». Toujours activées."
          value
          onChange={() => {}}
          disabled
        />
        {NOTIFICATION_TYPES.map((t) => (
          <SwitchRow
            key={t.key}
            label={t.label}
            description={t.description}
            value={prefs?.[t.key] ?? true}
            onChange={(v) => toggle(t.key, v)}
            disabled={!prefs}
          />
        ))}
        <StoreWaitlistRows userId={userId} />
      </View>
    </>
  );
}

/** « Me prévenir quand l'appli sort sur iPhone / Android » (+ un email si accepté). Android : pas dans l'app Android */
function StoreWaitlistRows({ userId }: { userId: string | undefined }) {
  const [mine, setMine] = useState<MyWaitlist | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetchMyWaitlist(userId)
      .then(setMine)
      .catch((e) => console.warn('Inscriptions « Préviens-moi » indisponibles', e));
  }, [userId]);
  const platforms: StorePlatform[] = IS_WEB ? ['ios', 'android'] : ['ios'];
  const emailOk = !!mine && platforms.some((p) => mine[p].on && mine[p].emailOk);
  const anyOn = !!mine && platforms.some((p) => mine[p].on);

  const save = async (next: MyWaitlist, changed: StorePlatform[]) => {
    const before = mine;
    setMine(next);
    try {
      for (const p of changed) await setWaitlist(p, next[p].on, next[p].emailOk);
    } catch (e) {
      setMine(before);
      Alert.alert('Réglage impossible', errorMessage(e));
    }
  };

  return (
    <>
      {platforms.map((p) => (
        <SwitchRow
          key={p}
          label={`Me prévenir quand l’appli sort sur ${PLATFORM_LABELS[p]}`}
          description={p === 'ios' ? 'Une notification le jour où PasseRyder arrive sur l’App Store.' : 'Une notification le jour où PasseRyder est sur Google Play pour tout le monde.'}
          value={!!mine?.[p].on}
          disabled={!mine}
          onChange={(v) => mine && save({ ...mine, [p]: { on: v, emailOk } }, [p])}
        />
      ))}
      {anyOn && (
        <SwitchRow
          label="Aussi par email"
          description="Un seul email, à l’adresse de ton compte, avec un lien pour te désinscrire."
          value={emailOk}
          onChange={(v) => {
            if (!mine) return;
            const on = platforms.filter((p) => mine[p].on);
            save({ ...mine, ...Object.fromEntries(on.map((p) => [p, { on: true, emailOk: v }])) }, on);
          }}
        />
      )}
    </>
  );
}

/** « Motards que tu pourrais connaître » : apparaître (ou non) chez les autres */
function SuggestionsRow({ userId }: { userId: string | undefined }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetchInSuggestions(userId)
      .then(setOn)
      .catch(() => setOn(true));
  }, [userId]);
  return (
    <SwitchRow
      label="Apparaître dans les suggestions"
      description="Les motards avec qui tu as des amis, un club ou des balades en commun peuvent te voir dans « Motards que tu pourrais connaître ». Jamais ta position, jamais en mode fantôme."
      value={on ?? true}
      disabled={on === null}
      onChange={(next) => {
        setOn(next);
        setInSuggestions(next).catch((e) => {
          setOn(!next);
          Alert.alert('Réglage impossible', errorMessage(e));
        });
      }}
    />
  );
}

/** Accusés de lecture : coupés, les autres ne voient plus quand je lis, et je ne vois plus les leurs */
function ReadReceiptsRow({ userId }: { userId: string | undefined }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) return;
    fetchReadReceipts(userId)
      .then(setOn)
      .catch(() => setOn(true));
  }, [userId]);
  return (
    <SwitchRow
      label="Accusés de lecture"
      description="Les autres voient quand tu as lu leurs messages (✓✓ bleu, « Vu »). Coupé, tu ne vois plus non plus les leurs."
      value={on ?? true}
      disabled={on === null}
      onChange={(next) => {
        if (!userId) return;
        setOn(next);
        setReadReceipts(userId, next).catch((e) => {
          setOn(!next);
          Alert.alert('Réglage impossible', errorMessage(e));
        });
      }}
    />
  );
}

function SwitchRow({ label, description, value, onChange, disabled }: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
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
        disabled={disabled}
        trackColor={{ true: Colors.accent, false: Colors.border }}
        thumbColor={Colors.white}
        // react-native-web : couleur du curseur activé (thumbColor n'y vaut que pour l'état désactivé)
        {...(IS_WEB && ({ activeThumbColor: Colors.white } as object))}
      />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  section: {
    fontSize: Type.small,
    fontWeight: '800',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
    marginLeft: 4,
  },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 8, gap: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radius.md },
  optionSelected: { backgroundColor: Colors.accentSoft },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  optionDescription: { fontSize: Type.small, color: Colors.textMuted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  voiceBlock: { paddingHorizontal: 12, paddingBottom: 8, gap: 12 },
  foldRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  foldLabel: { flex: 1 },
  foldAction: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  testVoice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  testVoiceText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  appOnly: { alignItems: 'center', padding: 16, gap: 12 },
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
