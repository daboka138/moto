import { AppOnlyScreen } from '@/components/open-in-app';

export default function EmergencyContactsScreen() {
  return (
    <AppOnlyScreen
      icon="medkit"
      title="Contacts d’urgence"
      description="Tes contacts d’urgence et leurs numéros de téléphone restent sur ton téléphone, avec le SOS et la détection de chute."
      path="/emergency-contacts"
    />
  );
}
