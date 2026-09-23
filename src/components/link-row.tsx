import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';

/** Groupe de lignes cliquables (profil, paramètres). */
export function LinkGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.group}>{children}</View>;
}

export function LinkSeparator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

/** Ligne « icône · libellé · valeur · › » */
export function LinkRow({
  icon,
  label,
  value,
  badge,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  badge?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={styles.link} onPress={onPress}>
      <Ionicons name={icon} size={22} color={danger ? Colors.danger : Colors.accent} />
      <Text style={[styles.label, danger && { color: Colors.danger }]}>{label}</Text>
      {badge && <Text style={styles.badge}>{badge}</Text>}
      {value !== undefined && <Text style={styles.value}>{value}</Text>}
      {!danger && <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  group: { backgroundColor: Colors.surface, borderRadius: 18, paddingHorizontal: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 52 },
  label: { flex: 1, fontSize: 16, fontWeight: '700', color: Colors.text },
  value: { fontSize: 15, color: Colors.textMuted },
  badge: {
    backgroundColor: Colors.accent,
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: Colors.border },
}));
