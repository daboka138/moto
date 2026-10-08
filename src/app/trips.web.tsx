import { AppOnlyScreen } from '@/components/open-in-app';

export default function TripsScreen() {
  return (
    <AppOnlyScreen
      icon="speedometer"
      title="Mes trajets"
      description="Tes trajets sont enregistrés pendant la navigation GPS et gardés sur ton téléphone."
      path="/trips"
    />
  );
}
