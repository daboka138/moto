import { router } from 'expo-router';

import { ProfileForm } from '@/components/profile-form';
import { useSession } from '@/lib/session';

export default function ProfileEditScreen() {
  const { session, profile, refreshProfile } = useSession();
  if (!session || !profile) return null;

  return (
    <ProfileForm
      userId={session.user.id}
      profile={profile}
      submitLabel="Enregistrer"
      onSaved={async () => {
        await refreshProfile();
        router.back();
      }}
    />
  );
}
