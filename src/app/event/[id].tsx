import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';

import { showActionSheet } from '@/components/action-sheet';
import { LeafletMap } from '@/components/leaflet-map';
import { Card } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { makeStyles, useColors } from '@/constants/theme';
import { demoEvents } from '@/demo/community';
import { useDemoMode } from '@/demo/demo-context';
import { goToPlace } from '@/lib/app-link';
import {
  deleteEvent,
  eventKindInfo,
  eventShareUrl,
  fetchEvent,
  formatEventDates,
  isEventOver,
  setAttendance,
  type AttendStatus,
  type MotoEvent,
} from '@/lib/events';
import { askReport } from '@/lib/moderation';
import { photoUrl } from '@/lib/profile';
import { useSession } from '@/lib/session';

/** Fiche d'un événement : infos, carte, inscription (j'y vais / intéressé), participants. */
export default function EventScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useSession();
  const userId = session?.user.id;
  const demo = useDemoMode();
  const isDemo = id.startsWith('demo-');
  const [loaded, setLoaded] = useState<MotoEvent | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId || isDemo) return;
    try {
      setLoaded(await fetchEvent(id, userId));
    } catch (e) {
      console.warn('Événement indisponible', e);
      setLoaded((e2) => e2 ?? null);
    }
  }, [id, userId, isDemo]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const me = { id: userId ?? 'me', username: profile?.username ?? 'moi', avatarUrl: profile ? photoUrl(profile.avatar_path) : '' };
  const event = isDemo ? (demoEvents(demo.eventStatus, me).find((e) => e.id === id) ?? null) : loaded;

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

  const attend = async (status: AttendStatus | null) => {
    if (isDemo) {
      demo.setEventStatus(event.id, status);
      return;
    }
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
    if (isDemo) router.push({ pathname: '/demo-rider/[id]', params: { id: pid } });
    else router.push({ pathname: '/user/[id]', params: { id: pid } });
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
          {event.isDemo ? ' · démo' : ''}
        </Text>
        <Text style={styles.title}>{event.title}</Text>
        <Info icon="calendar" text={formatEventDates(event)} />
        <Info icon="location" text={event.place.label} />
        <Info
          icon="people"
          text={`${event.going} participant${event.going > 1 ? 's' : ''}${event.maxAttendees ? ` / ${event.maxAttendees} places` : ''}${event.interested ? ` · ${event.interested} intéressé${event.interested > 1 ? 's' : ''}` : ''}`}
        />
        <Info icon="person" text={`Organisé par @${event.organizerName}`} />

        {ended ? (
          <Text style={styles.muted}>Cet événement est terminé.</Text>
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
        <Button title="Y aller" variant="ghost" onPress={() => goToPlace(event.place)} />
        {!event.isDemo && (
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
        )}

        <View style={styles.map}>
          <LeafletMap
            position={null}
            pins={[{ id: 'e', kind: 'event', label: kind.emoji, latitude: event.place.latitude, longitude: event.place.longitude }]}
            fitPoints={[event.place]}
          />
        </View>

        {!!event.description && (
          <Card title="Programme">
            <Text style={styles.description}>{event.description}</Text>
          </Card>
        )}

        <Card title={`Participants (${going.length})`}>
          <People list={going} onPress={openPerson} />
          {interested.length > 0 && (
            <>
              <Text style={styles.subtle}>Intéressés</Text>
              <People list={interested} faded onPress={openPerson} />
            </>
          )}
        </Card>
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
  muted: { color: Colors.textMuted, fontSize: 14 },
  photo: { width: '100%', height: 220, backgroundColor: Colors.border },
  body: { padding: 16, gap: 12 },
  kind: { fontSize: 14, fontWeight: '700', color: Colors.accent },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 15, color: Colors.text },
  buttons: { gap: 10 },
  map: { height: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: Colors.border },
  description: { fontSize: 15, lineHeight: 21, color: Colors.text },
  subtle: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  person: { alignItems: 'center', width: 64, gap: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border },
  username: { fontSize: 11, color: Colors.text, maxWidth: 64 },
}));
