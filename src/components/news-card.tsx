import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/feed';
import { setNewsLike, type NewsItem } from '@/lib/news';

/** Ouvre l'article sur le site d'origine (on n'affiche jamais son contenu dans l'app) */
export function openArticle(url: string) {
  Linking.openURL(url).catch((e) => Alert.alert('Oups', errorMessage(e)));
}

/** Visuel neutre quand le flux ne donne pas d'image */
export function NewsPlaceholder({ height = 140 }: { height?: number }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.placeholder, { height }]}>
      <Ionicons name="newspaper-outline" size={32} color={Colors.accent} />
      <Text style={styles.placeholderText}>Actu moto · PasseRyder</Text>
    </View>
  );
}

/** En-tête « ACTU · source · date », bien distinct des publications des membres */
export function NewsHeader({ item }: { item: NewsItem }) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Text style={styles.badge}>ACTU</Text>
      <Text style={styles.source} numberOfLines={1}>
        {item.sourceName}
      </Text>
      <Text style={styles.date}>{timeAgo(item.publishedAt)}</Text>
    </View>
  );
}

/** Carte d'une actu moto dans le Mur */
export function NewsCard({ item, userId }: { item: NewsItem; userId: string }) {
  const Colors = useColors();
  const styles = useStyles();
  const [likes, setLikes] = useState({ likes: item.likes, likedByMe: item.likedByMe });
  const open = () => router.push({ pathname: '/news/[id]', params: { id: item.id } });

  const toggleLike = async () => {
    const liked = !likes.likedByMe;
    const before = likes;
    setLikes({ likes: likes.likes + (liked ? 1 : -1), likedByMe: liked });
    try {
      await setNewsLike(item.id, userId, liked);
    } catch (e) {
      setLikes(before);
      Alert.alert('Oups', errorMessage(e));
    }
  };

  return (
    <View style={styles.card}>
      <NewsHeader item={item} />
      <Pressable onPress={open} accessibilityRole="button">
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <NewsPlaceholder />
        )}
        <Text style={styles.title}>{item.title}</Text>
        {!!item.summary && (
          <Text style={styles.summary} numberOfLines={3}>
            {item.summary}
          </Text>
        )}
      </Pressable>
      <View style={styles.footer}>
        <Pressable style={styles.action} onPress={toggleLike} hitSlop={8} accessibilityLabel="J’aime">
          <Ionicons
            name={likes.likedByMe ? 'heart' : 'heart-outline'}
            size={20}
            color={likes.likedByMe ? Colors.danger : Colors.textMuted}
          />
          {likes.likes > 0 && <Text style={styles.count}>{likes.likes}</Text>}
        </Pressable>
        <Pressable style={styles.action} onPress={open} hitSlop={8} accessibilityLabel="Commenter">
          <Ionicons name="chatbubble-outline" size={19} color={Colors.textMuted} />
          {item.comments > 0 && <Text style={styles.count}>{item.comments}</Text>}
        </Pressable>
        <Pressable style={styles.read} onPress={() => openArticle(item.url)} accessibilityRole="link">
          <Text style={styles.readText}>Lire l’article</Text>
          <Ionicons name="open-outline" size={16} color={Colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: Colors.accent,
    color: Colors.white,
    fontSize: Type.small,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  source: { flex: 1, fontSize: Type.small, fontWeight: '700', color: Colors.text },
  date: { fontSize: Type.small, color: Colors.textMuted },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.sm, backgroundColor: Colors.border, marginBottom: 8 },
  placeholder: {
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  placeholderText: { fontSize: Type.small, fontWeight: '700', color: Colors.accentOnSoft },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  summary: { fontSize: Type.body, color: Colors.textMuted, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: Type.small, color: Colors.textMuted },
  read: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  readText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
}));
