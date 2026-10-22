import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, Type } from '@/constants/theme';
import { useDisplayName } from '@/lib/display-names';

type Props = {
  photoUrl: string;
  /** Titre libre ; ou userId + username : nom affiché (sinon @pseudo), @pseudo repris dessous */
  title?: string;
  userId?: string;
  username?: string;
  /** Après le nom (« (toi) », ❤️) */
  titleSuffix?: string;
  subtitle?: string | null;
  onPress?: () => void;
  /** Boutons ou case à cocher à droite */
  right?: ReactNode;
};

/** Ligne de liste avec avatar (amis, recherche, sélection). */
export function PersonRow({ photoUrl, title, userId, username, titleSuffix, subtitle, onPress, right }: Props) {
  const styles = useStyles();
  const displayName = useDisplayName(userId);
  if (username !== undefined) {
    title = displayName ?? `@${username}`;
    if (displayName) subtitle = subtitle ? `@${username} · ${subtitle}` : `@${username}`;
  }
  if (titleSuffix) title = `${title ?? ''}${titleSuffix}`;
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <Image source={{ uri: photoUrl }} style={styles.avatar} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
  text: { flex: 1, gap: 1 },
  title: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: Type.small, color: Colors.textMuted },
}));
