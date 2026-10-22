import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, makeStyles, Radius, Type, useColors } from '@/constants/theme';

// Habillage de l'écran de navigation, rangé en zones qui ne peuvent pas se chevaucher (zones sûres
// de l'écran respectées) :
// - en haut : instruction, UNE pastille d'alerte (une à la fois, 6 s ; toucher = toutes), convoi ;
// - au milieu à droite : colonne fine boussole / son / ⋯ (rognée plutôt que de passer sous le reste) ;
// - en bas à gauche : Recentrer (si le suivi est coupé), icônes d'état (fantôme…), compteur + limitation ;
// - en bas à droite : SOS au-dessus du gros ⚠️ ;
// - tout en bas : mentions des cartes en tout petit, puis le volet.
// Utilisé par l'écran Carte en navigation et par l'aperçu nav-preview.tsx (captures).

export type HudAlert = {
  /** Même id = même alerte (le texte peut changer : « dans 200 m », « dans 150 m ») */
  id: string;
  icon: ReactNode | string;
  text: string;
  tone?: 'warning' | 'night' | 'danger';
};

/** Une alerte reste affichée ce temps, puis la suivante ; ensuite seulement un petit rappel */
const ALERT_SHOW_MS = 6000;
export const NAV_RAIL_BUTTON = 44;

export function NavHud({
  banner,
  alerts,
  topExtra,
  speed,
  status,
  compass,
  muted,
  onMute,
  onMore,
  sos,
  danger,
  onRecenter,
  bottom,
  attribution,
}: {
  banner: ReactNode;
  alerts: HudAlert[];
  /** Convoi, messages courts : sous la pastille */
  topExtra?: ReactNode;
  speed: ReactNode;
  /** Petites icônes d'état (fantôme, « Je rentre », simulation) */
  status?: ReactNode;
  compass: ReactNode;
  muted: boolean;
  onMute: () => void;
  onMore: () => void;
  sos: ReactNode;
  /** Gros bouton ⚠️ (et interrupteur passager au-dessus s'il est activé) */
  danger: ReactNode;
  /** Suivi coupé : petit bouton rond pour revenir au mode conduite */
  onRecenter: (() => void) | null;
  bottom: ReactNode;
  attribution: string;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 4, paddingLeft: insets.left + 8, paddingRight: insets.right + 8 },
      ]}
      pointerEvents="box-none">
      <View style={styles.top} pointerEvents="box-none">
        {banner}
        <AlertPill alerts={alerts} />
        {topExtra}
      </View>

      <View style={styles.middle} pointerEvents="box-none">
        <View style={styles.rail}>
          {compass}
          <Pressable
            style={styles.railButton}
            onPress={onMute}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Réactiver la voix' : 'Couper la voix'}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.railButton} onPress={onMore} hitSlop={6} accessibilityRole="button" accessibilityLabel="Plus d’options">
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.controls} pointerEvents="box-none">
        <View style={styles.leftColumn} pointerEvents="box-none">
          {onRecenter && (
            <Pressable
              style={styles.recenter}
              onPress={onRecenter}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Recentrer sur ma position">
              <Ionicons name="navigate" size={24} color={Colors.accent} />
            </Pressable>
          )}
          {status && (
            <View style={styles.status} pointerEvents="box-none">
              {status}
            </View>
          )}
          {speed}
        </View>
        <View style={styles.rightColumn} pointerEvents="box-none">
          {sos}
          {danger}
        </View>
      </View>

      <Text style={styles.attribution} numberOfLines={1} pointerEvents="none">
        {attribution}
      </Text>
      <View style={styles.bottom} pointerEvents="box-none">
        {bottom}
      </View>
    </View>
  );
}

/** Petite icône d'état ronde (mode fantôme, « Je rentre », simulation) */
export function HudStatusIcon({
  icon,
  family = 'ion',
  color,
  label,
  onPress,
}: {
  icon: string;
  family?: 'ion' | 'mci';
  color: string;
  label: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const glyph =
    family === 'mci' ? (
      <MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={18} color={color} />
    ) : (
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={color} />
    );
  return (
    <Pressable style={styles.statusIcon} onPress={onPress} disabled={!onPress} hitSlop={6} accessibilityLabel={label}>
      {glyph}
    </Pressable>
  );
}

/**
 * Une seule petite pastille sous l'instruction : chaque nouvelle alerte s'affiche 6 s (une dangereuse
 * passe devant), puis il ne reste qu'un petit rappel avec le nombre ; toucher = la liste de toutes.
 */
function AlertPill({ alerts }: { alerts: HudAlert[] }) {
  const Colors = useColors();
  const styles = useStyles();
  const [now, setNow] = useState(() => Date.now());
  const [shown, setShown] = useState<{ id: string; until: number } | null>(null);
  // Alertes déjà montrées (oubliées quand elles disparaissent : un nouveau virage se remontre)
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!alerts.length) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [alerts.length]);

  const ids = alerts.map((a) => a.id);
  const stillDone = done.filter((id) => ids.includes(id));
  if (stillDone.length !== done.length) setDone(stillDone);
  const active = shown && shown.until > now && ids.includes(shown.id) ? shown : null;
  const fresh = alerts.filter((a) => !stillDone.includes(a.id) && a.id !== active?.id);
  const urgent = fresh.find((a) => a.tone === 'danger');
  const activeAlert = active ? alerts.find((a) => a.id === active.id) : null;
  const next = urgent && activeAlert?.tone !== 'danger' ? urgent : !active ? fresh[0] : null;
  if (next) {
    setShown({ id: next.id, until: now + ALERT_SHOW_MS });
    setDone([...stillDone, next.id]);
  } else if (shown && !active) setShown(null);

  const current = activeAlert;
  if (!alerts.length) return null;
  return (
    <>
      {current ? (
        <Pressable
          style={[styles.pill, current.tone === 'night' && styles.pillNight, current.tone === 'danger' && styles.pillDanger]}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${current.text}. Toucher pour voir toutes les alertes`}>
          {typeof current.icon === 'string' ? <Text style={styles.pillEmoji}>{current.icon}</Text> : current.icon}
          <Text style={styles.pillText} numberOfLines={1}>
            {current.text}
          </Text>
          {alerts.length > 1 && <Text style={styles.pillCount}>+{alerts.length - 1}</Text>}
        </Pressable>
      ) : (
        <Pressable
          style={styles.reminder}
          onPress={() => setOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${alerts.length} alerte${alerts.length > 1 ? 's' : ''} sur le trajet`}>
          <Ionicons name="alert-circle" size={16} color={Colors.warning} />
          <Text style={styles.reminderText}>{alerts.length}</Text>
        </Pressable>
      )}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.list}>
            <Text style={styles.listTitle}>Alertes sur le trajet</Text>
            {alerts.map((a) => (
              <View key={a.id} style={styles.listRow}>
                <View style={[styles.listDot, a.tone === 'night' && styles.pillNight, a.tone === 'danger' && styles.pillDanger]}>
                  {typeof a.icon === 'string' ? <Text style={styles.pillEmoji}>{a.icon}</Text> : a.icon}
                </View>
                <Text style={styles.listText}>{a.text}</Text>
              </View>
            ))}
            <Pressable style={styles.listClose} onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={styles.listCloseText}>Fermer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 4 },
  top: { gap: 6, alignItems: 'stretch' },
  // Toute la place libre ; la colonne de droite y est rognée plutôt que de passer sous le reste
  middle: { flex: 1, minHeight: 0, overflow: 'hidden', alignItems: 'flex-end', paddingTop: 8 },
  rail: { gap: 8, padding: 4, borderRadius: Radius.pill, backgroundColor: Colors.surfaceGlass, alignItems: 'center' },
  railButton: {
    width: NAV_RAIL_BUTTON,
    height: NAV_RAIL_BUTTON,
    borderRadius: NAV_RAIL_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    elevation: 2,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 },
  leftColumn: { gap: 8, alignItems: 'flex-start', flexShrink: 1 },
  rightColumn: { gap: 12, alignItems: 'flex-end' },
  status: { flexDirection: 'row', gap: 6 },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceGlass,
  },
  recenter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  attribution: { alignSelf: 'center', fontSize: 9, lineHeight: 12, color: Colors.textMuted, marginTop: 4, marginBottom: 2, opacity: 0.85 },
  bottom: { gap: 8 },
  pill: {
    alignSelf: 'center',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.warning,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    elevation: 3,
  },
  pillNight: { backgroundColor: Colors.accentDark },
  pillDanger: { backgroundColor: Colors.danger },
  pillEmoji: { fontSize: Type.body },
  pillText: { flexShrink: 1, color: Colors.white, fontFamily: Fonts.bold, fontSize: Type.small + 1 },
  pillCount: { color: Colors.white, fontSize: Type.small, opacity: 0.85 },
  reminder: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceGlass,
  },
  reminderText: { fontSize: Type.small, fontWeight: '800', color: Colors.text },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'center', padding: 24 },
  list: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: 16, gap: 12 },
  listTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.warning },
  listText: { flex: 1, fontSize: Type.body, color: Colors.text },
  listClose: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12 },
  listCloseText: { fontSize: Type.body, fontWeight: '800', color: Colors.accent },
}));
