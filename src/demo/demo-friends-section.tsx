import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PersonRow } from '@/components/person-row';
import { Card } from '@/components/profile-view';
import { SmallButton } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useDemoMode } from '@/demo/demo-context';
import { findDemoRider } from '@/demo/riders';
import { demoPrivacyLabel, demoSocial } from '@/demo/social';

/** Amis et demandes des faux motards, affichés sous les vrais dans l'écran Amis. */
export function DemoFriendsSection() {
  const demo = useDemoMode();
  if (!demo.enabled) return null;

  const open = (id: string) => router.push({ pathname: '/demo-rider/[id]', params: { id } });
  const incoming = demo.incomingIds.map(findDemoRider).filter((r) => !!r);
  const friends = demo.friendIds.map(findDemoRider).filter((r) => !!r);

  return (
    <Card title="Mode démo">
      {incoming.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.subtitle}>Demandes reçues</Text>
          {incoming.map((r) => (
            <PersonRow
              key={r.id}
              photoUrl={r.avatar_path}
              title={`@${r.username}`}
              subtitle={`Position : ${demoPrivacyLabel(demoSocial(r).privacy)}`}
              onPress={() => open(r.id)}
              right={
                <View style={styles.actions}>
                  <SmallButton title="Refuser" variant="secondary" onPress={() => demo.refuseRequest(r.id)} />
                  <SmallButton title="Accepter" onPress={() => demo.acceptRequest(r.id)} />
                </View>
              }
            />
          ))}
        </View>
      )}
      <View style={styles.group}>
        <Text style={styles.subtitle}>Amis ({friends.length})</Text>
        {friends.map((r) => (
          <PersonRow
            key={r.id}
            photoUrl={r.avatar_path}
            title={`@${r.username}`}
            subtitle={`Position : ${demoPrivacyLabel(demoSocial(r).privacy)}`}
            onPress={() => open(r.id)}
            right={<SmallButton title="Retirer" variant="secondary" onPress={() => demo.removeFriend(r.id)} />}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  group: { gap: 4 },
  subtitle: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  actions: { flexDirection: 'row', gap: 6 },
});
