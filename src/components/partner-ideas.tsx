import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';
import { fetchPartnerLinks, linksNear, openPartnerLink, type PartnerLink } from '@/lib/partners';

/** « 💡 Besoin d'idées ? » : liens partenaires actifs de la zone (tous si position inconnue). */
export function PartnerIdeas({ near }: { near: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const [links, setLinks] = useState<PartnerLink[]>([]);

  useEffect(() => {
    fetchPartnerLinks()
      .then(setLinks)
      .catch(() => {});
  }, []);

  const shown = linksNear(links, near);
  if (!shown.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>💡 Besoin d’idées ?</Text>
      {shown.map((l) => (
        <Pressable key={l.id} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]} onPress={() => openPartnerLink(l)}>
          {l.imageUrl ? <Image source={{ uri: l.imageUrl }} style={styles.image} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle} numberOfLines={2}>
              {l.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[l.description, 'Partenaire'].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12, gap: 4 },
  title: { fontSize: Type.body, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  image: { width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.border },
  linkTitle: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  meta: { fontSize: Type.small, color: Colors.textMuted },
}));
