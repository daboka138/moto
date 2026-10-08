import type { DateTimeInputProps } from './date-time-input';

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Version web : champ <input type="date|time"> invisible posé sur la case affichée.
 * Un clic ouvre le sélecteur du navigateur.
 */
export function DateTimeInput({ mode, value, onChange, minimumDate, scheme }: DateTimeInputProps) {
  return (
    <input
      type={mode}
      aria-label={mode === 'date' ? 'Date' : 'Heure'}
      value={mode === 'date' ? dateValue(value) : timeValue(value)}
      min={mode === 'date' && minimumDate ? dateValue(minimumDate) : undefined}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Navigateur sans showPicker : le champ s'ouvre au clic de lui-même
        }
      }}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        if (!raw) return;
        const next = new Date(value);
        if (mode === 'date') {
          const [y, m, d] = raw.split('-').map(Number);
          next.setFullYear(y, m - 1, d);
        } else {
          const [h, min] = raw.split(':').map(Number);
          next.setHours(h, min, 0, 0);
        }
        onChange(next);
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        border: 'none',
        colorScheme: scheme,
      }}
    />
  );
}
