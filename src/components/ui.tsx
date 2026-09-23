import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const Colors = useColors();
  const styles = useStyles();
  const inactive = disabled || loading;
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
        <ActivityIndicator color={variant === 'primary' ? Colors.white : Colors.accent} />
      ) : (
        <Text style={[styles.buttonText, variant !== 'primary' && { color: Colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Petit bouton pour les lignes de liste (Ajouter, Accepter...) */
export function SmallButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
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

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.chip, selected && styles.chipSelected]}>
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
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: Colors.accent },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  ghost: { backgroundColor: 'transparent' },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  small: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  smallText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { fontSize: 14, color: Colors.text },
  chipTextSelected: { color: Colors.white, fontWeight: '600' },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
}));
