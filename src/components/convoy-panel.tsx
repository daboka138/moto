import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { roleLabel, type Convoy, type ConvoyMember } from '@/lib/convoy';

/**
 * Convoi d'une balade en cours, sur la carte : pastille « 5/6 groupés » (rouge si quelqu'un
 * décroche), dépliable en liste des participants avec leur rôle et leur état.
 */
export function ConvoyPanel({ convoy, compact, onOpenRide }: { convoy: Convoy; compact?: boolean; onOpenRide: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { members, dropped } = convoy;
  if (!members.length) return null;
  const grouped = members.filter((m) => m.state === 'ok').length;
  const alert = dropped.length > 0;

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.chip, alert && styles.chipAlert]}
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel="Convoi de la balade">
        <MaterialCommunityIcons name="motorbike" size={18} color={Colors.white} />
        <Text style={styles.chipText} numberOfLines={1}>
          {alert
            ? `${dropped[0].username} ${dropped[0].state === 'stopped' ? 'arrêté' : 'a décroché'}${dropped.length > 1 ? ` (+${dropped.length - 1})` : ''}`
            : `Convoi · ${grouped}/${members.length} groupés`}
        </Text>
        {!compact && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.white} />}
      </Pressable>
      {open && !compact && (
        <View style={styles.list}>
          <Text style={styles.title} numberOfLines={1}>
            {convoy.ride.title}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={{ gap: 8 }}>
            {members.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ScrollView>
          <Pressable onPress={onOpenRide} hitSlop={6}>
            <Text style={styles.link}>Voir la balade</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MemberRow({ member: m }: { member: ConvoyMember }) {
  const Colors = useColors();
  const styles = useStyles();
  const color =
    m.state === 'ok' ? Colors.success : m.state === 'lost' ? Colors.textMuted : Colors.danger;
  const role = roleLabel(m);
  return (
    <View style={styles.row}>
      <Image source={{ uri: m.avatarUrl }} style={styles.avatar} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {m.isMe ? 'Moi' : `@${m.username}`}
          {role ? `  ${role}` : ''}
        </Text>
        <Text style={[styles.detail, { color }]} numberOfLines={1}>
          {m.state === 'ok' ? 'Avec le groupe' : m.detail}
        </Text>
      </View>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { alignSelf: 'center', alignItems: 'center', gap: 6, maxWidth: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.success,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 4,
  },
  chipAlert: { backgroundColor: Colors.danger },
  chipText: { color: Colors.white, fontWeight: '800', fontSize: 14, flexShrink: 1 },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    width: 300,
    maxWidth: '100%',
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  scroll: { maxHeight: 260 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
  name: { fontSize: 14, fontWeight: '700', color: Colors.text },
  detail: { fontSize: 12, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  link: { color: Colors.accent, fontWeight: '700', fontSize: 14, textAlign: 'center', paddingTop: 4 },
}));
