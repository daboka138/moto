import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { makeStyles, useColors } from '@/constants/theme';
import { useDrivingLock } from '@/lib/driving-lock';
import { timeAgo } from '@/lib/feed';
import { askReport, type ReportTarget } from '@/lib/moderation';
import { COMMENT_MAX, type Comment } from '@/lib/social';

/**
 * « J'aime » et commentaires (fiche balade) : chacun supprime les siens, le modérateur
 * (organisateur) supprime tous ceux de sa fiche ; signalement des autres.
 */
export function CommentsSection({
  meId,
  likes,
  likedByMe,
  comments,
  canModerate,
  reportType,
  onToggleLike,
  onSend,
  onDelete,
}: {
  meId: string;
  likes: number;
  likedByMe: boolean;
  /** null pendant le chargement */
  comments: Comment[] | null;
  canModerate: boolean;
  reportType: ReportTarget;
  onToggleLike: () => void;
  onSend: (text: string) => Promise<void>;
  onDelete: (c: Comment) => Promise<void>;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const { locked } = useDrivingLock();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await onSend(draft);
      setDraft('');
    } catch (e) {
      Alert.alert('Commentaire', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const menu = (c: Comment) => {
    const mine = c.authorId === meId;
    showActionSheet({
      title: `@${c.username}`,
      message: c.body.length > 80 ? `${c.body.slice(0, 80)}…` : c.body,
      options: [
        ...(mine || canModerate
          ? [
              {
                label: 'Supprimer le commentaire',
                destructive: true,
                onPress: () => onDelete(c).catch((e) => Alert.alert('Suppression impossible', String(e))),
              },
            ]
          : []),
        ...(!mine ? [{ label: 'Signaler', destructive: true, onPress: () => askReport(reportType, c.id) }] : []),
      ],
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onToggleLike} hitSlop={8} accessibilityLabel={likedByMe ? 'Je n’aime plus' : 'J’aime'}>
          <Ionicons name={likedByMe ? 'heart' : 'heart-outline'} size={26} color={likedByMe ? Colors.danger : Colors.text} />
          <Text style={styles.count}>{likes}</Text>
        </Pressable>
        <View style={styles.action}>
          <Ionicons name="chatbubble-outline" size={23} color={Colors.text} />
          <Text style={styles.count}>{comments?.length ?? 0}</Text>
        </View>
      </View>

      {comments === null ? (
        <ActivityIndicator color={Colors.accent} />
      ) : comments.length === 0 ? (
        <Text style={styles.muted}>Aucun commentaire. Pose une question, propose une pause café…</Text>
      ) : (
        comments.map((c) => (
          <Pressable key={c.id} style={styles.comment} onLongPress={() => menu(c)} delayLongPress={350}>
            <Image source={{ uri: c.avatarUrl }} style={styles.avatar} />
            <View style={styles.body}>
              <Text style={styles.text}>
                <Text style={styles.username}>@{c.username} </Text>
                {c.body}
              </Text>
              <Text style={styles.time}>{timeAgo(c.createdAt)}</Text>
            </View>
            <Pressable onPress={() => menu(c)} hitSlop={10} accessibilityLabel="Options du commentaire">
              <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textFaint} />
            </Pressable>
          </Pressable>
        ))
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={locked ? 'Saisie bloquée en roulant' : 'Ajouter un commentaire…'}
          placeholderTextColor={Colors.textFaint}
          style={styles.input}
          maxLength={COMMENT_MAX}
          editable={!locked && !sending}
          multiline
        />
        <Pressable onPress={send} disabled={!draft.trim() || sending || locked} hitSlop={8} accessibilityLabel="Publier le commentaire">
          {sending ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Ionicons name="send" size={22} color={draft.trim() ? Colors.accent : Colors.textFaint} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontSize: 15, fontWeight: '700', color: Colors.text },
  muted: { fontSize: 14, color: Colors.textMuted },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.border },
  body: { flex: 1, gap: 2 },
  text: { fontSize: 14, lineHeight: 19, color: Colors.text },
  username: { fontWeight: '800' },
  time: { fontSize: 12, color: Colors.textMuted },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.background,
  },
  input: { flex: 1, color: Colors.text, fontSize: 15, maxHeight: 90, paddingVertical: 8 },
}));
