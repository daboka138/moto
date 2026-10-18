import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { isDropped, roleLabel, type Convoy, type ConvoyMember } from '@/lib/convoy';
import type { LatLng } from '@/lib/geo';
import type { Place } from '@/lib/geocoding';
import { setRegroupPoint, setRidePause } from '@/lib/rides';

const PAUSE_MIN = 15;

/**
 * Convoi d'une balade en cours, sur la carte : pastille « 5/6 groupés » (rouge si quelqu'un
 * décroche, avec le motard concerné), point de regroupement (« Y aller »), et liste dépliable
 * des participants avec leur rôle, leur état et les actions : pause, regroupement.
 */
export function ConvoyPanel({
  convoy,
  compact,
  position,
  onOpenRide,
  onGoTo,
}: {
  convoy: Convoy;
  compact?: boolean;
  position: LatLng | null;
  onOpenRide: () => void;
  /** Lancer l'itinéraire vers un point (regroupement, motard décroché) */
  onGoTo: (place: Place) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { members, dropped, ride, mine, canRegroup } = convoy;
  if (!members.length) return null;
  const grouped = members.filter((m) => m.state === 'ok').length;
  const alert = dropped.length > 0;
  const me = members.find((m) => m.isMe);
  const paused = me?.state === 'paused';

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      convoy.refresh();
    } catch (e) {
      Alert.alert('Convoi', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const regroupHere = () => {
    if (!position) return Alert.alert('Regroupement', 'Position inconnue pour le moment.');
    Alert.alert('Point de regroupement', 'Tout le groupe reçoit une notification avec l’itinéraire vers ta position actuelle.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Envoyer', onPress: () => run(() => setRegroupPoint(ride.id, { label: 'Regroupement', ...position })) },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.chip, alert && styles.chipAlert]}
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel="Convoi de la balade">
        <MaterialCommunityIcons name="motorbike" size={18} color={Colors.white} />
        <Text style={styles.chipText} numberOfLines={1}>
          {alert
            ? `${dropped[0].username} ${dropped[0].state === 'stopped' ? 'arrêté' : dropped[0].state === 'lost' ? 'sans réseau' : 'a décroché'}${dropped.length > 1 ? ` (+${dropped.length - 1})` : ''}`
            : `Convoi · ${grouped}/${members.length} groupés`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.white} />
      </Pressable>
      {ride.regroup && (
        <Pressable
          style={[styles.chip, styles.chipRegroup]}
          onPress={() => onGoTo(ride.regroup!)}
          accessibilityLabel="Aller au point de regroupement">
          <Ionicons name="flag" size={16} color={Colors.white} />
          <Text style={styles.chipText} numberOfLines={1}>
            Regroupement : {ride.regroup.label} · Y aller
          </Text>
        </Pressable>
      )}
      {open && (
        <View style={styles.list}>
          <Text style={styles.title} numberOfLines={1}>
            {convoy.ride.title}
          </Text>
          <ScrollView style={[styles.scroll, compact && styles.scrollCompact]} contentContainerStyle={{ gap: 8 }}>
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                onGo={isDropped(m) && m.position ? () => onGoTo({ label: `@${m.username}`, ...m.position! }) : undefined}
              />
            ))}
          </ScrollView>
          <View style={styles.actions}>
            {mine?.status === 'joined' && (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => run(() => setRidePause(ride.id, paused ? 0 : PAUSE_MIN))}>
                <Ionicons name={paused ? 'play' : 'pause'} size={18} color={Colors.accent} />
                <Text style={styles.actionText}>{paused ? 'Je repars' : `Je fais une pause (${PAUSE_MIN} min)`}</Text>
              </Pressable>
            )}
            {canRegroup && (
              <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} disabled={busy} onPress={regroupHere}>
                <Ionicons name="flag" size={18} color={Colors.accent} />
                <Text style={styles.actionText}>Regroupement ici</Text>
              </Pressable>
            )}
            {canRegroup && ride.regroup && (
              <Pressable
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => run(() => setRegroupPoint(ride.id, null))}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
                <Text style={[styles.actionText, { color: Colors.textMuted }]}>Retirer le regroupement</Text>
              </Pressable>
            )}
          </View>
          {canRegroup && <Text style={styles.hint}>Ou appui long sur la carte › Point de regroupement.</Text>}
          <Pressable onPress={onOpenRide} hitSlop={6}>
            <Text style={styles.link}>Voir la balade</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MemberRow({ member: m, onGo }: { member: ConvoyMember; onGo?: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const color =
    m.state === 'ok'
      ? Colors.success
      : m.state === 'paused' || (m.state === 'lost' && !m.position)
        ? Colors.textMuted
        : Colors.danger;
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
      {onGo ? (
        <Pressable style={({ pressed }) => [styles.go, pressed && { opacity: 0.6 }]} onPress={onGo} hitSlop={6}>
          <Text style={styles.goText}>Y aller</Text>
        </Pressable>
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { alignSelf: 'center', alignItems: 'center', gap: 8, maxWidth: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
  },
  chipAlert: { backgroundColor: Colors.danger },
  chipRegroup: { backgroundColor: Colors.accent },
  chipText: { color: Colors.white, fontWeight: '800', fontSize: Type.body, flexShrink: 1 },
  list: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 12,
    gap: 8,
    width: 300,
    maxWidth: '100%',
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  scroll: { maxHeight: 260 },
  scrollCompact: { maxHeight: 150 },
  actions: { gap: 8 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.accentSoft,
  },
  actionText: { color: Colors.accent, fontWeight: '800', fontSize: Type.body },
  hint: { fontSize: Type.small, color: Colors.textMuted, textAlign: 'center' },
  go: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.danger },
  goText: { color: Colors.white, fontWeight: '800', fontSize: Type.small },
  title: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.border },
  name: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  detail: { fontSize: Type.small, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  link: { color: Colors.accent, fontWeight: '700', fontSize: Type.body, textAlign: 'center', paddingTop: 4 },
}));
