import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { Card } from '@/components/profile-view';
import { PhotosInput } from '@/components/road-criteria';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { errorMessage } from '@/lib/errors';
import { addEventPhotos, deleteEventPhoto, fetchEventPhotos, type EventPhoto } from '@/lib/events';
import { askReport } from '@/lib/moderation';
import type { PhotoValue } from '@/lib/profile';

/**
 * Photos partagées après l'événement (à partir de son début) par les inscrits et l'organisateur.
 * Chacun supprime les siennes, l'organisateur toutes celles de sa fiche ; les autres se signalent.
 */
export function EventPhotos({
  eventId,
  meId,
  isOrganizer,
  canAdd,
}: {
  eventId: string;
  meId: string;
  isOrganizer: boolean;
  /** Événement commencé et je suis inscrit (ou organisateur) */
  canAdd: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null);
  const [draft, setDraft] = useState<PhotoValue[]>([]);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState<EventPhoto | null>(null);

  const load = useCallback(() => {
    fetchEventPhotos(eventId)
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }, [eventId]);

  useEffect(load, [load]);

  if (!photos) return null;
  if (!photos.length && !canAdd) return null;

  const send = async () => {
    setSending(true);
    try {
      await addEventPhotos(eventId, meId, draft);
      setDraft([]);
      load();
    } catch (e) {
      Alert.alert('Oups', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const menu = (p: EventPhoto) => {
    const mine = p.authorId === meId;
    showActionSheet({
      title: `Photo de @${p.username}`,
      options: [
        ...(mine || isOrganizer
          ? [
              {
                label: 'Supprimer la photo',
                icon: 'trash-outline' as const,
                destructive: true,
                onPress: async () => {
                  try {
                    await deleteEventPhoto(p, meId);
                    setPhotos((l) => l?.filter((x) => x.id !== p.id) ?? null);
                    setOpen(null);
                  } catch (e) {
                    Alert.alert('Oups', errorMessage(e));
                  }
                },
              },
            ]
          : []),
        ...(!mine ? [{ label: 'Signaler la photo', icon: 'flag-outline' as const, destructive: true, onPress: () => askReport('event_photo', p.id) }] : []),
      ],
    });
  };

  return (
    <Card title={`Photos${photos.length ? ` (${photos.length})` : ''}`}>
      {photos.length === 0 && <Text style={styles.muted}>Pas encore de photo. Partage les tiennes !</Text>}
      <View style={styles.grid}>
        {photos.map((p) => (
          <Pressable key={p.id} onPress={() => setOpen(p)} onLongPress={() => menu(p)} delayLongPress={350}>
            <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" />
          </Pressable>
        ))}
      </View>
      {canAdd && (
        <View style={{ gap: 8 }}>
          <PhotosInput value={draft} onChange={setDraft} max={6} />
          {draft.length > 0 && <Button title={`Partager ${draft.length > 1 ? 'mes photos' : 'ma photo'}`} icon="cloud-upload-outline" loading={sending} onPress={send} />}
        </View>
      )}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          {open && (
            <>
              <Image source={{ uri: open.url }} style={styles.full} contentFit="contain" />
              <View style={styles.bar}>
                <Text style={styles.author}>@{open.username}</Text>
                <Pressable onPress={() => menu(open)} hitSlop={10}>
                  <Text style={[styles.author, { color: Colors.accent }]}>Options</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Modal>
    </Card>
  );
}

const useStyles = makeStyles((Colors) => ({
  muted: { fontSize: Type.small, color: Colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: 96, height: 96, borderRadius: Radius.md, backgroundColor: Colors.border },
  backdrop: { flex: 1, backgroundColor: Colors.viewerBackdrop, justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 12 },
  author: { fontSize: Type.body, fontWeight: '700', color: Colors.white },
}));
