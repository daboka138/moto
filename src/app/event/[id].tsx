import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { EventPhotos } from '@/components/event-photos';
import { ExpandableMap } from '@/components/expandable-map';
import { Card } from '@/components/profile-view';
import { EventSocial } from '@/components/ride-social';
import { Button } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { goToPlace } from '@/lib/app-link';
import {
  deleteEvent,
  eventKindInfo,
  eventShareUrl,
  fetchEvent,
  formatEventDates,
  hasEventStarted,
  isEventOver,
  setAttendance,
  type AttendStatus,
  type MotoEvent,
} from '@/lib/events';
import { askReport } from '@/lib/moderation';
import { useSession } from '@/lib/session';
import { useFriends } from '@/lib/use-friends';

/** Fiche d'un événement : infos, carte, inscription (j'y vais / intéressé), participants. */
export default function EventScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const [loaded, setLoaded] = useState<MotoEvent | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { state: friendsState } = useFriends();

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoaded(await fetchEvent(id, userId));
    } catch (e) {
      console.warn('Événement indisponible', e);
      setLoaded((e2) => e2 ?? null);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const event = loaded;

  if (event === undefined || !userId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }
  if (event === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Événement introuvable ou terminé.</Text>
      </View>
    );
  }

  const kind = eventKindInfo(event.kind);
  const isOrganizer = event.createdBy === userId;
  const ended = isEventOver(event);
  const full = event.maxAttendees !== null && event.going >= event.maxAttendees && event.myStatus !== 'going';
  const going = event.attendees.filter((a) => a.status === 'going');
  const interested = event.attendees.filter((a) => a.status === 'interested');
  // Mes amis inscrits, en premier
  const friendIds = new Set((friendsState?.friends ?? []).map((f) => f.id));
  const friendsGoing = event.attendees.filter((a) => friendIds.has(a.id));
  const started = hasEventStarted(event);
  const price =
    event.priceKind === 'free' ? 'Gratuit' : event.priceKind === 'paid' ? `Payant${event.priceText ? ` · ${event.priceText}` : ''}` : null;

  const attend = async (status: AttendStatus | null) => {
    setBusy(true);
    try {
      await setAttendance(event.id, userId, status);
      await load();
    } catch (e) {
      Alert.alert('Inscription', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const menu = () =>
    showActionSheet({
      title: event.title,
      options: isOrganizer
        ? [
            {
              label: 'Supprimer l’événement',
              destructive: true,
              onPress: () =>
                Alert.alert('Supprimer l’événement ?', 'Les inscriptions seront supprimées.', [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Supprimer',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteEvent(event);
                        router.back();
                      } catch (e) {
                        Alert.alert('Suppression impossible', String(e));
                      }
                    },
                  },
                ]),
            },
          ]
        : [{ label: 'Signaler cet événement', destructive: true, onPress: () => askReport('event', event.id) }],
    });

  // Lien app.passeryder.fr : s'ouvre dans le navigateur (version web), qui propose l'app
  const share = async () => {
    const url = eventShareUrl(event.id);
    const message = `${event.title} · ${formatEventDates(event)} · ${event.place.label}\n${url}`;
    try {
      if (Platform.OS === 'web' && !navigator.share) {
        await navigator.clipboard.writeText(url);
        Alert.alert('Lien copié', url);
        return;
      }
      await Share.share(Platform.OS === 'web' ? { title: event.title, message, url } : { title: event.title, message });
    } catch (e) {
      console.warn('Partage impossible', e);
    }
  };

  const openPerson = (pid: string) => {
    if (pid === userId) return;
    router.push({ pathname: '/user/[id]', params: { id: pid } });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable onPress={menu} hitSlop={10} accessibilityLabel="Options de l’événement">
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.text} />
            </Pressable>
          ),
        }}
      />
      {event.photoUrl && <Image source={{ uri: event.photoUrl }} style={styles.photo} contentFit="cover" />}
      <View style={styles.body}>
        <Text style={styles.kind}>
          {kind.emoji} {kind.label}
        </Text>
        <Text style={styles.title}>{event.title}</Text>
        <Info icon="calendar" text={formatEventDates(event)} />
        <Info icon="location" text={event.place.label} />
        <Info
          icon="people"
          text={`${event.going} participant${event.going > 1 ? 's' : ''}${event.maxAttendees ? ` / ${event.maxAttendees} places` : ''}${event.interested ? ` · ${event.interested} intéressé${event.interested > 1 ? 's' : ''}` : ''}`}
        />
        <Info icon="person" text={event.organizerLabel ? `Organisé par ${event.organizerLabel} · @${event.organizerName}` : `Organisé par @${event.organizerName}`} />
        {price && <Info icon="pricetag" text={price} />}
        {!!event.linkUrl && (
          <Pressable onPress={() => Linking.openURL(event.linkUrl!)} accessibilityRole="link">
            <View style={styles.info}>
              <Ionicons name="link" size={18} color={Colors.accent} />
              <Text style={[styles.infoText, styles.link]} numberOfLines={1}>
                {event.linkUrl.replace(/^https?:\/\//, '')}
              </Text>
            </View>
          </Pressable>
        )}
        {friendsGoing.length > 0 && (
          <Text style={styles.friends}>
            {friendsGoing
              .slice(0, 3)
              .map((f) => `@${f.username}`)
              .join(', ')}
            {friendsGoing.length > 3 ? ` et ${friendsGoing.length - 3} autre${friendsGoing.length > 4 ? 's' : ''}` : ''}
            {friendsGoing.length > 1 ? ' (tes amis) y sont inscrits' : ' (ton ami) y est inscrit'}
          </Text>
        )}

        {event.reviewStatus === 'pending' && (
          <View style={styles.banner}>
            <Ionicons name="time-outline" size={18} color={Colors.text} />
            <Text style={styles.bannerText}>
              {isOrganizer
                ? 'En attente d’un petit coup d’œil de l’équipe avant d’être visible par tous. Tes amis, les invités et les membres du club le voient déjà.'
                : 'Pas encore validé par l’équipe : visible seulement des amis de l’organisateur et des invités.'}
            </Text>
          </View>
        )}
        {event.reviewStatus === 'rejected' && (
          <View style={styles.banner}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
            <Text style={styles.bannerText}>
              Pas validé par l’équipe : visible par toi seul.{event.reviewNote ? ` « ${event.reviewNote} »` : ''}
            </Text>
          </View>
        )}

        {ended ? (
          <Text style={styles.muted}>Cet événement est terminé (archivé 1 an). Partage tes photos plus bas !</Text>
        ) : (
          <View style={styles.buttons}>
            {event.myStatus === 'going' ? (
              <Button title="✓ J’y vais · me désinscrire" variant="secondary" loading={busy} onPress={() => attend(null)} />
            ) : (
              <Button title={full ? 'Complet' : 'J’y vais'} disabled={full} loading={busy} onPress={() => attend('going')} />
            )}
            {event.myStatus !== 'going' && (
              <Button
                title={event.myStatus === 'interested' ? '★ Intéressé · retirer' : '☆ Intéressé'}
                variant="secondary"
                onPress={() => attend(event.myStatus === 'interested' ? null : 'interested')}
              />
            )}
          </View>
        )}
        {!ended && event.myStatus && <Text style={styles.small}>On te le rappelle la veille par une notification.</Text>}
        <Button title="Y aller" variant="ghost" onPress={() => goToPlace(event.place)} />
        <View style={styles.buttons}>
          <Button title="Partager le lien" variant="secondary" onPress={share} />
          {!ended && (
            <Button
              title="Inviter des amis"
              variant="secondary"
              onPress={() => router.push({ pathname: '/event/invite', params: { id: event.id } })}
            />
          )}
        </View>

        <ExpandableMap
          style={styles.map}
          position={null}
          pins={[{ id: 'e', kind: 'event', label: kind.emoji, latitude: event.place.latitude, longitude: event.place.longitude }]}
          fitPoints={[event.place]}
          title={event.title}
          subtitle={event.place.label}
        />

        {!!event.description && (
          <Card title="Programme">
            <Text style={styles.description}>{event.description}</Text>
          </Card>
        )}

        <Card title={`Participants (${going.length})`}>
          <People list={[...going].sort((x, y) => Number(friendIds.has(y.id)) - Number(friendIds.has(x.id)))} onPress={openPerson} />
          {interested.length > 0 && (
            <>
              <Text style={styles.subtle}>Intéressés</Text>
              <People list={interested} faded onPress={openPerson} />
            </>
          )}
        </Card>

        <EventPhotos eventId={event.id} meId={userId} isOrganizer={isOrganizer} canAdd={started && (isOrganizer || !!event.myStatus)} />

        <EventSocial eventId={event.id} meId={userId} isOrganizer={isOrganizer} />
      </View>
    </ScrollView>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={18} color={Colors.accent} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function People({ list, faded, onPress }: { list: { id: string; username: string; avatarUrl: string }[]; faded?: boolean; onPress: (id: string) => void }) {
  const styles = useStyles();
  if (!list.length) return <Text style={styles.muted}>Personne pour l’instant.</Text>;
  return (
    <View style={styles.people}>
      {list.map((p) => (
        <Pressable key={p.id} style={[styles.person, faded && { opacity: 0.6 }]} onPress={() => onPress(p.id)}>
          <Image source={{ uri: p.avatarUrl }} style={styles.avatar} />
          <Text style={styles.username} numberOfLines={1}>
            @{p.username}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  muted: { color: Colors.textMuted, fontSize: Type.body },
  photo: { width: '100%', height: 220, backgroundColor: Colors.border },
  body: { padding: 16, gap: 12 },
  kind: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  title: { fontSize: Type.title, fontWeight: '900', color: Colors.text },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoText: { flex: 1, fontSize: Type.body, color: Colors.text },
  buttons: { gap: 12 },
  map: { height: 200, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.border },
  description: { fontSize: Type.body, lineHeight: 21, color: Colors.text },
  subtle: { fontSize: Type.small, fontWeight: '600', color: Colors.textMuted },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  person: { alignItems: 'center', width: 64, gap: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border },
  username: { fontSize: Type.small, color: Colors.text, maxWidth: 64 },
  link: { color: Colors.accent, fontWeight: '700' },
  friends: { fontSize: Type.small, fontWeight: '700', color: Colors.accent },
  small: { fontSize: Type.small, color: Colors.textMuted },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  bannerText: { flex: 1, fontSize: Type.small, color: Colors.text, lineHeight: 18 },
}));
