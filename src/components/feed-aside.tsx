import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { makeStyles, Radius, Space, Type, useColors } from '@/constants/theme';
import { timeAgo } from '@/lib/feed';
import { distanceM } from '@/lib/geo';
import { readLastPosition } from '@/lib/map-start';
import { newsImageMode, type NewsItem } from '@/lib/news';
import type { RideSummary } from '@/lib/rides';
import { formatDistance } from '@/lib/routing';
import type { FriendSuggestion } from '@/lib/suggestions';
import { ASIDE_WIDTH } from '@/lib/use-wide-layout';

/** Balades proposées à droite : moins de 100 km de ma dernière position connue (sur cet appareil) */
const NEAR_KM = 100;

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Colonne de droite du Mur sur grand écran (web) : Rouler ensemble, motards à découvrir,
 * prochaines balades (près de moi si ma position est connue), dernières actus.
 */
export function FeedAside({
  suggestions,
  rides,
  news,
  showNews,
}: {
  suggestions: FriendSuggestion[];
  rides: RideSummary[];
  news: NewsItem[];
  showNews: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const me = readLastPosition();
  const upcoming = rides
    .filter((r) => r.status !== 'ended')
    .map((r) => ({ r, km: me ? distanceM(me, r.meeting) / 1000 : null }))
    .filter((x) => x.km === null || x.km <= NEAR_KM)
    .sort((a, b) => a.r.meetingAt.localeCompare(b.r.meetingAt))
    .slice(0, 4);
  return (
    <View style={styles.aside}>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Rouler ensemble</Text>
        <Text style={styles.muted}>Trouve des motards du coin, à ton rythme et avec ta catégorie de moto.</Text>
        <Button title="Trouver des motards" icon="people" onPress={() => router.push('/riders')} />
      </View>

      {suggestions.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Motards que tu pourrais connaître</Text>
          {suggestions.slice(0, 5).map((s) => (
            <Pressable
              key={s.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: s.id } })}>
              <Image source={{ uri: s.avatarUrl }} style={styles.avatar} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  @{s.username}
                </Text>
                <Text style={styles.small} numberOfLines={1}>
                  {s.reason}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{me ? 'Prochaines balades près de toi' : 'Prochaines balades'}</Text>
        {upcoming.length ? (
          upcoming.map(({ r, km }) => (
            <Pressable
              key={r.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/ride/[id]', params: { id: r.id } })}>
              <View style={styles.rideIcon}>
                <Ionicons name="flag" size={18} color={Colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={styles.small} numberOfLines={1}>
                  {dateLabel(r.meetingAt)}
                  {km !== null ? ` · à ${formatDistance(km * 1000)}` : ''}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={styles.muted}>Rien de prévu pour l’instant.</Text>
        )}
        <Pressable onPress={() => router.navigate('/rides')} accessibilityRole="link">
          <Text style={styles.link}>Voir les sorties</Text>
        </Pressable>
      </View>

      {showNews && news.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Actus moto</Text>
          {news.slice(0, 5).map((n) => (
            <Pressable
              key={n.id}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/news/[id]', params: { id: n.id } })}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {n.title}
                </Text>
                <Text style={styles.small} numberOfLines={1}>
                  {n.sourceName} · {timeAgo(n.publishedAt)}
                </Text>
              </View>
              {newsImageMode(n) !== 'none' && <Image source={{ uri: n.imageUrl! }} style={styles.newsThumb} contentFit="cover" />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  aside: {
    width: ASIDE_WIDTH,
    gap: Space.lg,
    paddingTop: Space.lg,
    paddingBottom: Space.xxl,
  },
  block: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Space.md,
    gap: Space.sm,
  },
  blockTitle: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  muted: { fontSize: Type.body, color: Colors.textMuted },
  small: { fontSize: Type.small, color: Colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  pressed: { opacity: 0.7 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
  },
  rideIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.border,
  },
  link: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
}));
