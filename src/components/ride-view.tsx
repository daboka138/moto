import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { LeafletMap, type MapPin } from '@/components/leaflet-map';
import { Card } from '@/components/profile-view';
import { makeStyles, useColors } from '@/constants/theme';
import type { Place } from '@/lib/geocoding';
import { categoryInfo, paceInfo, surfaceInfo, type MotoCategory } from '@/lib/moto';
import { formatRideDate, levelInfo, visibilityInfo, type RideDetails } from '@/lib/rides';
import { formatDistance, formatDuration } from '@/lib/routing';

type Props = {
  ride: RideDetails;
  /** Boutons (Je participe, Démarrer...) */
  actions?: ReactNode;
  onPersonPress?: (id: string) => void;
  /** Catégorie de ma moto principale : met en avant si la balade l'accepte */
  myCategory?: MotoCategory | null;
};

const at = (p: { latitude: number; longitude: number }) => ({ latitude: p.latitude, longitude: p.longitude });

export function ridePins(ride: {
  start: Place | null;
  end: Place | null;
  waypoints: Place[];
  meeting: Place | null;
}): MapPin[] {
  const pins: MapPin[] = [];
  if (ride.meeting) pins.push({ id: 'meeting', kind: 'meeting', label: 'RDV', ...at(ride.meeting) });
  if (ride.start) pins.push({ id: 'start', kind: 'start', label: 'A', ...at(ride.start) });
  ride.waypoints.forEach((w, i) => pins.push({ id: `step-${i}`, kind: 'step', label: String(i + 1), ...at(w) }));
  if (ride.end) pins.push({ id: 'end', kind: 'end', label: 'B', ...at(ride.end) });
  return pins;
}

/** Fiche balade : carte avec tracé, infos, organisateur, participants. */
export function RideView({ ride, actions, onPersonPress, myCategory = null }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const level = levelInfo(ride.level);
  const visibility = visibilityInfo(ride.visibility);
  const pins = ridePins(ride);
  const routePoints = ride.route ?? pins.filter((p) => p.kind !== 'meeting').map((p) => [p.latitude, p.longitude] as [number, number]);
  const fit = [...routePoints.map(([latitude, longitude]) => ({ latitude, longitude })), ride.meeting];
  const joined = ride.participants.filter((p) => p.status === 'joined');
  const invited = ride.participants.filter((p) => p.status === 'invited');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.map}>
        <LeafletMap position={null} pins={pins} routes={[{ id: 'route', points: routePoints }]} fitPoints={fit} />
      </View>

      <View style={styles.body}>
        {ride.status === 'live' && (
          <View style={styles.live}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Balade en cours : les participants se voient sur la carte</Text>
          </View>
        )}

        <Text style={styles.title}>{ride.title}</Text>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: level.color }]}>
            <Text style={styles.chipText}>{level.label}</Text>
          </View>
          <View style={[styles.chip, styles.chipOutline]}>
            <Ionicons
              name={ride.visibility === 'public' ? 'globe-outline' : ride.visibility === 'friends' ? 'people-outline' : 'lock-closed-outline'}
              size={12}
              color={Colors.text}
            />
            <Text style={[styles.chipText, { color: Colors.text }]}>{visibility.label}</Text>
          </View>
          {ride.isDemo && (
            <View style={[styles.chip, styles.chipOutline]}>
              <Text style={[styles.chipText, { color: Colors.textMuted }]}>Démo</Text>
            </View>
          )}
        </View>

        {actions}

        <Card title="Motos et rythme">
          <View style={styles.categoryRow}>
            {ride.categories.map((c) => {
              const mine = c === myCategory;
              return (
                <View key={c} style={[styles.categoryChip, mine && styles.categoryChipMine]}>
                  <Text style={[styles.categoryText, mine && styles.categoryTextMine]}>
                    {categoryInfo(c).short}
                    {mine ? ' · ta moto' : ''}
                  </Text>
                </View>
              );
            })}
          </View>
          {myCategory && !ride.categories.includes(myCategory) && (
            <InfoRow icon="alert-circle" color={Colors.danger} text={`Pas prévue pour ta moto (${categoryInfo(myCategory).short})`} />
          )}
          {ride.categories.includes('cyclo') && (
            <InfoRow icon="information-circle" text="Ouverte aux 50 cm³ : tracé sans autoroute, 45 km/h max" />
          )}
          {ride.pace && (
            <InfoRow icon="speedometer" text={`Rythme ${paceInfo(ride.pace).label.toLowerCase()} (${paceInfo(ride.pace).description})`} />
          )}
          <InfoRow icon="trail-sign" text={`Route : ${surfaceInfo(ride.surface).label.toLowerCase()}`} />
        </Card>

        <Card title="Regroupement">
          <InfoRow icon="calendar" text={formatRideDate(ride.meetingAt)} />
          <InfoRow icon="flag" text={ride.meeting.label} />
        </Card>

        <Card title="Itinéraire">
          <InfoRow icon="ellipse" color={Colors.success} text={ride.start.label} />
          {ride.waypoints.map((w, i) => (
            <InfoRow key={i} icon="ellipse-outline" color={Colors.neutral} text={`${i + 1}. ${w.label}`} />
          ))}
          <InfoRow icon="ellipse" color={Colors.danger} text={ride.end.label} />
          {ride.distanceM !== null && (
            <InfoRow
              icon="navigate"
              text={`${formatDistance(ride.distanceM)}${ride.durationS !== null ? ` · environ ${formatDuration(ride.durationS)}` : ''}`}
            />
          )}
        </Card>

        <Card title="Organisateur">
          <Person person={ride.organizer} onPress={onPersonPress} />
        </Card>

        <Card
          title={`Participants (${joined.length}${ride.maxParticipants !== null ? `/${ride.maxParticipants}` : ''})`}>
          <View style={styles.people}>
            {joined.map((p) => (
              <Person key={p.id} person={p} compact onPress={onPersonPress} />
            ))}
          </View>
          {invited.length > 0 && (
            <>
              <Text style={styles.subtle}>Invités en attente</Text>
              <View style={styles.people}>
                {invited.map((p) => (
                  <Person key={p.id} person={p} compact faded onPress={onPersonPress} />
                ))}
              </View>
            </>
          )}
        </Card>

        {!!ride.description && (
          <Card title="Description">
            <Text style={styles.description}>{ride.description}</Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={color ?? Colors.accent} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function Person({
  person,
  compact,
  faded,
  onPress,
}: {
  person: { id: string; username: string; avatarUrl: string };
  compact?: boolean;
  faded?: boolean;
  onPress?: (id: string) => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => onPress?.(person.id)}
      disabled={!onPress}
      style={[compact ? styles.personCompact : styles.person, faded && { opacity: 0.5 }]}>
      <Image source={{ uri: person.avatarUrl }} style={compact ? styles.avatarSmall : styles.avatar} />
      <Text style={compact ? styles.usernameSmall : styles.username} numberOfLines={1}>
        @{person.username}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 48 },
  map: { height: 280, backgroundColor: Colors.border },
  body: { padding: 16, gap: 16 },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.successSoft,
    borderRadius: 12,
    padding: 10,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  liveText: { flex: 1, color: Colors.successDark, fontWeight: '700', fontSize: 13 },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipOutline: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  categoryChipMine: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  categoryText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  categoryTextMine: { color: Colors.white },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontSize: 15, color: Colors.text, textTransform: 'none' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.border },
  username: { fontSize: 16, fontWeight: '700', color: Colors.text },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  personCompact: { alignItems: 'center', width: 64, gap: 4 },
  avatarSmall: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border },
  usernameSmall: { fontSize: 11, color: Colors.text, maxWidth: 64 },
  subtle: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  description: { fontSize: 15, lineHeight: 21, color: Colors.text },
}));
