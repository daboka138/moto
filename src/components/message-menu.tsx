import { Modal, Pressable, Text, View } from 'react-native';

import { makeStyles } from '@/constants/theme';
import { REACTIONS } from '@/lib/messages';

export type MessageAction = { label: string; destructive?: boolean; onPress: () => void };

/**
 * Appui long sur un message : barre de réactions (❤️ 😂 😮 😢 👍 🔥 🏍️, la mienne entourée,
 * re-toucher = retirer) puis les actions (modifier, supprimer, signaler…).
 */
export function MessageMenu({
  visible,
  myReaction,
  onReact,
  actions,
  onClose,
}: {
  visible: boolean;
  myReaction: string | null;
  /** null : pas de réaction possible (message supprimé…) */
  onReact: ((emoji: string) => void) | null;
  actions: MessageAction[];
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Appui sur la carte : ne ferme pas le menu */}
        <Pressable style={styles.card} onPress={() => {}}>
          {onReact && (
            <View style={styles.emojis}>
              {REACTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => {
                    onClose();
                    onReact(e);
                  }}
                  style={({ pressed }) => [styles.emoji, myReaction === e && styles.emojiMine, pressed && { opacity: 0.6 }]}
                  accessibilityLabel={myReaction === e ? `Retirer ${e}` : `Réagir ${e}`}>
                  <Text style={styles.emojiText}>{e}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
              <Text style={[styles.actionText, a.destructive && styles.destructive]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={styles.action}>
            <Text style={styles.cancel}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, backgroundColor: Colors.overlayLight, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: Colors.surface, borderRadius: 18, paddingVertical: 8, maxWidth: 420, width: '100%', alignSelf: 'center' },
  emojis: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  emoji: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emojiMine: { backgroundColor: Colors.accentSoft, borderWidth: 2, borderColor: Colors.accent },
  emojiText: { fontSize: 24 },
  action: { paddingVertical: 14, paddingHorizontal: 20 },
  actionText: { fontSize: 16, color: Colors.text, fontWeight: '600' },
  destructive: { color: Colors.danger },
  cancel: { fontSize: 16, color: Colors.textMuted, textAlign: 'center' },
}));
