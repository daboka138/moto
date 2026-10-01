import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useColors } from '@/constants/theme';
import type { PublicProfile } from '@/lib/friends';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

type Props = {
  visible: boolean;
  /** Amis qui suivent déjà mon trajet */
  sharedWith: string[];
  onShare: (friend: PublicProfile) => Promise<void>;
  onClose: () => void;
};

/** Choix des amis qui recevront mon trajet en direct dans Messages. */
export function ShareTripSheet({ visible, sharedWith, onShare, onClose }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state } = useFriends();
  const [sending, setSending] = useState<string | null>(null);

  const share = async (friend: PublicProfile) => {
    if (sending || sharedWith.includes(friend.id)) return;
    setSending(friend.id);
    try {
      await onShare(friend);
    } catch (e) {
      Alert.alert('Partage impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Partager mon trajet</Text>
            <Pressable style={styles.close} onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
              <Ionicons name="close" size={28} color={Colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.muted}>
            Ton ami reçoit dans Messages ta destination, ton heure d’arrivée estimée et ta position, mises à jour jusqu’à
            l’arrivée. Le partage s’arrête tout seul à l’arrivée ou quand tu arrêtes la navigation.
          </Text>
          <ScrollView style={styles.list}>
            {!state ? (
              <ActivityIndicator color={Colors.accent} style={{ padding: 16 }} />
            ) : state.friends.length === 0 ? (
              <Text style={styles.muted}>Ajoute des amis pour partager ton trajet avec eux.</Text>
            ) : (
              state.friends.map((f) => {
                const shared = sharedWith.includes(f.id);
                return (
                  <Pressable
                    key={f.id}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                    onPress={() => share(f)}
                    disabled={shared || !!sending}>
                    <Image source={{ uri: photoUrl(f.avatar_path) }} style={styles.avatar} />
                    <Text style={styles.name} numberOfLines={1}>
                      @{f.username}
                    </Text>
                    {sending === f.id ? (
                      <ActivityIndicator color={Colors.accent} />
                    ) : shared ? (
                      <View style={styles.sharedTag}>
                        <Ionicons name="checkmark" size={18} color={Colors.success} />
                        <Text style={styles.sharedText}>Suit ton trajet</Text>
                      </View>
                    ) : (
                      <Ionicons name="send" size={26} color={Colors.accent} />
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  sheet: {
    maxHeight: '80%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: Colors.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 14, color: Colors.textMuted },
  list: { maxHeight: 380 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.text },
  sharedTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sharedText: { color: Colors.success, fontWeight: '700' },
}));
