import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { Card } from '@/components/profile-view';
import { Field, SmallButton } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { DemoFriendsSection } from '@/demo/demo-friends-section'; // DEMO
import {
  acceptFriendRequest,
  relationWith,
  removeFriendship,
  searchUsers,
  sendFriendRequest,
  type PublicProfile,
} from '@/lib/friends';
import { photoUrl } from '@/lib/profile';
import { useFriends } from '@/lib/use-friends';

export default function FriendsScreen() {
  const { state, error, refresh, userId } = useFriends();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; profiles: PublicProfile[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Recherche par pseudo, 300 ms après la dernière frappe
  useEffect(() => {
    if (!userId || query.trim().length < 2) return;
    const q = query;
    const timer = setTimeout(() => {
      searchUsers(q, userId)
        .then((profiles) => setResults({ query: q, profiles }))
        .catch((e) => console.warn('Recherche impossible', e));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, userId]);

  if (!userId) return null;

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
      await refresh();
    } catch (e) {
      Alert.alert('Oups', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const openProfile = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });
  const searching = query.trim().length >= 2;
  const shownResults = searching && results?.query === query ? results.profiles : null;

  const actionFor = (p: PublicProfile) => {
    const relation = relationWith(state, userId, p.id);
    const busy = busyId === p.id;
    if (relation === 'friend') return <SmallButton title="Ami ✓" variant="secondary" />;
    if (relation === 'outgoing') return <SmallButton title="Envoyée" variant="secondary" />;
    if (relation === 'incoming')
      return <SmallButton title="Accepter" disabled={busy} onPress={() => run(p.id, () => acceptFriendRequest(userId, p.id))} />;
    return <SmallButton title="Ajouter" disabled={busy} onPress={() => run(p.id, () => sendFriendRequest(userId, p.id))} />;
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field
        label="Rechercher un motard"
        value={query}
        onChangeText={setQuery}
        placeholder="Pseudo"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {searching ? (
        <Card title="Résultats">
          {shownResults === null ? (
            <ActivityIndicator color={Colors.accent} />
          ) : shownResults.length === 0 ? (
            <Text style={styles.muted}>Aucun motard trouvé.</Text>
          ) : (
            shownResults.map((p) => (
              <PersonRow
                key={p.id}
                photoUrl={photoUrl(p.avatar_path)}
                title={`@${p.username}`}
                subtitle={[`${p.first_name} ${p.last_name}`, p.city].filter(Boolean).join(' · ')}
                onPress={() => openProfile(p.id)}
                right={actionFor(p)}
              />
            ))
          )}
        </Card>
      ) : (
        <>
          {error && <Text style={styles.error}>Impossible de charger tes amis. Vérifie ta connexion.</Text>}
          {!state && !error && <ActivityIndicator color={Colors.accent} />}

          {state && state.incoming.length > 0 && (
            <Card title={`Demandes reçues (${state.incoming.length})`}>
              {state.incoming.map((p) => (
                <PersonRow
                  key={p.id}
                  photoUrl={photoUrl(p.avatar_path)}
                  title={`@${p.username}`}
                  subtitle={`${p.first_name} ${p.last_name}`}
                  onPress={() => openProfile(p.id)}
                  right={
                    <View style={styles.actions}>
                      <SmallButton
                        title="Refuser"
                        variant="secondary"
                        disabled={busyId === p.id}
                        onPress={() => run(p.id, () => removeFriendship(userId, p.id))}
                      />
                      <SmallButton
                        title="Accepter"
                        disabled={busyId === p.id}
                        onPress={() => run(p.id, () => acceptFriendRequest(userId, p.id))}
                      />
                    </View>
                  }
                />
              ))}
            </Card>
          )}

          {state && (
            <Card title={`Mes amis (${state.friends.length})`}>
              {state.friends.length === 0 ? (
                <Text style={styles.muted}>Recherche un pseudo ci-dessus pour ajouter des amis.</Text>
              ) : (
                state.friends.map((p) => (
                  <PersonRow
                    key={p.id}
                    photoUrl={photoUrl(p.avatar_path)}
                    title={`@${p.username}`}
                    subtitle={[`${p.first_name} ${p.last_name}`, p.city].filter(Boolean).join(' · ')}
                    onPress={() => openProfile(p.id)}
                  />
                ))
              )}
            </Card>
          )}

          {state && state.outgoing.length > 0 && (
            <Card title="Demandes envoyées">
              {state.outgoing.map((p) => (
                <PersonRow
                  key={p.id}
                  photoUrl={photoUrl(p.avatar_path)}
                  title={`@${p.username}`}
                  subtitle="En attente"
                  onPress={() => openProfile(p.id)}
                  right={
                    <SmallButton
                      title="Annuler"
                      variant="secondary"
                      disabled={busyId === p.id}
                      onPress={() => run(p.id, () => removeFriendship(userId, p.id))}
                    />
                  }
                />
              ))}
            </Card>
          )}

          <DemoFriendsSection /* DEMO */ />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  muted: { color: Colors.textMuted },
  error: { color: Colors.danger },
  actions: { flexDirection: 'row', gap: 6 },
});
