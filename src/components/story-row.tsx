import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { photoUrl } from '@/lib/profile';
import { useSession } from '@/lib/session';
import { groupStories } from '@/lib/stories';
import { useStories } from '@/lib/stories-context';

/**
 * Rangée de stories en haut du Mur : mon rond d'abord (avec « + »), puis les motards
 * ayant une story (contour bleu ciel, gris une fois tout vu).
 */
export function StoryRow() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, profile } = useSession();
  const meId = session?.user.id;
  const { stories, viewed } = useStories();
  const groups = groupStories(stories, meId, viewed);
  const mine = groups.find((g) => g.ownerId === meId);
  const others = groups.filter((g) => g.ownerId !== meId);

  const open = (ownerId: string) => router.push({ pathname: '/story/[ownerId]', params: { ownerId } });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Pressable style={styles.item} onPress={() => (mine ? open(mine.ownerId) : router.push('/story/new'))}>
        <View style={[styles.ring, mine ? styles.ringNew : styles.ringNone]}>
          <Image source={{ uri: profile ? photoUrl(profile.avatar_path) : undefined }} style={styles.avatar} />
        </View>
        <Pressable style={styles.plus} onPress={() => router.push('/story/new')} hitSlop={8}>
          <Ionicons name="add" size={16} color={Colors.white} />
        </Pressable>
        <Text style={styles.name} numberOfLines={1}>
          Ma story
        </Text>
      </Pressable>

      {others.map((g) => {
        const seen = g.stories.every((s) => viewed.has(s.id));
        return (
          <Pressable key={g.ownerId} style={styles.item} onPress={() => open(g.ownerId)}>
            <View style={[styles.ring, seen ? styles.ringSeen : styles.ringNew]}>
              <Image source={{ uri: g.avatarUrl }} style={styles.avatar} />
            </View>
            <Text style={[styles.name, seen && styles.nameSeen]} numberOfLines={1}>
              {g.username}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  item: { alignItems: 'center', width: 70, gap: 4 },
  ring: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringNew: { borderColor: Colors.accent },
  ringSeen: { borderColor: Colors.textFaint },
  ringNone: { borderColor: Colors.border },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.border },
  plus: {
    position: 'absolute',
    top: 48,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 12, color: Colors.text, maxWidth: 70 },
  nameSeen: { color: Colors.textMuted },
}));
