import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Chip, Section } from '@/components/ui';
import { makeStyles, Type } from '@/constants/theme';
import { fetchMyAdminClubs } from '@/lib/clubs';

/**
 * « Publier au nom de » : moi ou un club dont je suis admin. Au nom d'un club, tous ses membres
 * sont invités automatiquement (serveur). Rien d'affiché si je n'administre aucun club.
 */
export function ClubPicker({ userId, value, onChange }: { userId: string | undefined; value: string | null; onChange: (id: string | null) => void }) {
  const styles = useStyles();
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyAdminClubs(userId)
      .then((c) => !cancelled && setClubs(c))
      .catch((e) => console.warn('Clubs indisponibles', e));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!clubs.length) return null;
  return (
    <Section title="Publier au nom de">
      <View style={styles.chips}>
        <Chip label="Moi" selected={value === null} onPress={() => onChange(null)} />
        {clubs.map((c) => (
          <Chip key={c.id} label={`🏁 ${c.name}`} selected={value === c.id} onPress={() => onChange(c.id)} />
        ))}
      </View>
      {value && <Text style={styles.hint}>Tous les membres du club seront invités automatiquement.</Text>}
    </Section>
  );
}

const useStyles = makeStyles((Colors) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: Type.small, color: Colors.textMuted },
}));
