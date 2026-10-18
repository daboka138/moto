import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { OpenInApp } from '@/components/open-in-app';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { SUPPORT_EMAIL, type Fiche } from '@/guide/contenu';
import { contactSupport } from '@/guide/support';
import { IS_WEB } from '@/lib/app-link';
import { useSession } from '@/lib/session';

export const openFiche = (id: string) => router.push({ pathname: '/help/[id]', params: { id } });

/** Ligne « emoji · titre · but » d'une fiche */
export function FicheRow({ fiche, first }: { fiche: Fiche; first?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && { opacity: 0.6 }]}
      onPress={() => openFiche(fiche.id)}>
      <Text style={styles.rowEmoji}>{fiche.emoji}</Text>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{fiche.titre}</Text>
        <Text style={styles.rowBut} numberOfLines={2}>
          {fiche.but}
        </Text>
        {IS_WEB && fiche.android && <Text style={styles.androidTag}>📱 App Android</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

/** Version web : la fonction est réservée à l'app Android */
export function AndroidOnlyNote({ fiche }: { fiche: Fiche }) {
  const styles = useStyles();
  if (!IS_WEB || !fiche.android) return null;
  return (
    <View style={styles.androidBox}>
      <Text style={styles.androidTitle}>📱 Réservé à l’app Android</Text>
      {!!fiche.web && <Text style={styles.androidText}>{fiche.web}</Text>}
      <OpenInApp path="/" compact />
    </View>
  );
}

/** « Contacter le support » : mail prérempli (version, appareil, pseudo ; jamais la position) */
export function SupportButton() {
  const Colors = useColors();
  const styles = useStyles();
  const { profile } = useSession();
  return (
    <Pressable
      style={({ pressed }) => [styles.support, pressed && { opacity: 0.7 }]}
      onPress={() => contactSupport(profile?.username)}>
      <Ionicons name="mail" size={22} color={Colors.white} />
      <View style={{ flex: 1 }}>
        <Text style={styles.supportTitle}>Contacter le support</Text>
        <Text style={styles.supportText}>{SUPPORT_EMAIL} · réponse sous quelques jours</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowEmoji: { fontSize: Type.title, width: 32, textAlign: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  rowBut: { fontSize: Type.small, color: Colors.textMuted },
  androidTag: { fontSize: Type.small, fontWeight: '700', color: Colors.accentDark },
  androidBox: { backgroundColor: Colors.accentSoft, borderRadius: Radius.md, padding: 16, gap: 8 },
  androidTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  androidText: { fontSize: Type.body, color: Colors.text },
  support: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: 16,
  },
  supportTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.white },
  supportText: { fontSize: Type.small, color: Colors.white, opacity: 0.9 },
}));
