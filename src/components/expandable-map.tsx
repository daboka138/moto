import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { LeafletMap } from '@/components/leaflet-map';
import type { MapProps } from '@/components/map-types';
import { makeStyles, Type, useColors } from '@/constants/theme';

/**
 * Mini-carte avec un bouton ⤢ qui l'ouvre en plein écran : barre en haut (←, titre, sous-titre),
 * zoom et déplacement libres, boutons en bas (footer). Le bouton retour d'Android ferme le plein
 * écran (onRequestClose). fullProps : props de carte propres au plein écran (sélection au toucher…).
 */
export function ExpandableMap({
  style,
  title,
  subtitle,
  footer,
  fullProps,
  ...map
}: MapProps & {
  style: StyleProp<ViewStyle>;
  title?: string;
  subtitle?: string;
  /** Boutons du bas ; close() ferme le plein écran (avant de changer d'écran) */
  footer?: (close: () => void) => ReactNode;
  fullProps?: Partial<MapProps>;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const [full, setFull] = useState(false);
  const close = () => setFull(false);

  return (
    <>
      <View style={style}>
        <LeafletMap {...map} />
        <Pressable
          style={({ pressed }) => [styles.expand, pressed && { opacity: 0.7 }]}
          onPress={() => setFull(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Agrandir la carte">
          <Ionicons name="expand" size={20} color={Colors.text} />
        </Pressable>
      </View>

      <Modal visible={full} animationType="slide" onRequestClose={close} statusBarTranslucent>
        <SafeAreaProvider>
          <SafeAreaView style={styles.full} edges={['top', 'bottom']}>
            <View style={styles.bar}>
              <Pressable onPress={close} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Retour">
                <Ionicons name="arrow-back" size={24} color={Colors.text} />
              </Pressable>
              <View style={{ flex: 1 }}>
                {!!title && (
                  <Text style={styles.title} numberOfLines={1}>
                    {title}
                  </Text>
                )}
                {!!subtitle && (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              {full && <LeafletMap {...map} {...fullProps} />}
            </View>
            {footer && <View style={styles.footer}>{footer(close)}</View>}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  expand: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  full: { flex: 1, backgroundColor: Colors.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { padding: 4 },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: Type.small, color: Colors.textMuted },
  footer: { padding: 12, gap: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border },
}));
