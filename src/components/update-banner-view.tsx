import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, Type } from '@/constants/theme';

/** Petit bandeau en haut de l'écran (non bloquant) : mise à jour en cours / prête */
export function UpdateBannerView({
  title,
  details,
  actionLabel,
  onAction,
  onLater,
}: {
  title: string;
  details?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onLater?: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <View style={styles.banner} accessibilityRole="alert">
        <View style={styles.texts}>
          <Text style={styles.title}>{title}</Text>
          {!!details && (
            <Text style={styles.details} numberOfLines={3}>
              {details}
            </Text>
          )}
        </View>
        {(onAction || onLater) && (
          <View style={styles.actions}>
            {onLater && (
              <Pressable onPress={onLater} hitSlop={8} style={({ pressed }) => [styles.later, pressed && styles.pressed]}>
                <Text style={styles.laterText}>Plus tard</Text>
              </Pressable>
            )}
            {onAction && actionLabel && (
              <Pressable onPress={onAction} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={styles.actionText}>{actionLabel}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { position: 'absolute', left: 10, right: 10, alignItems: 'center', zIndex: 1000, elevation: 4 },
  banner: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  texts: { gap: 2 },
  title: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  details: { fontSize: Type.small, color: Colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 },
  later: { paddingVertical: 8 },
  laterText: { fontSize: Type.body, fontWeight: '700', color: Colors.textMuted },
  action: { backgroundColor: Colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  actionText: { fontSize: Type.body, fontWeight: '800', color: Colors.white },
  pressed: { opacity: 0.6 },
}));
