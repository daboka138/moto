import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { Card } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import type { PublicProfile } from '@/lib/friends';
import { PRIVACY_MODES, type PrivacySettings } from '@/lib/privacy';
import { usePrivacy } from '@/lib/privacy-context';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

export default function PrivacyScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { settings } = usePrivacy();
  if (!settings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  // Le formulaire repart des réglages enregistrés à chaque ouverture
  return <PrivacyForm initial={settings} />;
}

function PrivacyForm({ initial }: { initial: PrivacySettings }) {
  const Colors = useColors();
  const styles = useStyles();
  const { update } = usePrivacy();
  const { state: friendsState } = useFriends();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const friends = friendsState?.friends ?? null;

  const toggleIn = (key: 'allow' | 'block', id: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }));

  const save = async () => {
    setSaving(true);
    try {
      const next = draft.mode === 'ghost' ? draft : { ...draft, modeBeforeGhost: draft.mode };
      await update(next);
      router.back();
    } catch (e) {
      Alert.alert('Enregistrement impossible', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card title="Qui voit ma position ?">
        {PRIVACY_MODES.map((m) => {
          const selected = draft.mode === m.value;
          return (
            <Pressable
              key={m.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setDraft((d) => ({ ...d, mode: m.value }))}>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={selected ? Colors.accent : Colors.textMuted}
              />
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{m.label}</Text>
                <Text style={styles.optionDescription}>{m.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>

      {draft.mode === 'selected' && (
        <FriendChecklist
          title="Amis qui peuvent me voir"
          empty="Tu n'as pas encore d'amis."
          friends={friends}
          checked={draft.allow}
          onToggle={(id) => toggleIn('allow', id)}
        />
      )}

      {(draft.mode === 'everyone' || draft.mode === 'friends') && (
        <FriendChecklist
          title="Exceptions : amis à qui je reste masqué"
          empty="Tu n'as pas encore d'amis."
          friends={friends}
          checked={draft.block}
          onToggle={(id) => toggleIn('block', id)}
        />
      )}

      <View style={styles.note}>
        <Ionicons name="people" size={18} color={Colors.textMuted} />
        <Text style={styles.noteText}>
          Pendant un trajet de groupe auquel tu participes, les autres participants te voient toujours, même en
          fantôme. Tu redeviens masqué à la fin du trajet.
        </Text>
      </View>

      <Button title="Enregistrer" onPress={save} loading={saving} />
    </ScrollView>
  );
}

function FriendChecklist({
  title,
  empty,
  friends,
  checked,
  onToggle,
}: {
  title: string;
  empty: string;
  friends: PublicProfile[] | null;
  checked: string[];
  onToggle: (id: string) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Card title={title}>
      {friends === null ? (
        <ActivityIndicator color={Colors.accent} />
      ) : friends.length === 0 ? (
        <Text style={styles.muted}>{empty}</Text>
      ) : (
        friends.map((f) => (
          <PersonRow
            key={f.id}
            photoUrl={photoUrl(f.avatar_path)}
            title={`@${f.username}`}
            subtitle={f.city}
            onPress={() => onToggle(f.id)}
            right={
              <Ionicons
                name={checked.includes(f.id) ? 'checkbox' : 'square-outline'}
                size={24}
                color={checked.includes(f.id) ? Colors.accent : Colors.textMuted}
              />
            }
          />
        ))
      )}
    </Card>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionSelected: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  optionDescription: { fontSize: 13, color: Colors.textMuted },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 4 },
  noteText: { flex: 1, fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  muted: { color: Colors.textMuted },
}));
