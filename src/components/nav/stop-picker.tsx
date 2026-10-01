import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/nav/search-bar';
import { makeStyles, useColors } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';
import { shortDistance, type NavRoute } from '@/lib/navigation';
import { POI_KINDS, poisAlongRoute, type PoiKind, type RoutePoi } from '@/lib/pois';
import type { SearchResult } from '@/lib/search';

type Props = {
  /** Catégorie choisie à l'ouverture (bouton « Station essence sur mon trajet ») */
  initialKind: PoiKind | null;
  route: NavRoute | null;
  /** Distance déjà parcourue sur le trajet (m) : on ne propose que ce qui est devant */
  fromM: number;
  near: LatLng | null;
  onPick: (place: SearchResult) => void;
  onClose: () => void;
};

/**
 * Ajouter un arrêt : station essence, café ou resto sur le trajet, ou une adresse.
 * Monté seulement quand il est ouvert (chaque ouverture repart de zéro).
 */
export function StopPicker({ initialKind, route, fromM, near, onPick, onClose }: Props) {
  const Colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<PoiKind | null>(initialKind);
  const [result, setResult] = useState<{ kind: PoiKind; route: NavRoute; pois?: RoutePoi[]; error?: string } | null>(null);

  useEffect(() => {
    if (!kind || !route) return;
    let cancelled = false;
    poisAlongRoute(route, kind, fromM)
      .then((pois) => !cancelled && setResult({ kind, route, pois }))
      .catch((e) => !cancelled && setResult({ kind, route, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
    // fromM lu à la demande : pas de nouvelle recherche à chaque mètre parcouru
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, route]);

  const pick = (place: SearchResult) => {
    onClose();
    onPick(place);
  };

  // Résultat de la recherche en cours (une recherche plus ancienne est ignorée)
  const current = result?.kind === kind && result.route === route ? result : null;
  const shown = current?.pois ?? null;
  const error = current?.error ?? null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Ajouter un arrêt</Text>
            <Pressable style={styles.close} onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
              <Ionicons name="close" size={28} color={Colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.kinds}>
            {POI_KINDS.map((k) => (
              <Pressable
                key={k.value}
                style={({ pressed }) => [styles.kind, kind === k.value && styles.kindOn, pressed && { opacity: 0.7 }]}
                onPress={() => setKind(k.value)}>
                <Text style={styles.kindEmoji}>{k.emoji}</Text>
                <Text style={[styles.kindText, kind === k.value && styles.kindTextOn]} numberOfLines={1}>
                  {k.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {kind && (
            <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
              {error ? (
                <Text style={styles.error}>{error}</Text>
              ) : !shown ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={Colors.accent} />
                  <Text style={styles.muted}>Recherche sur les 50 prochains km…</Text>
                </View>
              ) : shown.length === 0 ? (
                <Text style={styles.muted}>Rien trouvé à moins d’1 km de ton trajet sur les 50 prochains km.</Text>
              ) : (
                shown.map((p) => (
                  <Pressable
                    key={`${p.latitude},${p.longitude}`}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                    onPress={() => pick(p)}>
                    <View style={styles.rowText}>
                      <Text style={styles.label} numberOfLines={1}>
                        {p.label}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        dans {shortDistance(p.aheadM)} · {p.offRouteM < 80 ? 'sur ton trajet' : `à ${shortDistance(p.offRouteM)} du trajet`}
                        {p.detail ? ` · ${p.detail}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={32} color={Colors.accent} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}

          <Text style={styles.section}>Ou une adresse</Text>
          <SearchBar near={near} onSelect={pick} placeholder="Adresse, ville, lieu…" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((Colors) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  sheet: {
    maxHeight: '85%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: Colors.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    minHeight: 72,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: 4,
  },
  kindOn: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  kindEmoji: { fontSize: 26 },
  kindText: { fontSize: 13, fontWeight: '800', color: Colors.text },
  kindTextOn: { color: Colors.accent },
  results: { maxHeight: 300 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8 },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '700', color: Colors.text },
  muted: { fontSize: 13, color: Colors.textMuted },
  error: { color: Colors.danger, fontWeight: '600', padding: 8 },
  section: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
}));
