import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { makeStyles, useColors } from '@/constants/theme';
import { formatDistance } from '@/components/person-card';
import { ReportSign } from '@/components/report-sign';
import { REPORT_TYPES, reportAge, reportInfo, type ReportType, type RoadReport, type Vote } from '@/lib/reports';

/** Choix du type de signalement : 9 gros boutons, aucun texte à saisir. */
export function ReportSheet({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (type: ReportType) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Pressable>
            <Text style={styles.title}>Signaler à cet endroit</Text>
            <View style={styles.grid}>
              {REPORT_TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                  onPress={() => onPick(t.value)}>
                  <ReportSign type={t.value} size={54} />
                  <Text style={styles.tileLabel} numberOfLines={2}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

/** Fiche d'un signalement : « Toujours là » / « Plus là ». */
export function ReportCard({
  report,
  distanceM,
  mine,
  alreadyVoted,
  onVote,
  onDelete,
  onClose,
}: {
  report: RoadReport;
  distanceM: number | null;
  mine: boolean;
  alreadyVoted: boolean;
  onVote: (vote: Vote) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const info = reportInfo(report.type);
  return (
    <View style={styles.card}>
      <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
        <Ionicons name="close" size={24} color={Colors.textMuted} />
      </Pressable>
      <View style={styles.header}>
        <ReportSign type={report.type} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{info.label}</Text>
          <Text style={styles.meta}>
            {reportAge(report.createdAt)} · par @{report.author}
            {distanceM !== null ? ` · à ${formatDistance(distanceM)}` : ''}
          </Text>
          {report.confirmations > 0 && (
            <Text style={styles.meta}>
              Confirmé {report.confirmations} fois{report.isDemo ? ' (démo)' : ''}
            </Text>
          )}
        </View>
      </View>
      {mine ? (
        <Pressable style={[styles.big, styles.gone]} onPress={onDelete}>
          <Ionicons name="trash" size={22} color={Colors.white} />
          <Text style={styles.bigText}>Retirer mon signalement</Text>
        </Pressable>
      ) : alreadyVoted ? (
        <Text style={styles.thanks}>Merci pour ta réponse !</Text>
      ) : (
        <View style={styles.row}>
          <Pressable style={[styles.big, styles.still]} onPress={() => onVote('still_there')}>
            <Ionicons name="checkmark" size={24} color={Colors.white} />
            <Text style={styles.bigText}>Toujours là</Text>
          </Pressable>
          <Pressable style={[styles.big, styles.gone]} onPress={() => onVote('gone')}>
            <Ionicons name="close" size={24} color={Colors.white} />
            <Text style={styles.bigText}>Plus là</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  title: { fontSize: 20, fontWeight: '900', color: Colors.text, marginBottom: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  tile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 4,
  },
  tilePressed: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  tileLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  cancel: { marginTop: 14, minHeight: 58, borderRadius: 16, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 18, fontWeight: '800', color: Colors.text },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  close: { position: 'absolute', top: 12, right: 12, zIndex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 28 },
  cardTitle: { fontSize: 20, fontWeight: '900', color: Colors.text },
  meta: { fontSize: 13, color: Colors.textMuted },
  row: { flexDirection: 'row', gap: 10 },
  big: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 64,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  still: { backgroundColor: Colors.success },
  gone: { backgroundColor: Colors.danger },
  bigText: { color: Colors.white, fontSize: 17, fontWeight: '900' },
  thanks: { textAlign: 'center', color: Colors.textMuted, fontWeight: '700' },
}));
