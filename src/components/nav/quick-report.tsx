import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportSign } from '@/components/report-sign';
import { makeStyles, Radius, Type } from '@/constants/theme';
import { QUICK_REPORT_TYPES, reportInfo, type ReportType } from '@/lib/reports';

// Signalement de danger pensé pour la moto (sécurité d'abord : on ne manipule pas son téléphone en
// conduisant) :
// - en roulant : un SEUL gros bouton ⚠️, un tap = position marquée, rien d'autre à faire ;
// - à l'arrêt (ou passager) : 6 très grosses icônes, un tap = envoyé (annulable 5 s) ;
// - les dangers notés en roulant reviennent à l'arrêt : « Quel type de danger as-tu vu ? ».
// Jamais de police / radar (types limités par le serveur).

/** Gros bouton ⚠️ en bas à portée de pouce (en roulant : 1 tap = danger noté) */
export function DangerButton({ onPress, riding }: { onPress: () => void; riding: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.danger, riding && styles.dangerRiding, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={16}
      accessibilityLabel={riding ? 'Noter un danger ici' : 'Signaler un danger'}>
      <Text style={[styles.dangerIcon, riding && styles.dangerIconRiding]}>⚠️</Text>
    </Pressable>
  );
}

/** Interrupteur rapide « Je suis passager » */
export function PassengerToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.passenger, on && styles.passengerOn]}
      onPress={() => onChange(!on)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Je suis passager">
      <Text style={[styles.passengerText, on && styles.passengerTextOn]}>🎒 {on ? 'Passager' : 'Passager ?'}</Text>
    </Pressable>
  );
}

/**
 * Grille de 6 très grosses icônes. Mode « pending » : type d'un danger noté en roulant, avec
 * « Laisser Zone de danger » et « Supprimer ce signalement ».
 */
export function QuickReportSheet({
  visible,
  pending,
  onPick,
  onMore,
  onClose,
  onKeepGeneric,
  onDelete,
}: {
  visible: boolean;
  /** Ancienneté du danger noté en roulant (texte « il y a 3 min ») */
  pending?: string | null;
  onPick: (type: ReportType) => void;
  onMore?: () => void;
  onClose: () => void;
  onKeepGeneric?: () => void;
  onDelete?: () => void;
}) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Pressable>
            <ScrollView bounces={false}>
              <Text style={styles.title}>{pending ? 'Quel type de danger as-tu vu ?' : 'Signaler un danger ici'}</Text>
              {!!pending && <Text style={styles.sub}>Danger noté en roulant {pending}</Text>}
              <View style={styles.grid}>
                {QUICK_REPORT_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                    onPress={() => onPick(t.value)}
                    accessibilityLabel={t.label}>
                    <ReportSign type={t.value} size={72} />
                    <Text style={styles.tileLabel} numberOfLines={2}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {pending ? (
                <View style={styles.row}>
                  <Pressable style={styles.secondary} onPress={onKeepGeneric}>
                    <Text style={styles.secondaryText}>Laisser « Zone de danger »</Text>
                  </Pressable>
                  <Pressable style={[styles.secondary, styles.deleteBtn]} onPress={onDelete}>
                    <Text style={styles.deleteText}>Supprimer</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {onMore && (
                    <Pressable style={styles.more} onPress={onMore}>
                      <Text style={styles.moreText}>Autre danger (bouchon, zone de danger…)</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.secondary} onPress={onClose}>
                    <Text style={styles.secondaryText}>Annuler</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

/** « Accident signalé dans 5 s · Annuler » */
export function UndoReportBar({ type, seconds, onUndo }: { type: ReportType; seconds: number; onUndo: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.undo}>
      <Text style={styles.undoText} numberOfLines={2}>
        {reportInfo(type).emoji} {reportInfo(type).label} : envoi dans {seconds} s
      </Text>
      <Pressable style={styles.undoButton} onPress={onUndo} hitSlop={10} accessibilityLabel="Annuler le signalement">
        <Text style={styles.undoButtonText}>Annuler</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  danger: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.warning,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  dangerRiding: { width: 96, height: 96, borderRadius: 48, borderWidth: 5 },
  pressed: { transform: [{ scale: 0.94 }] },
  dangerIcon: { fontSize: Type.title },
  dangerIconRiding: { fontSize: 46 },
  passenger: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    elevation: 4,
  },
  passengerOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  passengerText: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  passengerTextOn: { color: Colors.white },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: 16, maxHeight: '92%' },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text, textAlign: 'center' },
  sub: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginTop: 16 },
  tile: {
    width: '48%',
    minHeight: 132,
    borderRadius: Radius.lg,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
  },
  tilePressed: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  tileLabel: { fontSize: Type.large, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  more: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  moreText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  secondary: {
    flex: 1,
    marginTop: 12,
    minHeight: 58,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryText: { fontSize: Type.body, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  deleteBtn: { flex: 0, paddingHorizontal: 16 },
  deleteText: { fontSize: Type.body, fontWeight: '800', color: Colors.danger },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.overlayStrong,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
  },
  undoText: { flex: 1, color: Colors.white, fontSize: Type.body, fontWeight: '800' },
  undoButton: { backgroundColor: Colors.white, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 12 },
  undoButtonText: { color: Colors.text, fontSize: Type.body, fontWeight: '900' },
}));
