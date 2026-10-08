import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

export type DateTimeInputProps = {
  mode: 'date' | 'time';
  value: Date;
  onChange: (value: Date) => void;
  minimumDate?: Date;
  /** Natif : le sélecteur (boîte de dialogue) est ouvert */
  open: boolean;
  onClose: () => void;
  scheme: 'light' | 'dark';
};

/** Sélecteur natif de date ou d'heure (boîte de dialogue Android). */
export function DateTimeInput({ mode, value, onChange, minimumDate, open, onClose, scheme }: DateTimeInputProps) {
  if (!open) return null;
  const handle = (event: DateTimePickerEvent, date?: Date) => {
    onClose();
    if (event.type === 'set' && date) onChange(date);
  };
  return (
    <DateTimePicker
      value={value}
      mode={mode}
      is24Hour
      minimumDate={minimumDate}
      themeVariant={scheme}
      onChange={handle}
    />
  );
}
