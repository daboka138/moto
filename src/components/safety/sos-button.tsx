import { useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { makeStyles } from '@/constants/theme';

/** Durée de l'appui long : évite les SOS envoyés par erreur (gants, poche) */
const HOLD_MS = 2000;

/**
 * Bouton SOS de la carte : il faut le garder appuyé 2 s (le bouton se remplit).
 * Un appui court affiche seulement l'aide.
 */
export function SosButton({ onTrigger, onHint }: { onTrigger: () => void; onHint: () => void }) {
  const styles = useStyles();
  const [progress] = useState(() => new Animated.Value(0));
  const [holding, setHolding] = useState(false);
  // Le relâchement qui suit un SOS envoyé n'affiche pas l'aide
  const [fired, setFired] = useState(false);

  const start = () => {
    setHolding(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(
      ({ finished }) => {
        setHolding(false);
        progress.setValue(0);
        if (finished) {
          setFired(true);
          onTrigger();
        }
      },
    );
  };

  const cancel = () => {
    if (!holding) return;
    progress.stopAnimation();
    setHolding(false);
    progress.setValue(0);
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      onPress={() => (fired ? setFired(false) : onHint())}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="SOS : garder appuyé 2 secondes pour alerter tes contacts d'urgence">
      <View style={styles.button}>
        <Animated.View
          style={[styles.fill, { height: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
        <Text style={styles.text}>SOS</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.danger,
    borderWidth: 3,
    borderColor: Colors.white,
    elevation: 6,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  // Se remplit du bas vers le haut pendant l'appui
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.dark, opacity: 0.45 },
  text: { color: Colors.white, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
}));
