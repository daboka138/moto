import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openFiche } from '@/components/guide/guide-ui';
import { makeStyles, Radius, Type } from '@/constants/theme';
import { ASTUCES, type AstuceId } from '@/guide/contenu';
import { markTipSeen, useGuideState } from '@/guide/state';

/**
 * Astuce contextuelle : bulle affichée une seule fois, la première fois qu'on ouvre l'écran.
 * Réaffichable depuis Paramètres › Aide › Réafficher les astuces. Texte dans src/guide/contenu.ts.
 */
export function TipBubble({ id, enabled = true }: { id: AstuceId; enabled?: boolean }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { welcomeDone, tipsSeen } = useGuideState();
  const pending = enabled && welcomeDone && !tipsSeen.includes(id);
  // Petit délai : l'écran s'affiche d'abord, la bulle ensuite
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setReady(true), 700);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending || !ready) return null;
  const tip = ASTUCES[id];
  return (
    <Modal transparent animationType="fade" onRequestClose={() => markTipSeen(id)}>
      <Pressable style={styles.backdrop} onPress={() => markTipSeen(id)}>
        <Pressable style={[styles.bubble, { marginBottom: insets.bottom + 24 }]} onPress={() => {}}>
          <Text style={styles.title}>💡 {tip.titre}</Text>
          <Text style={styles.text}>{tip.texte}</Text>
          <View style={styles.actions}>
            <Pressable
              hitSlop={8}
              onPress={() => {
                markTipSeen(id);
                openFiche(tip.fiche);
              }}>
              <Text style={styles.more}>En savoir plus</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.ok, pressed && { opacity: 0.7 }]} onPress={() => markTipSeen(id)}>
              <Text style={styles.okText}>OK compris</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: Colors.backdrop, padding: 16 },
  bubble: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderTopWidth: 4,
    borderTopColor: Colors.accent,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  text: { fontSize: Type.body, lineHeight: 21, color: Colors.text },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  more: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  ok: { backgroundColor: Colors.accent, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 12 },
  okText: { fontSize: Type.body, fontWeight: '800', color: Colors.white },
}));
