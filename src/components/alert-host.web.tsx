import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View, type AlertButton, type AlertOptions } from 'react-native';

import { makeStyles } from '@/constants/theme';

// Version web : Alert.alert de react-native-web ne fait rien. On le remplace par une
// boîte de dialogue aux couleurs de l'app (mêmes boutons, même ordre que sur Android).

type Dialog = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };

const queue: Dialog[] = [];
let listener: (() => void) | null = null;

Alert.alert = (title, message, buttons, options) => {
  queue.push({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options });
  listener?.();
};

export function AlertHost() {
  const styles = useStyles();
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    const next = () => setDialog((current) => current ?? queue.shift() ?? null);
    listener = next;
    next();
    return () => {
      listener = null;
    };
  }, []);

  const close = (button?: AlertButton) => {
    const current = dialog;
    setDialog(queue.shift() ?? null);
    if (button) button.onPress?.();
    else {
      // Fermé sans choisir (clic à côté, Échap) : bouton Annuler s'il existe, sinon onDismiss
      const cancel = current?.buttons.find((b) => b.style === 'cancel');
      if (cancel) cancel.onPress?.();
      else current?.options?.onDismiss?.();
    }
  };

  return (
    <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => close()}>
      <Pressable style={styles.backdrop} onPress={() => close()}>
        <Pressable style={styles.dialog}>
          {!!dialog?.title && <Text style={styles.title}>{dialog.title}</Text>}
          {!!dialog?.message && <Text style={styles.message}>{dialog.message}</Text>}
          <View style={styles.buttons}>
            {dialog?.buttons.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                style={({ pressed, hovered }) => [styles.button, (pressed || hovered) && styles.buttonHover]}
                onPress={() => close(b)}>
                <Text
                  style={[
                    styles.buttonText,
                    b.style === 'cancel' && styles.cancelText,
                    b.style === 'destructive' && styles.destructiveText,
                  ]}>
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.backdrop },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text },
  message: { fontSize: 15, lineHeight: 21, color: Colors.textMuted },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  buttonHover: { backgroundColor: Colors.background },
  buttonText: { fontSize: 15, fontWeight: '800', color: Colors.accent },
  cancelText: { color: Colors.textMuted },
  destructiveText: { color: Colors.danger },
}));
