import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { sendFriendRequest } from '@/lib/friends';
import { dismissSuggestion, type FriendSuggestion } from '@/lib/suggestions';

/**
 * Carrousel « Motards que tu pourrais connaître » (inséré dans le fil du Mur) : photo, pseudo,
 * moto, raison (« 3 amis en commun »), Ajouter et ✕ (ne plus suggérer).
 */
export function FriendSuggestions({
  userId,
  suggestions,
  onChange,
}: {
  userId: string;
  suggestions: FriendSuggestion[];
  /** Liste mise à jour (motard ajouté ou écarté) */
  onChange: (next: FriendSuggestion[]) => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  if (!suggestions.length) return null;

  const add = async (s: FriendSuggestion) => {
    setBusyId(s.id);
    try {
      await sendFriendRequest(userId, s.id);
      setSent((x) => [...x, s.id]);
      setTimeout(() => onChange(suggestions.filter((x) => x.id !== s.id)), 1200);
    } catch (e) {
      Alert.alert('Demande d’ami', errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = (s: FriendSuggestion) => {
    onChange(suggestions.filter((x) => x.id !== s.id));
    dismissSuggestion(userId, s.id).catch((e) => console.warn('Suggestion non écartée', e));
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Motards que tu pourrais connaître</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {suggestions.map((s) => {
          const done = sent.includes(s.id);
          return (
            <View key={s.id} style={styles.card}>
              <Pressable style={styles.close} onPress={() => dismiss(s)} hitSlop={10} accessibilityLabel={`Ne plus suggérer @${s.username}`}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
              <Pressable style={styles.person} onPress={() => router.push({ pathname: '/user/[id]', params: { id: s.id } })}>
                <Image source={{ uri: s.avatarUrl }} style={styles.avatar} contentFit="cover" />
                <Text style={styles.username} numberOfLines={1}>
                  @{s.username}
                </Text>
                <Text style={styles.moto} numberOfLines={1}>
                  {s.motoLabel ? `🏍️ ${s.motoLabel}` : ' '}
                </Text>
                <Text style={styles.reason} numberOfLines={2}>
                  {s.reason}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.add, done && styles.added]}
                onPress={() => !done && add(s)}
                disabled={busyId === s.id || done}
                accessibilityLabel={`Ajouter @${s.username} en ami`}>
                {busyId === s.id ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={[styles.addText, done && styles.addedText]}>{done ? 'Demande envoyée ✓' : 'Ajouter'}</Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  box: { gap: 10, paddingVertical: 4 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, paddingHorizontal: 4 },
  row: { gap: 10, paddingHorizontal: 2, paddingBottom: 4 },
  card: {
    width: 156,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  close: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  person: { alignItems: 'center', gap: 3 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.border, marginBottom: 4 },
  username: { fontSize: 15, fontWeight: '800', color: Colors.text, maxWidth: 130 },
  moto: { fontSize: 12, color: Colors.textMuted, maxWidth: 130 },
  reason: { fontSize: 12, fontWeight: '700', color: Colors.accent, textAlign: 'center', minHeight: 32 },
  add: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 8, alignItems: 'center' },
  added: { backgroundColor: Colors.successSoft },
  addText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  addedText: { color: Colors.successDark, fontSize: 12 },
}));
