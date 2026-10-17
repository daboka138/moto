import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { formatDistance } from '@/components/person-card';
import { makeStyles, useColors } from '@/constants/theme';
import { eventKindInfo, formatEventDates, type MotoEvent } from '@/lib/events';
import { parkingFacts, parkingTitle, type MotoParking } from '@/lib/moto-parkings';
import { placeKindInfo, type CommunityPlace } from '@/lib/places';

/** Étoiles : affichage, ou saisie si onChange est fourni */
export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  const Colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 8 : 1 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const icon = value >= i ? 'star' : value >= i - 0.5 ? 'star-half' : 'star-outline';
        const star = <Ionicons name={icon} size={size} color={Colors.warning} />;
        return onChange ? (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} accessibilityLabel={`${i} étoile${i > 1 ? 's' : ''}`}>
            {star}
          </Pressable>
        ) : (
          <View key={i}>{star}</View>
        );
      })}
    </View>
  );
}

/** Lieu motard dans une liste ou sur la carte */
export function PlaceCard({
  place,
  distanceM,
  onPress,
  onClose,
}: {
  place: CommunityPlace;
  distanceM?: number | null;
  onPress: () => void;
  onClose?: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const kind = placeKindInfo(place.kind);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {place.photoUrl ? (
        <Image source={{ uri: place.photoUrl }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Text style={styles.thumbEmoji}>{kind.emoji}</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {kind.emoji} {kind.short}
          {distanceM != null ? ` · à ${formatDistance(distanceM)}` : ''}
        </Text>
        <View style={styles.ratingRow}>
          {place.rating !== null ? (
            <>
              <Stars value={place.rating} size={14} />
              <Text style={styles.meta}>
                {place.rating.toFixed(1).replace('.', ',')} ({place.reviewsCount} avis)
              </Text>
            </>
          ) : (
            <Text style={styles.meta}>Pas encore d’avis</Text>
          )}
        </View>
      </View>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      )}
    </Pressable>
  );
}

/** Événement dans une liste ou sur la carte */
export function EventCard({
  event,
  distanceM,
  onPress,
  onClose,
}: {
  event: MotoEvent;
  distanceM?: number | null;
  onPress: () => void;
  onClose?: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const kind = eventKindInfo(event.kind);
  const d = new Date(event.startsAt);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.date}>
        <Text style={styles.dateDay}>{d.getDate()}</Text>
        <Text style={styles.dateMonth}>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {kind.emoji} {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatEventDates(event)}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {event.place.label}
          {distanceM != null ? ` · à ${formatDistance(distanceM)}` : ''}
        </Text>
        <Text style={[styles.meta, event.myStatus && { color: Colors.accent, fontWeight: '800' }]}>
          {event.myStatus === 'going' ? '✓ J’y vais · ' : event.myStatus === 'interested' ? '☆ Intéressé · ' : ''}
          {event.going} participant{event.going > 1 ? 's' : ''}
          {event.interested ? ` · ${event.interested} intéressé${event.interested > 1 ? 's' : ''}` : ''}
        </Text>
      </View>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      )}
    </Pressable>
  );
}

/** Parking moto OpenStreetMap (carte) : nom / adresse, payant ou gratuit, places, « Y aller » */
export function ParkingCard({
  parking,
  distanceM,
  onGo,
  onClose,
}: {
  parking: MotoParking;
  distanceM?: number | null;
  onGo: () => void;
  onClose: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const facts = parkingFacts(parking);
  return (
    <View style={styles.card}>
      <View style={[styles.thumb, styles.parkingSign]}>
        <Text style={styles.parkingP}>P</Text>
        <Text style={styles.parkingMoto}>🏍️</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {parkingTitle(parking)}
        </Text>
        {!!parking.address && (
          <Text style={styles.meta} numberOfLines={1}>
            {parking.address}
          </Text>
        )}
        <Text style={styles.meta} numberOfLines={1}>
          {[facts, distanceM != null ? `à ${formatDistance(distanceM)}` : null].filter(Boolean).join(' · ') || 'Parking moto'}
        </Text>
        <Pressable style={styles.go} onPress={onGo} accessibilityLabel="Y aller">
          <Ionicons name="navigate" size={16} color={Colors.white} />
          <Text style={styles.goText}>Y aller</Text>
        </Pressable>
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fermer" style={styles.closeTop}>
        <Ionicons name="close" size={22} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 12,
    elevation: 3,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: Colors.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  thumbEmoji: { fontSize: 30 },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 13, color: Colors.textMuted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  date: { width: 56, alignItems: 'center', borderRadius: 12, backgroundColor: Colors.accentSoft, paddingVertical: 8 },
  dateDay: { fontSize: 22, fontWeight: '900', color: Colors.accent },
  dateMonth: { fontSize: 12, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase' },
  parkingSign: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.parkingPin },
  parkingP: { fontSize: 30, fontWeight: '900', color: Colors.white, lineHeight: 32 },
  parkingMoto: { fontSize: 12 },
  go: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Colors.accent,
  },
  goText: { color: Colors.white, fontWeight: '800' },
  closeTop: { alignSelf: 'flex-start' },
}));
