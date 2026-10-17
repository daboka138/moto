import {
  DarkTheme,
  DefaultTheme,
  router,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useNavigationContainerRef,
  usePathname,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheetHost } from '@/components/action-sheet';
import { AlertHost } from '@/components/alert-host';
import { BadgeCelebrationHost } from '@/components/good-points';
import { MessageToast } from '@/components/message-toast';
import { UpdateBanner } from '@/components/update-banner';
import { PushRegistrar } from '@/components/push-registrar';
import { Button } from '@/components/ui';
import { makeStyles, ThemeProvider, useTheme } from '@/constants/theme';
import { loadRoutePrefs } from '@/lib/route-prefs';
import { signOut } from '@/lib/auth';
import { setAuthNotice, useAuthLinkState } from '@/lib/auth-link';
import { DrivingLockProvider } from '@/lib/driving-lock';
import { useFeaturesSync } from '@/lib/features';
import { useGoodPointsSync } from '@/lib/good-points';
import { MapLayersProvider } from '@/lib/map-layers';
import { MessagesProvider } from '@/lib/messages-context';
import { NotificationsProvider } from '@/lib/notifications';
import { PrivacyProvider } from '@/lib/privacy-context';
import { SessionProvider, useSession } from '@/lib/session';
import { StoriesProvider } from '@/lib/stories-context';
import { usePageStyle } from '@/lib/use-wide-layout';

SplashScreen.preventAutoHideAsync();

// Ancien réglage « Afficher les données de démo » (démo retirée en 1.2.0) : effacé des téléphones
try {
  localStorage.removeItem('moto.showDemoData');
} catch {
  // stockage indisponible : rien à effacer
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedNavigation>
        <SessionProvider>
          <PrivacyProvider>
            <DrivingLockProvider>
              <MapLayersProvider>
                <StoriesProvider>
                  <MessagesProvider>
                    <NotificationsProvider>
                      <RootNavigator />
                      <MessageToast />
                      <PushRegistrar />
                      <ActionSheetHost />
                      <AlertHost />
                      <BadgeCelebrationHost />
                      <AccountSync />
                      <UpdateBanner />
                    </NotificationsProvider>
                  </MessagesProvider>
                </StoriesProvider>
              </MapLayersProvider>
            </DrivingLockProvider>
          </PrivacyProvider>
        </SessionProvider>
      </ThemedNavigation>
    </ThemeProvider>
  );
}

/** En-têtes, onglets et barre d'état aux couleurs du thème actif. */
function ThemedNavigation({ children }: { children: ReactNode }) {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </NavigationThemeProvider>
  );
}

function RootNavigator() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const { session, profile, termsAccepted, profileError, refreshProfile } = useSession();
  // Lien reçu par email : l'écran reste affiché pendant que la session s'ouvre et que le profil se charge
  const pathname = usePathname();
  const onAuthLink = pathname === '/auth-callback';
  // Accueil affiché (carte, connexion, CGU ou création du profil) : la pile d'écrans est montée
  const ready = session !== undefined && !(session && (profile === undefined || profileError) && !onAuthLink);

  // Lien d'email reçu par l'app (+native-intent) : son écran s'ouvre PAR-DESSUS l'accueil, jamais à sa place
  const { pending } = useAuthLinkState();
  useEffect(() => {
    if (!ready || !pending || onAuthLink) return;
    const t = setTimeout(() => router.push('/auth-callback'), 300);
    return () => clearTimeout(t);
  }, [ready, pending, onAuthLink]);

  // Sécurité : si aucun écran n'est affiché 3 s après le lancement, retour à l'accueil
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (navigation.isReady() && navigation.getCurrentRoute()) return;
      router.replace(session ? '/' : '/sign-in');
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // Web : les écrans ouverts par-dessus prennent toute la page (fond opaque, jamais la carte derrière),
  // contenu centré sur grand écran (les onglets gèrent le leur)
  const contentStyle = usePageStyle(Colors.background);

  useEffect(() => {
    if (session !== undefined) SplashScreen.hideAsync();
  }, [session]);

  if (session === undefined) return null;

  if (session && profileError && !onAuthLink) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Impossible de charger ton profil. Vérifie ta connexion.</Text>
        <Button title="Réessayer" onPress={refreshProfile} />
        <Button title="Se déconnecter" variant="ghost" onPress={signOut} />
      </View>
    );
  }

  if (session && profile === undefined && !onAuthLink) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !termsAccepted}>
          <Stack.Screen name="terms" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !!termsAccepted && !profile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !!termsAccepted && !!profile}>
          <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: Colors.background } }} />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Paramètres' }} />
          <Stack.Screen name="profile-edit" options={{ headerShown: true, title: 'Modifier mon profil' }} />
          <Stack.Screen name="friends" options={{ headerShown: true, title: 'Amis' }} />
          <Stack.Screen name="trips" options={{ headerShown: true, title: 'Mes trajets' }} />
          <Stack.Screen name="emergency-contacts" options={{ headerShown: true, title: 'Contacts d’urgence' }} />
          <Stack.Screen name="homecoming" options={{ headerShown: true, title: 'Je rentre' }} />
          <Stack.Screen name="sos/[id]" options={{ headerShown: true, title: 'Alerte SOS' }} />
          <Stack.Screen name="riders" options={{ headerShown: true, title: 'Trouver des motards' }} />
          <Stack.Screen name="privacy" options={{ headerShown: true, title: 'Confidentialité de ma position' }} />
          <Stack.Screen name="delete-account" options={{ headerShown: true, title: 'Supprimer mon compte' }} />
          <Stack.Screen name="user/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="ride/new" options={{ headerShown: true, title: 'Nouvelle balade' }} />
          <Stack.Screen name="ride/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="ride/invite" options={{ headerShown: true, title: 'Inviter des amis' }} />
          <Stack.Screen name="event/invite" options={{ headerShown: true, title: 'Inviter des amis' }} />
          <Stack.Screen name="ride/checkin" options={{ headerShown: true, title: 'Qui est au RDV ?' }} />
          <Stack.Screen name="garage/index" options={{ headerShown: true, title: 'Garage' }} />
          <Stack.Screen name="garage/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="place/new" options={{ headerShown: true, title: 'Ajouter un lieu motard' }} />
          <Stack.Screen name="place/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="event/new" options={{ headerShown: true, title: 'Nouvel événement' }} />
          <Stack.Screen name="event/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="badges" options={{ headerShown: true, title: 'Badges et défis' }} />
          <Stack.Screen name="points" options={{ headerShown: true, title: 'Mes points' }} />
          <Stack.Screen name="premium" options={{ headerShown: true, title: 'PasseRyder Premium' }} />
          <Stack.Screen name="invite" options={{ headerShown: true, title: 'Inviter des potes' }} />
          <Stack.Screen name="outing" options={{ headerShown: true, title: 'Ta sortie' }} />
          <Stack.Screen name="club/new" options={{ headerShown: true, title: 'Créer un club' }} />
          <Stack.Screen name="club/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="search" />
          <Stack.Screen name="admin" options={{ headerShown: true, title: 'Console développeur' }} />
          <Stack.Screen name="loop" options={{ headerShown: true, title: 'Fais-moi une boucle' }} />
          <Stack.Screen name="pick-place" options={{ headerShown: true, title: 'Choisir un lieu' }} />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="help/index" options={{ headerShown: true, title: 'Aide' }} />
          <Stack.Screen name="history/index" options={{ headerShown: true, title: 'Histoire de la moto' }} />
          <Stack.Screen name="history/[slug]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="history/chapitre/[slug]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="history/credits" options={{ headerShown: true, title: 'Crédits des images' }} />
          <Stack.Screen name="help/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="photo/new" options={{ headerShown: true, title: 'Nouvelle photo' }} />
          <Stack.Screen name="chat/wallpaper" options={{ headerShown: true, title: 'Fond d’écran' }} />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="messages/new" options={{ headerShown: true, title: 'Nouveau message' }} />
          <Stack.Screen name="group/new" options={{ headerShown: true, title: 'Nouveau groupe' }} />
          <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Infos du groupe' }} />
          <Stack.Screen name="story/new" options={{ headerShown: true, title: 'Nouvelle story' }} />
          <Stack.Screen
            name="story/[ownerId]"
            options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: Colors.dark } }}
          />
        </Stack.Protected>
        {/* Lien « mot de passe oublié » / connexion reçu par email, connecté ou non.
            TOUJOURS EN DERNIER : quand l'écran demandé est protégé, expo-router affiche le premier écran
            disponible de cette liste ; déclaré en premier, cet écran remplaçait la connexion au lancement. */}
        <Stack.Screen name="auth-callback" />
      </Stack>
    {!onAuthLink && <AuthNoticeBanner />}
    </View>
  );
}

/** Petit bandeau non bloquant (lien d'email refusé), fermé au toucher ou après 6 s */
/** Fonctionnalités (gratuit / premium), plan et réglage des points, rechargés à chaque changement de compte */
function AccountSync() {
  const { session } = useSession();
  useFeaturesSync(session?.user.id);
  useGoodPointsSync(session?.user.id);
  const userId = session?.user.id;
  useEffect(() => {
    if (userId) loadRoutePrefs(userId).catch(() => {});
  }, [userId]);
  return null;
}

function AuthNoticeBanner() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { notice } = useAuthLinkState();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setAuthNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <Pressable style={[styles.banner, { top: insets.top + 8 }]} onPress={() => setAuthNotice(null)} accessibilityRole="alert">
      <Text style={styles.bannerText}>{notice}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: Colors.overlayStrong,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerText: { color: Colors.white, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  center: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: Colors.background,
  },
  message: { fontSize: 16, textAlign: 'center', color: Colors.text },
}));
