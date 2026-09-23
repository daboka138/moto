import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors, useTheme } from '@/constants/theme';
import type { Place } from '@/lib/geocoding';

/** Champ qui affiche un lieu choisi et ouvre le sélecteur au toucher. */
export function PlaceField({
  label,
  required,
  value,
  placeholder,
  onPress,
  onClear,
  color,
}: {
  label: string;
  required?: boolean;
  value: Place | null;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
  color?: string;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={{ color: Colors.accent }}> *</Text>}
      </Text>
      <Pressable style={styles.box} onPress={onPress}>
        <Ionicons name="location" size={18} color={color ?? Colors.accent} />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={2}>
          {value?.label ?? placeholder}
        </Text>
        {value && onClear ? (
          <Pressable onPress={onClear} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        )}
      </Pressable>
    </View>
  );
}

/** Choix de la date ou de l'heure (sélecteur natif). */
export function DateTimeField({
  label,
  mode,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  mode: 'date' | 'time';
  value: Date;
  onChange: (value: Date) => void;
  minimumDate?: Date;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const { scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const text =
    mode === 'date'
      ? value.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : value.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const handle = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) onChange(date);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.box} onPress={() => setOpen(true)}>
        <Ionicons name={mode === 'date' ? 'calendar' : 'time'} size={18} color={Colors.accent} />
        <Text style={[styles.value, { textTransform: 'capitalize' }]}>{text}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value}
          mode={mode}
          is24Hour
          minimumDate={minimumDate}
          themeVariant={scheme}
          onChange={handle}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: { flex: 1, fontSize: 16, color: Colors.text },
  placeholder: { color: Colors.textMuted },
}));
