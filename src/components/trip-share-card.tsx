import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { shortDistance } from '@/lib/navigation';
import { fetchTripShare, SHARE_STALE_MS, type TripShare } from '@/lib/trip-share';

/** Rafraîchissement de la fiche tant que le partage est en cours */
const REFRESH_MS = 20_000;

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Fiche d'un trajet partagé en direct (dans une conversation) : destination, heure d'arrivée
 * estimée, distance restante, position ; mise à jour toute seule jusqu'à l'arrivée.
 */
export function TripShareCard({ id, mine, fallback }: { id: string; mine: boolean; fallback: string | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const [share, setShare] = useState<TripShare | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

  // Rafraîchie tant que le partage est en cours ; terminée, la fiche ne bouge plus
  const status = share === undefined ? 'loading' : (share?.status ?? 'gone');
  useEffect(() => {
    if (status !== 'loading' && status !== 'active') return;
    let cancelled = false;
    const load = () =>
      fetchTripShare(id)
        .then((s) => {
          if (cancelled) return;
          setShare(s);
          setNow(Date.now());
        })
        .catch((e) => console.warn('Trajet partagé indisponible', e));
    if (status === 'loading') load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, status]);
  const active = status === 'active';

  // Partage supprimé ou inaccessible : le texte du message suffit
  if (share === null) return fallback ? <Text style={[styles.text, mine && styles.textMine]}>{fallback}</Text> : null;

  const stale = !!share && active && now - new Date(share.updatedAt).getTime() > SHARE_STALE_MS;
  const live = !!share && active && !stale;
  const fg = mine ? Colors.white : Colors.text;
  const muted = mine ? Colors.accentSoft : Colors.textMuted;

  const openMap = () => {
    if (!share?.latitude || !share.longitude) return;
    const { latitude: lat, longitude: lng } = share;
    Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent('Position partagée')})`).catch(() =>
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`),
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MaterialCommunityIcons name={live ? 'motorbike' : 'flag-checkered'} size={24} color={fg} />
        <Text style={[styles.title, { color: fg }]}>{live ? 'Trajet en direct' : 'Trajet partagé'}</Text>
        {live && <View style={styles.liveDot} />}
      </View>
      {share ? (
        <>
          <Text style={[styles.dest, { color: fg }]} numberOfLines={2}>
            → {share.destination}
          </Text>
          {live ? (
            <>
              {!!share.eta && <Text style={[styles.eta, { color: fg }]}>Arrivée vers {clock(share.eta)}</Text>}
              <Text style={[styles.small, { color: muted }]}>
                {share.remainingM != null ? `${shortDistance(share.remainingM)} restants · ` : ''}mis à jour à {clock(share.updatedAt)}
              </Text>
              {share.latitude != null && (
                <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]} onPress={openMap}>
                  <Ionicons name="location" size={18} color={Colors.accent} />
                  <Text style={styles.buttonText}>Voir la position</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={[styles.small, { color: muted }]}>
              {share.status === 'arrived' ? `✅ Arrivé à ${clock(share.updatedAt)}` : `Partage terminé à ${clock(share.updatedAt)}`}
            </Text>
          )}
        </>
      ) : (
        <Text style={[styles.small, { color: muted }]}>Chargement…</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: { gap: 4, paddingVertical: 2, minWidth: 220 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '900' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  dest: { fontSize: 15, fontWeight: '700' },
  eta: { fontSize: 20, fontWeight: '900' },
  small: { fontSize: 13 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  buttonText: { color: Colors.accent, fontWeight: '800' },
  text: { fontSize: 16, lineHeight: 21, color: Colors.text },
  textMine: { color: Colors.white },
}));
