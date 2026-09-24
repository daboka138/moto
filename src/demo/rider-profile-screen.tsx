import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { makeStyles } from '@/constants/theme';
import { useDemoMode } from '@/demo/demo-context';
import { demoCover, demoPhotosOf } from '@/demo/photos';
import { useDemoMessages } from '@/demo/messages';
import { findDemoRider } from '@/demo/riders';
import { demoRideCountOf } from '@/demo/rides';

/** Fiche complète d'un faux motard (les chemins de photo sont déjà des URL). */
export default function DemoRiderProfileScreen() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const demo = useDemoMode();
  const demoMessages = useDemoMessages();
  const rider = findDemoRider(id);

  if (!rider) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Motard introuvable.</Text>
      </View>
    );
  }

  const photos = demoPhotosOf(rider.username);
  const isFriend = demo.friendIds.includes(rider.id);
  const incoming = demo.incomingIds.includes(rider.id);
  // Nombre d'amis inventé mais stable pour chaque faux motard
  const friendsCount = 8 + (rider.username.length * 7) % 23;

  const actions = isFriend ? (
    <Button title="Amis ✓" variant="secondary" onPress={() => demo.removeFriend(rider.id)} />
  ) : incoming ? (
    <Button title="Accepter sa demande d'ami" onPress={() => demo.acceptRequest(rider.id)} />
  ) : (
    // En démo, la demande est acceptée tout de suite
    <Button title="Ajouter en ami" onPress={() => demo.addFriend(rider.id)} />
  );

  return (
    <>
      <Stack.Screen options={{ title: `@${rider.username}` }} />
      <ProfileView
        profile={{ ...rider, cover_path: demoCover(rider.username) }}
        resolvePhoto={(path) => path}
        stats={{ photos: photos.length, friends: friendsCount, rides: demoRideCountOf(rider.username) }}
        photos={photos}
        actions={
          <>
            {actions}
            <Button
              title="Message"
              variant="secondary"
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: demoMessages.openDirect(rider.id) } })}
            />
            <Text style={styles.badge}>Profil de démonstration</Text>
          </>
        }
      />
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: Colors.textMuted },
  badge: { alignSelf: 'center', color: Colors.textMuted, fontSize: 12 },
}));
