import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { CommentsSection } from '@/components/comments-section';
import { NewsHeader, NewsImage, NewsThumb, openArticle } from '@/components/news-card';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { useIsAdmin } from '@/lib/admin';
import {
  addNewsComment,
  deleteNewsComment,
  fetchNewsComments,
  fetchNewsItem,
  fetchNewsLikes,
  setNewsLike,
  type NewsItem,
} from '@/lib/news';
import type { Comment } from '@/lib/social';
import { useSession } from '@/lib/session';

/** Une actu moto : titre, résumé du flux, « Lire l'article » (site d'origine), J'aime et commentaires */
export default function NewsScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const isAdmin = useIsAdmin(session?.user.id) === true;
  const [item, setItem] = useState<NewsItem | null | undefined>(undefined);
  const [likes, setLikes] = useState({ likes: 0, likedByMe: false });
  const [comments, setComments] = useState<Comment[] | null>(null);

  const load = useCallback(() => {
    fetchNewsItem(id)
      .then(setItem)
      .catch(() => setItem((i) => i ?? null));
    if (userId)
      fetchNewsLikes(id, userId)
        .then(setLikes)
        .catch(() => {});
    fetchNewsComments(id)
      .then(setComments)
      .catch(() => setComments([]));
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleLike = async () => {
    const liked = !likes.likedByMe;
    const before = likes;
    setLikes({ likes: likes.likes + (liked ? 1 : -1), likedByMe: liked });
    try {
      await setNewsLike(id, userId, liked);
    } catch (e) {
      setLikes(before);
      Alert.alert('Oups', errorMessage(e));
    }
  };

  if (item === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Cette actu n’est plus dispo (on les garde 30 jours).</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <NewsHeader item={item} />
        <NewsImage item={item} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{item.title}</Text>
          <NewsThumb item={item} />
        </View>
        {!!item.summary && <Text style={styles.summary}>{item.summary}</Text>}
        <Button title={`Lire l’article sur ${item.sourceName}`} icon="open-outline" onPress={() => openArticle(item.url)} />
        <Text style={styles.notice}>
          L’article est sur le site de {item.sourceName}. Ici on en parle entre motards.
        </Text>
        <View style={styles.social}>
          <CommentsSection
            meId={userId}
            likes={likes.likes}
            likedByMe={likes.likedByMe}
            comments={comments}
            canModerate={isAdmin}
            reportType="news_comment"
            onToggleLike={toggleLike}
            onSend={async (text) => {
              await addNewsComment(id, userId, text);
              load();
            }}
            onDelete={async (c) => {
              await deleteNewsComment(c.id);
              setComments((list) => list?.filter((x) => x.id !== c.id) ?? null);
            }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { flex: 1, fontSize: Type.title, fontWeight: '800', color: Colors.text },
  summary: { fontSize: Type.large, lineHeight: 24, color: Colors.text },
  notice: { fontSize: Type.small, color: Colors.textMuted },
  social: { backgroundColor: Colors.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, padding: 16, marginTop: 8 },
}));
