import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useColors } from '@/constants/theme';
import { useMessages } from '@/lib/messages-context';

/**
 * Bandeau « nouveau message » en haut de l'écran, partout dans l'app.
 * Pendant la conduite il reste en lecture seule : un appui ouvre la conversation,
 * mais la saisie y est bloquée tant qu'on roule.
 */
export function MessageToast() {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { toast, dismissToast } = useMessages();
  if (!toast) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Pressable
        style={styles.toast}
        onPress={() => {
          dismissToast();
          router.push({ pathname: '/chat/[id]', params: { id: toast.conversationId } });
        }}>
        <Ionicons name="chatbubble-ellipses" size={24} color={Colors.accent} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.title}
          </Text>
          <Text style={styles.body} numberOfLines={2}>
            {toast.body}
          </Text>
        </View>
        <Pressable onPress={dismissToast} hitSlop={12}>
          <Ionicons name="close" size={20} color={Colors.textMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text },
  body: { fontSize: 14, color: Colors.textMuted },
}));
