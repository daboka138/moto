import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { CommentsSection } from '@/components/comments-section';
import { Card } from '@/components/profile-view';
import { addComment, deleteComment, fetchComments, fetchLikes, setLike, type Comment, type SocialKind } from '@/lib/social';

/** « J'aime » et commentaires d'une balade */
export function RideSocial({ rideId, meId, isOrganizer }: { rideId: string; meId: string; isOrganizer: boolean }) {
  return <SocialCard kind="ride" id={rideId} meId={meId} isOrganizer={isOrganizer} title="J’aime et commentaires" />;
}

/** « J'aime » et discussion d'un événement (même composant que les balades) */
export function EventSocial({ eventId, meId, isOrganizer }: { eventId: string; meId: string; isOrganizer: boolean }) {
  return <SocialCard kind="event" id={eventId} meId={meId} isOrganizer={isOrganizer} title="Discussion" />;
}

function SocialCard({ kind, id: rideId, meId, isOrganizer, title }: { kind: SocialKind; id: string; meId: string; isOrganizer: boolean; title: string }) {
  const [likes, setLikes] = useState({ likes: 0, likedByMe: false });
  const [comments, setComments] = useState<Comment[] | null>(null);

  const load = useCallback(() => {
    fetchLikes(kind, rideId, meId)
      .then(setLikes)
      .catch((e) => console.warn('J’aime indisponibles', e));
    fetchComments(kind, rideId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [kind, rideId, meId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async () => {
    const liked = !likes.likedByMe;
    setLikes({ likes: likes.likes + (liked ? 1 : -1), likedByMe: liked });
    try {
      await setLike(kind, rideId, meId, liked);
    } catch (e) {
      setLikes(likes);
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    }
  };

  const send = async (text: string) => {
    await addComment(kind, rideId, meId, text);
    load();
  };

  const remove = async (c: Comment) => {
    await deleteComment(kind, c.id);
    setComments((list) => list?.filter((x) => x.id !== c.id) ?? null);
  };

  return (
    <Card title={title}>
      <CommentsSection
        meId={meId}
        likes={likes.likes}
        likedByMe={likes.likedByMe}
        comments={comments}
        canModerate={isOrganizer}
        reportType={kind === 'ride' ? 'ride_comment' : 'event_comment'}
        onToggleLike={toggleLike}
        onSend={send}
        onDelete={remove}
      />
    </Card>
  );
}
