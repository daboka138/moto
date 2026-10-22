import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { makeStyles, Radius } from '@/constants/theme';

type Props = {
  /** Toujours visible, sous la poignée (résumé, bouton Arrêter…) */
  header: ReactNode;
  /** Partie dépliable, défilante si elle est plus haute que l'écran */
  children: ReactNode;
  /** Toujours visible, en bas (Annuler / Démarrer) */
  footer?: ReactNode;
  /** Déplié à l'ouverture */
  initiallyExpanded?: boolean;
  /** Hauteur max de la partie dépliable, en part de la hauteur d'écran */
  maxBodyRatio?: number;
  /** Glissé vers le bas alors que le panneau est déjà replié (navigation : réduit en fine barre) */
  onCollapse?: () => void;
  /** Marges réduites (navigation) */
  compact?: boolean;
};

/**
 * Panneau du bas façon Google Maps : on le glisse vers le haut / le bas par la poignée ou
 * l'en-tête (ou un appui sur la poignée). La carte reste utilisable au-dessus. L'en-tête et le
 * pied restent toujours affichés ; le milieu se replie et défile.
 */
export function BottomSheet({ header, children, footer, initiallyExpanded = true, maxBodyRatio = 0.42, onCollapse, compact }: Props) {
  const styles = useStyles();
  const { height: windowH } = useWindowDimensions();
  const [contentH, setContentH] = useState(0);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const openH = Math.min(contentH, windowH * maxBodyRatio);
  const [height] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(height, { toValue: expanded ? openH : 0, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  }, [height, expanded, openH]);

  const pan = useMemo(() => {
    // Hauteur au début du geste
    let startH = 0;
    const clamp = (h: number) => Math.max(0, Math.min(openH, h));
    return PanResponder.create({
      // Les appuis restent aux boutons de l'en-tête ; seul un vrai glissement vertical déplace le panneau
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        height.stopAnimation((h) => {
          startH = h;
        });
      },
      onPanResponderMove: (_, g) => height.setValue(clamp(startH - g.dy)),
      onPanResponderRelease: (_, g) => {
        // Déjà replié et glissé franchement vers le bas : réduit encore (fine barre)
        if (onCollapse && startH < 4 && (g.dy > 40 || g.vy > 0.5)) {
          onCollapse();
          return;
        }
        const h = clamp(startH - g.dy);
        // Lancé franc : suit le sens du geste ; sinon, le plus proche
        const open = g.vy < -0.4 ? true : g.vy > 0.4 ? false : h > openH / 2;
        setExpanded(open);
        Animated.spring(height, { toValue: open ? openH : 0, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
      },
      onPanResponderTerminationRequest: () => false,
    });
    // onCollapse doit rester le même d'un rendu à l'autre (sinon le geste en cours serait recréé)
  }, [height, openH, onCollapse]);

  return (
    <View style={[styles.sheet, compact && styles.sheetCompact]}>
      <View {...pan.panHandlers}>
        <Pressable
          style={[styles.handleZone, compact && styles.handleZoneCompact]}
          onPress={() => setExpanded((e) => !e)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Réduire le panneau' : 'Agrandir le panneau'}>
          <View style={styles.handle} />
        </Pressable>
        <View style={[styles.header, compact && styles.headerCompact]}>{header}</View>
      </View>
      <Animated.View style={{ height, overflow: 'hidden' }}>
        <ScrollView
          contentContainerStyle={styles.body}
          onContentSizeChange={(_, h) => setContentH(h)}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </Animated.View>
      {!!footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingBottom: 16,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  handleZone: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  // Navigation : volet plus bas (la carte d'abord)
  sheetCompact: { paddingHorizontal: 12, paddingBottom: 10 },
  handleZoneCompact: { paddingTop: 6, paddingBottom: 4 },
  headerCompact: { paddingBottom: 2 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.textFaint },
  header: { gap: 8, paddingBottom: 8 },
  body: { gap: 12, paddingTop: 8, paddingBottom: 8 },
  footer: { paddingTop: 12 },
}));
