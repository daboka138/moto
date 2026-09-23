import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  photoUrl: string;
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  /** Boutons ou case à cocher à droite */
  right?: ReactNode;
};

/** Ligne de liste avec avatar (amis, recherche, sélection). */
export function PersonRow({ photoUrl, title, subtitle, onPress, right }: Props) {
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted },
});
