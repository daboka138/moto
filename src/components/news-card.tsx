import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { timeAgo } from '@/lib/feed';
import { newsImageMode, newsImageRatio, setNewsLike, type NewsItem } from '@/lib/news';

/** Ouvre l'article sur le site d'origine (on n'affiche jamais son contenu dans l'app) */
export function openArticle(url: string) {
  Linking.openURL(url).catch((e) => Alert.alert('Oups', errorMessage(e)));
}

/**
 * Image d'une actu : grande (≥ 600 px de large, jamais agrandie au-delà de sa taille, 16:9 au plus haut,
 * recadrée), sinon rien ici (la vignette est posée à côté du titre par NewsThumb). Pas d'image : rien.
 */
export function NewsImage({ item }: { item: NewsItem }) {
  const styles = useStyles();
  if (newsImageMode(item) !== 'large') return null;
  return (
    <Image
      source={{ uri: item.imageUrl! }}
      style={[styles.image, { aspectRatio: newsImageRatio(item), maxWidth: item.imageWidth ?? undefined }]}
      contentFit="cover"
      transition={150}
    />
  );
}

/** Petite image (ou taille inconnue) : vignette carrée à droite du titre, format « liste d'actus » */
export function NewsThumb({ item, size = 96 }: { item: NewsItem; size?: number }) {
  const styles = useStyles();
  if (newsImageMode(item) !== 'thumb') return null;
  return <Image source={{ uri: item.imageUrl! }} style={[styles.thumb, { width: size, height: size }]} contentFit="cover" transition={150} />;
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
      <Pressable onPress={open} accessibilityRole="button" style={styles.body}>
        <NewsImage item={item} />
        <View style={styles.textRow}>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={3}>
              {item.title}
            </Text>
            {!!item.summary && (
              <Text style={styles.summary} numberOfLines={3}>
                {item.summary}
              </Text>
            )}
          </View>
          <NewsThumb item={item} />
        </View>
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
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 10,
  },
  body: { gap: 10 },
  textRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  text: { flex: 1, gap: 4 },
  thumb: { borderRadius: Radius.sm, backgroundColor: Colors.border },
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
  image: { width: '100%', alignSelf: 'center', borderRadius: Radius.sm, backgroundColor: Colors.border },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  summary: { fontSize: Type.body, color: Colors.textMuted },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: Type.small, color: Colors.textMuted },
  read: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  readText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
}));
