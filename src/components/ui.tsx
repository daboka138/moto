import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';

export type IconName = keyof typeof Ionicons.glyphMap;

type ButtonProps = {
  title: string;
  /** Icône Ionicons avant le libellé (jamais d'émoji dans un bouton) */
  icon?: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, icon, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const Colors = useColors();
  const styles = useStyles();
  const inactive = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        (pressed || inactive) && { opacity: 0.6 },
      ]}>
      {loading ? (
        <ActivityIndicator color={filled ? Colors.white : Colors.accent} />
      ) : (
        <View style={styles.buttonRow}>
          {icon && <Ionicons name={icon} size={20} color={filled ? Colors.white : Colors.accent} />}
          <Text style={[styles.buttonText, !filled && { color: Colors.text }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Petit bouton pour les lignes de liste (Ajouter, Accepter...) */
export function SmallButton({
  title,
  icon,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [
        styles.small,
        variant === 'primary' ? styles.primary : styles.secondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}>
      {icon && <Ionicons name={icon} size={16} color={variant === 'secondary' ? Colors.accent : Colors.white} />}
      <Text style={[styles.smallText, variant === 'secondary' && { color: Colors.text }]}>{title}</Text>
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; required?: boolean };

export function Field({ label, required, style, editable, placeholder, ...props }: FieldProps) {
  const Colors = useColors();
  const styles = useStyles();
  // Sécurité : pas de saisie pendant une navigation au-dessus de 10 km/h
  const { locked } = useDrivingLock();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: Colors.accent }}> *</Text>}
      </Text>
      <TextInput
        placeholderTextColor={Colors.textMuted}
        style={[styles.input, style, locked && { opacity: 0.5 }]}
        editable={!locked && editable !== false}
        placeholder={locked ? 'Désactivé en roulant' : placeholder}
        {...props}
      />
    </View>
  );
}

export function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.chip, selected && styles.chipSelected]}>
      {icon && <Ionicons name={icon} size={16} color={selected ? Colors.white : Colors.textMuted} />}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: Colors.accent },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: Colors.danger },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: Colors.white, fontSize: Type.body, fontWeight: '700' },
  small: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  smallText: { color: Colors.white, fontSize: Type.small, fontWeight: '700' },
  field: { gap: 8 },
  label: { fontSize: Type.body, fontWeight: '600', color: Colors.text },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: Type.body,
    color: Colors.text,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: Type.body, color: Colors.text },
  chipTextSelected: { color: Colors.white, fontWeight: '600' },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 16,
    gap: 16,
  },
  sectionTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.5 },
}));
