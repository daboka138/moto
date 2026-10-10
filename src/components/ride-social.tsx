import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { CommentsSection } from '@/components/comments-section';
import { Card } from '@/components/profile-view';
import { demoRideComments } from '@/demo/community';
import { useDemoMode } from '@/demo/demo-context';
import { addRideComment, deleteRideComment, fetchRideComments, fetchRideLikes, setRideLike, type Comment } from '@/lib/social';

/** « J'aime » et commentaires d'une balade (balade de démo : en mémoire) */
export function RideSocial({
  rideId,
  meId,
  me,
  isOrganizer,
  isDemo,
}: {
  rideId: string;
  meId: string;
  me: { username: string; avatarUrl: string };
  isOrganizer: boolean;
  isDemo?: boolean;
}) {
  const demo = useDemoMode();
  const [likes, setLikes] = useState({ likes: 0, likedByMe: false });
  const [comments, setComments] = useState<Comment[] | null>(isDemo ? demoRideComments(rideId) : null);

  const load = useCallback(() => {
    if (isDemo) return;
    fetchRideLikes(rideId, meId)
      .then(setLikes)
      .catch((e) => console.warn('J’aime indisponibles', e));
    fetchRideComments(rideId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [rideId, meId, isDemo]);

  useEffect(() => {
    load();
  }, [load]);

  const demoLiked = demo.liked.includes(rideId);
  const shown = isDemo ? { likes: 3 + (demoLiked ? 1 : 0), likedByMe: demoLiked } : likes;

  const toggleLike = async () => {
    if (isDemo) {
      demo.toggleLike(rideId);
      return;
    }
    const liked = !likes.likedByMe;
    setLikes({ likes: likes.likes + (liked ? 1 : -1), likedByMe: liked });
    try {
      await setRideLike(rideId, meId, liked);
    } catch (e) {
      setLikes(likes);
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const send = async (text: string) => {
    if (isDemo) {
      const c: Comment = { id: `demo-c-${Date.now()}`, authorId: meId, username: me.username, avatarUrl: me.avatarUrl, body: text.trim(), createdAt: new Date().toISOString() };
      setComments((list) => [...(list ?? []), c]);
      return;
    }
    await addRideComment(rideId, meId, text);
    load();
  };

  const remove = async (c: Comment) => {
    if (!isDemo) await deleteRideComment(c.id);
    setComments((list) => list?.filter((x) => x.id !== c.id) ?? null);
  };

  return (
    <Card title="J’aime et commentaires">
      <CommentsSection
        meId={meId}
        likes={shown.likes}
        likedByMe={shown.likedByMe}
        comments={comments}
        canModerate={isOrganizer}
        reportType="ride_comment"
        onToggleLike={toggleLike}
        onSend={send}
        onDelete={remove}
      />
    </Card>
  );
}
