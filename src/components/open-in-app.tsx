import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { openInApp, PLAY_STORE_URL, webDevice } from '@/lib/app-link';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Version web : fonction réservée à l'app Android. Android : bouton « Ouvrir dans l'app »
 * (l'app au bon écran, sinon Google Play). iPhone : bientôt disponible. Ordinateur : Google Play.
 */
export function OpenInApp({ path, compact }: { path: string; compact?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  const device = webDevice();

  if (device === 'ios') {
    return (
      <View style={[styles.note, compact && styles.compact]}>
        <Ionicons name="logo-apple" size={18} color={Colors.textMuted} />
        <Text style={styles.noteText}>Bientôt disponible sur iPhone.</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Pressable
        style={({ pressed }) => [styles.button, compact && styles.compact, pressed && { opacity: 0.7 }]}
        onPress={() => (device === 'android' ? openInApp(path) : Linking.openURL(PLAY_STORE_URL))}>
        <Ionicons
          name={device === 'android' ? 'open-outline' : 'logo-google-playstore'}
          size={20}
          color={Colors.white}
        />
        <Text style={styles.buttonText}>
          {device === 'android' ? 'Ouvrir dans l’app' : 'Télécharger sur Google Play'}
        </Text>
      </Pressable>
      {!compact && (
        <Text style={styles.hint}>
          {device === 'android'
            ? 'Pas encore installée ? Tu arriveras sur Google Play.'
            : 'Installe PasseRyder sur ton téléphone Android pour utiliser cette fonction.'}
        </Text>
      )}
    </View>
  );
}

/** Écran complet d'une fonction réservée à l'app (version web). */
export function AppOnlyScreen({
  icon,
  title,
  description,
  path,
}: {
  icon: IconName;
  title: string;
  description: string;
  path: string;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={40} color={Colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.badge}>Disponible dans l’app Android</Text>
      <OpenInApp path={path} />
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentSoft,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  description: { fontSize: 15, lineHeight: 22, color: Colors.textMuted, textAlign: 'center', maxWidth: 420 },
  badge: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  block: { alignItems: 'center', gap: 8 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  compact: { paddingHorizontal: 14, paddingVertical: 8 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteText: { fontSize: 15, fontWeight: '600', color: Colors.textMuted },
}));
