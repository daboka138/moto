import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { WallPhoto } from '@/lib/wall';
import { makeStyles, useColors } from '@/constants/theme';

type Props = {
  photo: WallPhoto | null;
  onClose: () => void;
  /** Présent uniquement sur mes propres photos */
  onDelete?: (photo: WallPhoto) => void;
  onAuthorPress?: (photo: WallPhoto) => void;
};

/** Photo en grand, avec légende et date. */
export function PhotoViewer({ photo, onClose, onDelete, onAuthorPress }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Modal visible={!!photo} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      {photo && (
        <View style={styles.backdrop}>
          <SafeAreaView style={styles.safe}>
            <View style={styles.top}>
              {photo.author ? (
                <Pressable style={styles.author} onPress={() => onAuthorPress?.(photo)}>
                  <Image source={{ uri: photo.author.avatarUrl }} style={styles.avatar} />
                  <Text style={styles.username}>@{photo.author.username}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <View style={styles.topActions}>
                {onDelete && (
                  <Pressable onPress={() => onDelete(photo)} hitSlop={12}>
                    <Ionicons name="trash-outline" size={24} color={Colors.white} />
                  </Pressable>
                )}
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={30} color={Colors.white} />
                </Pressable>
              </View>
            </View>

            <Image source={{ uri: photo.url }} style={styles.image} contentFit="contain" transition={150} />

            <View style={styles.bottom}>
              {!!photo.caption && <Text style={styles.caption}>{photo.caption}</Text>}
              <Text style={styles.date}>
                {new Date(photo.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </SafeAreaView>
        </View>
      )}
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, backgroundColor: Colors.viewerBackdrop },
  safe: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.darkSoft },
  username: { color: Colors.white, fontWeight: '700', fontSize: 16 },
  image: { flex: 1 },
  bottom: { padding: 16, gap: 6 },
  caption: { color: Colors.white, fontSize: 16, lineHeight: 22 },
  date: { color: Colors.textFaint, fontSize: 13 },
}));
