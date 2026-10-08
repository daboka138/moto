import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { makeStyles, useColors } from '@/constants/theme';
import { timeAgo } from '@/lib/feed';
import { askReport } from '@/lib/moderation';
import {
  addComment,
  COMMENT_MAX_LENGTH,
  deleteComment,
  fetchComments,
  fetchPhotoSocial,
  setPhotoLike,
  type PhotoComment,
  type PhotoSocial,
} from '@/lib/photo-social';
import { useDrivingLock } from '@/lib/driving-lock';
import { useSession } from '@/lib/session';
import type { WallPhoto } from '@/lib/wall';

/**
 * Bas de la visionneuse : « J'aime » et commentaires de la photo. Le propriétaire de la photo
 * peut supprimer tous les commentaires ; chacun peut supprimer les siens ou signaler les autres.
 */
export function PhotoSocialPanel({ photo }: { photo: WallPhoto }) {
  const Colors = useColors();
  const styles = useStyles();
  const { session } = useSession();
  const userId = session?.user.id;
  const { locked } = useDrivingLock();
  const [social, setSocial] = useState<PhotoSocial | null>(null);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PhotoComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const isOwner = photo.ownerId === userId;

  const loadSocial = useCallback(() => {
    if (!userId) return;
    fetchPhotoSocial(photo.id, userId)
      .then(setSocial)
      .catch((e) => console.warn('J’aime / commentaires indisponibles', e));
  }, [photo.id, userId]);

  const loadComments = useCallback(() => {
    fetchComments(photo.id)
      .then(setComments)
      .catch((e) => {
        setComments([]);
        console.warn('Commentaires indisponibles', e);
      });
  }, [photo.id]);

  useEffect(() => {
    loadSocial();
  }, [loadSocial]);

  useEffect(() => {
    if (open) loadComments();
  }, [open, loadComments]);

  const toggleLike = async () => {
    if (!userId || !social) return;
    const liked = !social.likedByMe;
    // Affiché tout de suite, corrigé si le serveur refuse
    setSocial({ ...social, likedByMe: liked, likes: social.likes + (liked ? 1 : -1) });
    try {
      await setPhotoLike(photo.id, userId, liked);
    } catch (e) {
      setSocial(social);
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const send = async () => {
    if (!userId || !draft.trim()) return;
    setSending(true);
    try {
      await addComment(photo.id, userId, draft);
      setDraft('');
      loadComments();
      loadSocial();
    } catch (e) {
      Alert.alert('Commentaire', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const commentMenu = (c: PhotoComment) => {
    const mine = c.authorId === userId;
    const remove = async () => {
      try {
        await deleteComment(c.id);
        setComments((list) => list?.filter((x) => x.id !== c.id) ?? null);
        loadSocial();
      } catch (e) {
        Alert.alert('Suppression impossible', e instanceof Error ? e.message : String(e));
      }
    };
    showActionSheet({
      title: `@${c.username}`,
      message: c.body.length > 80 ? `${c.body.slice(0, 80)}…` : c.body,
      options: [
        ...(mine || isOwner ? [{ label: 'Supprimer le commentaire', destructive: true, onPress: remove }] : []),
        ...(!mine ? [{ label: 'Signaler', destructive: true, onPress: () => askReport('comment', c.id) }] : []),
      ],
    });
  };

  return (
    <View style={styles.panel}>
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={toggleLike}
          disabled={!social}
          hitSlop={8}
          accessibilityLabel={social?.likedByMe ? 'Je n’aime plus' : 'J’aime'}>
          <Ionicons
            name={social?.likedByMe ? 'heart' : 'heart-outline'}
            size={26}
            color={social?.likedByMe ? Colors.danger : Colors.white}
          />
          <Text style={styles.count}>{social?.likes ?? 0}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => setOpen(!open)} hitSlop={8} accessibilityLabel="Commentaires">
          <Ionicons name={open ? 'chatbubble' : 'chatbubble-outline'} size={24} color={Colors.white} />
          <Text style={styles.count}>{social?.comments ?? 0}</Text>
        </Pressable>
      </View>

      {open && (
        <View style={styles.comments}>
          {comments === null ? (
            <ActivityIndicator color={Colors.white} style={{ padding: 16 }} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              style={styles.list}
              ListEmptyComponent={<Text style={styles.empty}>Aucun commentaire. Lance la discussion !</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.comment} onLongPress={() => commentMenu(item)} delayLongPress={350}>
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                  <View style={styles.commentBody}>
                    <Text style={styles.commentText}>
                      <Text style={styles.username}>@{item.username} </Text>
                      {item.body}
                    </Text>
                    <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                  </View>
                  <Pressable onPress={() => commentMenu(item)} hitSlop={10} accessibilityLabel="Options du commentaire">
                    <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textFaint} />
                  </Pressable>
                </Pressable>
              )}
            />
          )}
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={locked ? 'Saisie bloquée en roulant' : 'Ajouter un commentaire…'}
              placeholderTextColor={Colors.textFaint}
              style={styles.input}
              maxLength={COMMENT_MAX_LENGTH}
              editable={!locked && !sending}
              multiline
              onSubmitEditing={send}
              submitBehavior="submit"
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending || locked}
              hitSlop={8}
              accessibilityLabel="Publier le commentaire">
              {sending ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Ionicons name="send" size={22} color={draft.trim() ? Colors.accent : Colors.textFaint} />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  panel: { gap: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  comments: { backgroundColor: Colors.darkSoft, borderRadius: 16, overflow: 'hidden' },
  list: { maxHeight: 260 },
  empty: { color: Colors.textFaint, fontSize: 14, padding: 14, textAlign: 'center' },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.dark },
  commentBody: { flex: 1, gap: 2 },
  commentText: { color: Colors.white, fontSize: 14, lineHeight: 19 },
  username: { fontWeight: '800' },
  time: { color: Colors.textFaint, fontSize: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.dark,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: { flex: 1, color: Colors.white, fontSize: 15, maxHeight: 90, paddingVertical: 6 },
}));
