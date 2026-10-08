import { AppOnlyScreen } from '@/components/open-in-app';

export default function HomecomingScreen() {
  return (
    <AppOnlyScreen
      icon="home"
      title="Je rentre"
      description="Préviens tes contacts d’urgence si tu n’es pas arrivé à l’heure prévue. Cette fonction suit ta position GPS pendant le trajet : elle fonctionne dans l’app."
      path="/homecoming"
    />
  );
}
