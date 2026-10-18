import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Chip, Field } from '@/components/ui';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { searchClubs, type ClubSummary } from '@/lib/clubs';
import type { LatLng } from '@/lib/geo';

/** Onglet Sorties › Clubs : mes clubs d'abord, puis les plus proches (ou recherche par nom / ville). */
export function ClubsList({ me }: { me: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ key: string; clubs: ClubSummary[] } | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const key = `${query.trim()}|${me ? `${me.latitude.toFixed(2)},${me.longitude.toFixed(2)}` : ''}|${reload}`;

  useFocusEffect(
    useCallback(() => {
      setReload((n) => n + 1);
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      searchClubs(query, me)
        .then((clubs) => !cancelled && setResult({ key, clubs }))
        .catch(() => !cancelled && setError(true));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const clubs = result?.clubs ?? null;
  return (
    <FlatList
      data={clubs ?? []}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Field label="Rechercher un club" value={query} onChangeText={setQuery} placeholder="Nom ou ville" />
          {!query.trim() && <Text style={styles.small}>{me ? 'Mes clubs, puis les clubs près de toi.' : 'Mes clubs, puis les plus suivis.'}</Text>}
        </View>
      }
      renderItem={({ item: c }) => (
        <Pressable style={styles.card} onPress={() => router.push({ pathname: '/club/[id]', params: { id: c.id } })}>
          {c.logoUrl ? (
            <Image source={{ uri: c.logoUrl }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoEmpty]}>
              <Ionicons name="flag" size={22} color={Colors.accent} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>
              {c.name}
            </Text>
            <Text style={styles.small} numberOfLines={1}>
              {[c.city, c.distanceKm !== null ? `à ${c.distanceKm} km` : null, `${c.members} membre${c.members > 1 ? 's' : ''}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {c.myStatus === 'member' ? (
            <Text style={styles.badge}>{c.myRole === 'member' ? 'Membre' : c.myRole === 'founder' ? 'Fondateur' : 'Admin'}</Text>
          ) : c.myStatus === 'pending' ? (
            <Text style={styles.small}>Demande envoyée</Text>
          ) : (
            <Text style={styles.small}>{c.joinPolicy === 'open' ? 'Public' : 'Sur demande'}</Text>
          )}
        </Pressable>
      )}
      ListEmptyComponent={
        !clubs ? (
          error ? (
            <Text style={styles.muted}>Impossible de charger les clubs.</Text>
          ) : (
            <ActivityIndicator color={Colors.accent} />
          )
        ) : (
          <View style={styles.empty}>
            <Ionicons name="flag-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>{query.trim() ? 'Aucun club trouvé' : 'Pas encore de club près de toi'}</Text>
            <Text style={styles.muted}>Crée le tien : balades et événements au nom du club, mur, membres.</Text>
            <Chip label="Créer un club" icon="add" selected onPress={() => router.push('/club/new')} />
          </View>
        )
      }
    />
  );
}

const useStyles = makeStyles((Colors) => ({
  list: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: 12 },
  logo: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border },
  logoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  name: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted },
  badge: { fontSize: Type.small, fontWeight: '800', color: Colors.accent },
  muted: { fontSize: Type.body, color: Colors.textMuted, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyTitle: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
}));
