import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { ChatWallpaper } from '@/components/chat-wallpaper';
import { makeStyles, useColors } from '@/constants/theme';
import type { Wallpaper } from '@/lib/wallpapers';

/**
 * Fond d'écran d'une conversation en plein écran, sans les messages (icône 👁 du chat) :
 * barre ← « Fond d'écran » · Changer. Le retour Android ferme (onRequestClose).
 */
export function WallpaperViewer({
  visible,
  wallpaper,
  photoUrl,
  onClose,
  onChange,
}: {
  visible: boolean;
  wallpaper: Wallpaper;
  photoUrl?: string | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
          <View style={styles.bar}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.back} accessibilityLabel="Retour">
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              Fond d’écran
            </Text>
            <Pressable onPress={onChange} hitSlop={8} style={styles.change} accessibilityLabel="Changer le fond d’écran">
              <Text style={styles.changeText}>Changer</Text>
            </Pressable>
          </View>
          <View style={styles.flex}>
            <ChatWallpaper wallpaper={wallpaper} photoUrl={photoUrl} />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text },
  change: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: Colors.accent },
  changeText: { fontSize: 15, fontWeight: '700', color: Colors.white },
}));
