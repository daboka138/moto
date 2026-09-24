import { Alert } from 'react-native';

import { incompatibilityWarning, type MotoCategory } from '@/lib/moto';

const VISIBILITY_NOTE =
  'Pendant la balade, les autres participants verront ta position sur la carte, même si tu es en mode fantôme.';

/**
 * Confirmation avant de rejoindre une balade. Si elle n'accepte pas ma moto,
 * l'avertissement passe en premier et le bouton devient « Rejoindre quand même ».
 */
export function confirmJoinRide(rideCategories: MotoCategory[], mine: MotoCategory | null, onConfirm: () => void) {
  const warning = incompatibilityWarning(rideCategories, mine);
  Alert.alert(
    warning ? 'Balade pas adaptée à ta moto' : 'Participer à la balade',
    warning ? `${warning}\n\n${VISIBILITY_NOTE}` : VISIBILITY_NOTE,
    [
      { text: 'Annuler', style: 'cancel' },
      { text: warning ? 'Rejoindre quand même' : 'Je participe', style: warning ? 'destructive' : 'default', onPress: onConfirm },
    ],
  );
}
