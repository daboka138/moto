import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';

// Menu d'actions en bas de l'écran. Remplace Alert.alert quand il y a plus de
// 3 choix (Android n'affiche que 3 boutons dans une alerte).

export type SheetOption = {
  label: string;
  /** Icône Ionicons à gauche du libellé (pas d'émoji dans les menus) */
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};
type Sheet = { title?: string; message?: string; options: SheetOption[]; /** Appelé à la fermeture, quel que soit le choix */ onClose?: () => void };

let listener: ((sheet: Sheet | null) => void) | null = null;

/** Affiche le menu (l'hôte <ActionSheetHost /> est monté une fois, à la racine). */
export function showActionSheet(sheet: Sheet) {
  listener?.(sheet);
}

export function ActionSheetHost() {
  const styles = useStyles();
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet | null>(null);

  useEffect(() => {
    listener = setSheet;
    return () => {
      listener = null;
    };
  }, []);

  const close = () => {
    sheet?.onClose?.();
    setSheet(null);
  };

  return (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {!!sheet?.title && <Text style={styles.title}>{sheet.title}</Text>}
          {!!sheet?.message && <Text style={styles.message}>{sheet.message}</Text>}
          {sheet?.options.map((o) => (
            <Pressable
              key={o.label}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              onPress={() => {
                close();
                o.onPress();
              }}>
              {o.icon && <Ionicons name={o.icon} size={20} color={o.destructive ? Colors.danger : Colors.textMuted} />}
              <Text style={[styles.optionText, o.destructive && styles.destructive]}>{o.label}</Text>
            </Pressable>
          ))}
          <Pressable style={({ pressed }) => [styles.option, styles.cancel, pressed && styles.pressed]} onPress={close}>
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 4,
  },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  message: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
  option: { flexDirection: 'row', gap: 12, paddingVertical: 16, paddingHorizontal: 16, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: Colors.background },
  optionText: { fontSize: Type.body, fontWeight: '600', color: Colors.text },
  destructive: { color: Colors.danger },
  cancel: { marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border, borderRadius: 0 },
  cancelText: { fontSize: Type.body, fontWeight: '800', color: Colors.textMuted },
}));
