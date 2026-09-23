import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ProfileForm } from '@/components/profile-form';
import { makeStyles, useColors } from '@/constants/theme';
import { fetchIdentity, type PrivateIdentity } from '@/lib/profile';
import { useSession } from '@/lib/session';

export default function ProfileEditScreen() {
  const Colors = useColors();
  const styles = useStyles();
  const { session, profile, refreshProfile } = useSession();
  const userId = session?.user.id;
  // Prénom et nom sont dans une table privée : on les charge avant d'afficher le formulaire
  const [identity, setIdentity] = useState<{ userId: string; value: PrivateIdentity | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchIdentity(userId)
      .then((value) => !cancelled && setIdentity({ userId, value }))
      .catch(() => !cancelled && setIdentity({ userId, value: null }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!session || !profile || !identity || identity.userId !== userId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ProfileForm
      userId={session.user.id}
      profile={profile}
      identity={identity.value}
      submitLabel="Enregistrer"
      onSaved={async () => {
        await refreshProfile();
        router.back();
      }}
    />
  );
}

const useStyles = makeStyles((Colors) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
}));
