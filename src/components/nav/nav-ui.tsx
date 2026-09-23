import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { shortDistance, type ManeuverIcon, type NavRoute } from '@/lib/navigation';
import { reportInfo } from '@/lib/reports';
import type { SearchResult } from '@/lib/search';
import type { DangerAhead } from '@/lib/use-danger-alerts';
import { etaFrom, type NavProgress } from '@/lib/use-navigation';
import { formatDuration } from '@/lib/routing';

const ICONS: Record<ManeuverIcon, keyof typeof MaterialCommunityIcons.glyphMap> = {
  straight: 'arrow-up',
  left: 'arrow-left-top',
  right: 'arrow-right-top',
  'slight-left': 'arrow-top-left',
  'slight-right': 'arrow-top-right',
  'sharp-left': 'arrow-bottom-left',
  'sharp-right': 'arrow-bottom-right',
  uturn: 'arrow-u-left-top',
  roundabout: 'rotate-right',
  arrive: 'flag-checkered',
  depart: 'navigation',
};

function clock(date: Date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Aperçu avant de démarrer : distance, durée, heure d'arrivée, option autoroutes. */
export function RoutePreviewCard({
  destination,
  route,
  loading,
  error,
  avoidHighways,
  onToggleAvoidHighways,
  onStart,
  onCancel,
}: {
  destination: SearchResult;
  route: NavRoute | null;
  loading: boolean;
  error: string | null;
  avoidHighways: boolean;
  onToggleAvoidHighways: (value: boolean) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const avoidFailed = avoidHighways && route && !route.avoidHighways;
  return (
    <View style={styles.card}>
      <View style={styles.destRow}>
        <MaterialCommunityIcons name="flag-checkered" size={22} color={Colors.accent} />
        <Text style={styles.dest} numberOfLines={2}>
          {destination.label}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.muted}>Calcul de l’itinéraire…</Text>
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : route ? (
        <View style={styles.summary}>
          <Text style={styles.duration}>{formatDuration(route.durationS)}</Text>
          <Text style={styles.muted}>
            {shortDistance(route.distanceM)} · arrivée {clock(etaFrom(route.durationS))}
          </Text>
        </View>
      ) : null}

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Éviter les autoroutes</Text>
        <Switch
          value={avoidHighways}
          onValueChange={onToggleAvoidHighways}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor={Colors.white}
        />
      </View>
      {avoidFailed && <Text style={styles.warning}>Calcul sans autoroute indisponible, itinéraire normal affiché.</Text>}

      <View style={styles.buttons}>
        <View style={{ flex: 1 }}>
          <Button title="Annuler" variant="secondary" onPress={onCancel} />
        </View>
        <View style={{ flex: 2 }}>
          <Button title="Démarrer" onPress={onStart} disabled={!route || loading} />
        </View>
      </View>
    </View>
  );
}

/** Bandeau du haut : prochaine manœuvre en gros, alerte danger en dessous. */
export function NavBanner({ progress, danger }: { progress: NavProgress | null; danger: DangerAhead | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const next = progress?.next;
  return (
    <View style={styles.bannerWrap}>
      <View style={styles.banner}>
        {next ? (
          <>
            <MaterialCommunityIcons name={ICONS[next.step.icon]} size={56} color={Colors.white} />
            <View style={styles.bannerText}>
              <Text style={styles.bannerDistance}>{shortDistance(next.distanceM)}</Text>
              <Text style={styles.bannerAction} numberOfLines={2}>
                {next.step.action}
              </Text>
              {!!next.step.road && (
                <Text style={styles.bannerRoad} numberOfLines={1}>
                  {next.step.road}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.bannerAction}>Suivez l’itinéraire</Text>
        )}
      </View>
      {progress?.offRoute && (
        <View style={[styles.chip, { backgroundColor: Colors.ghost }]}>
          <Text style={styles.chipText}>Hors itinéraire · recalcul…</Text>
        </View>
      )}
      {danger && (
        <View style={[styles.chip, { backgroundColor: Colors.danger }]}>
          <Text style={styles.chipText}>
            {reportInfo(danger.report.type).emoji} {reportInfo(danger.report.type).label} dans {shortDistance(danger.distanceM)}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Barre du bas en navigation : temps restant, distance, arrivée, gros bouton Arrêter. */
export function NavBottomBar({ progress, onStop }: { progress: NavProgress | null; onStop: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.bottomBar}>
      <View style={styles.bottomInfo}>
        <Text style={styles.duration}>{progress ? formatDuration(progress.remainingS) : '–'}</Text>
        <Text style={styles.muted}>
          {progress ? `${shortDistance(progress.remainingM)} · arrivée ${clock(etaFrom(progress.remainingS))}` : ''}
        </Text>
      </View>
      <Pressable style={styles.stop} onPress={onStop} accessibilityLabel="Arrêter la navigation">
        <Ionicons name="close" size={28} color={Colors.white} />
        <Text style={styles.stopText}>Arrêter</Text>
      </Pressable>
    </View>
  );
}

/** Gros bouton rond « + » pour signaler, utilisable avec des gants. */
export function ReportButton({ onPress }: { onPress: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.reportButton, pressed && { transform: [{ scale: 0.95 }] }]}
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel="Signaler un danger">
      <Ionicons name="add" size={44} color={Colors.white} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dest: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { gap: 2 },
  duration: { fontSize: 26, fontWeight: '900', color: Colors.text },
  muted: { fontSize: 14, color: Colors.textMuted },
  error: { color: Colors.danger, fontWeight: '600' },
  warning: { color: Colors.textMuted, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
  buttons: { flexDirection: 'row', gap: 10 },
  bannerWrap: { gap: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.guidance,
    borderRadius: 20,
    padding: 16,
    elevation: 6,
  },
  bannerText: { flex: 1 },
  bannerDistance: { color: Colors.white, fontSize: 34, fontWeight: '900' },
  bannerAction: { color: Colors.white, fontSize: 19, fontWeight: '700' },
  bannerRoad: { color: Colors.successSoft, fontSize: 15 },
  chip: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, elevation: 4 },
  chipText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 12,
    paddingLeft: 18,
    elevation: 6,
  },
  bottomInfo: { flex: 1 },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.danger,
    borderRadius: 16,
    paddingHorizontal: 20,
    minHeight: 60,
  },
  stopText: { color: Colors.white, fontSize: 18, fontWeight: '900' },
  reportButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.white,
    elevation: 8,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
}));
