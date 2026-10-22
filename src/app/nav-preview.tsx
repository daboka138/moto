import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LeafletFrameMap } from '@/components/leaflet-map-frame';
import { MapCompass } from '@/components/nav/map-compass';
import { HudStatusIcon, NAV_RAIL_BUTTON, NavHud, type HudAlert } from '@/components/nav/nav-hud';
import { NavBanner, NavSheet, Speedometer } from '@/components/nav/nav-ui';
import { DangerButton } from '@/components/nav/quick-report';
import { NavMapGL } from '@/components/nav-map-gl';
import { SosButton } from '@/components/safety/sos-button';
import { makeStyles, Type, useColors } from '@/constants/theme';
import { useIsAdmin } from '@/lib/admin';
import { PREVIEW_PINS, PREVIEW_POSITION, PREVIEW_PROGRESS, PREVIEW_ROUTE, PREVIEW_ROUTES } from '@/lib/nav-preview';
import { useSession } from '@/lib/session';

// Admin : aperçu de l'écran de navigation avec un trajet FICTIF (rien en base, rien de publié),
// pour vérifier la mise en page sur petit / grand écran, en 2D et en 3D. ?engine=2d|3d
// &ghost=0|1 &muted=0|1 &recenter=0|1 &alerts=0..3 &kmh=47. Sur le web, les zones sûres d'un Android
// (barre d'état 24, barre de navigation 48) sont simulées.

const WEB_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

export default function NavPreviewScreen() {
  const { session } = useSession();
  const isAdmin = useIsAdmin(session?.user.id);
  const insets = useSafeAreaInsets();
  if (!isAdmin) return <Text style={{ padding: 24 }}>Réservé à l’admin.</Text>;
  const content = <Preview />;
  return Platform.OS === 'web' ? (
    <SafeAreaInsetsContext.Provider value={WEB_INSETS}>{content}</SafeAreaInsetsContext.Provider>
  ) : (
    <SafeAreaInsetsContext.Provider value={insets}>{content}</SafeAreaInsetsContext.Provider>
  );
}

function Preview() {
  const Colors = useColors();
  const styles = useStyles();
  const p = useLocalSearchParams<{ engine?: string; ghost?: string; muted?: string; recenter?: string; alerts?: string; kmh?: string }>();
  const engine = p.engine === '2d' ? '2d' : '3d';
  const [muted, setMuted] = useState(p.muted !== '0');
  const [glFailed, setGlFailed] = useState<string | null>(null);
  const kmh = Number(p.kmh ?? 47);
  const alertCount = Number(p.alerts ?? 3);
  const alerts: HudAlert[] = [
    { id: 'weather:wind', icon: '💨', text: 'Vent fort prévu dans ~20 km (rafales 60 km/h)' },
    { id: 'sun', icon: '🌇', text: 'Soleil couché à 18:42 · allume et sois visible', tone: 'night' as const },
    { id: 'curve:right', icon: '↱', text: 'Virage serré à droite dans 200 m' },
  ].slice(0, alertCount);
  const map = {
    position: PREVIEW_POSITION,
    navigating: true,
    follow: true,
    navZoom: 17,
    routes: PREVIEW_ROUTES,
    pins: PREVIEW_PINS,
  };
  return (
    <View style={styles.screen}>
      <LeafletFrameMap {...map} />
      {engine === '3d' && !glFailed && (
        <View style={StyleSheet.absoluteFill}>
          <NavMapGL {...map} onFallback={setGlFailed} />
        </View>
      )}
      <NavHud
        banner={<NavBanner progress={PREVIEW_PROGRESS} then={PREVIEW_ROUTE.steps[2]} rerouting={false} />}
        alerts={alerts}
        topExtra={
          glFailed ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>3D indisponible : {glFailed}</Text>
            </View>
          ) : null
        }
        speed={<Speedometer compact kmh={kmh} limit={50} over={kmh > 53} />}
        status={p.ghost === '0' ? null : <HudStatusIcon icon="ghost" family="mci" color={Colors.ghost} label="Mode fantôme : tu es masqué" />}
        compass={<MapCompass navigating orientation="heading" onPress={() => {}} size={NAV_RAIL_BUTTON} />}
        muted={muted}
        onMute={() => setMuted((m) => !m)}
        onMore={() => {}}
        sos={<SosButton size={52} onTrigger={() => {}} onHint={() => {}} />}
        danger={<DangerButton riding={kmh > 10} onPress={() => {}} />}
        onRecenter={p.recenter === '0' ? null : () => {}}
        bottom={
          <NavSheet
            progress={PREVIEW_PROGRESS}
            stops={[]}
            sharedWith={[]}
            onStop={() => {}}
            onFuel={() => {}}
            onAddStop={() => {}}
            onShare={() => {}}
            onRemoveStop={() => {}}
            fuelLeftKm={null}
            nextStation="Prochaine station dans 12 km · SP95-E10 1,789 €"
          />
        }
        attribution={`${engine === '3d' && !glFailed ? 'MapLibre' : 'Leaflet'} · © MapTiler © OpenStreetMap`}
      />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  note: { alignSelf: 'center', backgroundColor: Colors.overlayStrong, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  noteText: { color: Colors.white, fontSize: Type.small },
}));
