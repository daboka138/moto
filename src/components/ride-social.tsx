import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { CommentsSection } from '@/components/comments-section';
import { Card } from '@/components/profile-view';
import { addRideComment, deleteRideComment, fetchRideComments, fetchRideLikes, setRideLike, type Comment } from '@/lib/social';

/** « J'aime » et commentaires d'une balade */
export function RideSocial({ rideId, meId, isOrganizer }: { rideId: string; meId: string; isOrganizer: boolean }) {
  const [likes, setLikes] = useState({ likes: 0, likedByMe: false });
  const [comments, setComments] = useState<Comment[] | null>(null);

  const load = useCallback(() => {
    fetchRideLikes(rideId, meId)
      .then(setLikes)
      .catch((e) => console.warn('J’aime indisponibles', e));
    fetchRideComments(rideId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [rideId, meId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async () => {
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
    await addRideComment(rideId, meId, text);
    load();
  };

  const remove = async (c: Comment) => {
    await deleteRideComment(c.id);
    setComments((list) => list?.filter((x) => x.id !== c.id) ?? null);
  };

  return (
    <Card title="J’aime et commentaires">
      <CommentsSection
        meId={meId}
        likes={likes.likes}
        likedByMe={likes.likedByMe}
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
