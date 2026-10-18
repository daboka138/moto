import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { Fonts, makeStyles, Radius, Space, Type, useColors } from '@/constants/theme';
import { TAB_RAIL_WIDTH } from '@/lib/use-wide-layout';

const LOGO = require('../../assets/images/icon.png');

/**
 * Web sur grand écran : colonne d'onglets à gauche, façon réseau social. Logo en haut, une rangée
 * par onglet (icône + libellé alignés), onglet actif = fine barre bleue + léger fond, pas de pavé plein.
 */
export function SideRail({ state, descriptors, navigation }: BottomTabBarProps) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.rail}>
      <View style={styles.brand}>
        <Image source={LOGO} style={styles.logo} contentFit="contain" />
        <Text style={styles.brandText}>PasseRyder</Text>
      </View>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        // Onglet masqué (href: null)
        if ((options.tabBarItemStyle as { display?: string } | undefined)?.display === 'none') return null;
        const focused = state.index === index;
        const color = focused ? Colors.accent : Colors.textMuted;
        const badge = options.tabBarBadge;
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}
            style={({ hovered }: { hovered?: boolean }) => [
              styles.item,
              focused && styles.itemOn,
              hovered && !focused && styles.itemHover,
            ]}>
            <View style={[styles.bar, focused && styles.barOn]} />
            <View style={styles.icon}>{options.tabBarIcon?.({ focused, color, size: 24 })}</View>
            <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
              {options.title ?? route.name}
            </Text>
            {badge !== undefined && <Text style={styles.badge}>{badge}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  rail: {
    width: TAB_RAIL_WIDTH,
    height: '100%',
    backgroundColor: Colors.background,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: 2,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    marginBottom: Space.lg,
  },
  logo: { width: 32, height: 32, borderRadius: Radius.sm },
  brandText: {
    fontFamily: Fonts.title,
    fontSize: Type.title,
    color: Colors.text,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 10,
    paddingRight: Space.sm,
    borderRadius: Radius.sm,
  },
  itemOn: { backgroundColor: Colors.surface },
  itemHover: { backgroundColor: Colors.surface },
  bar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: Colors.background,
  },
  barOn: { backgroundColor: Colors.accent },
  icon: { width: 26, alignItems: 'center' },
  label: { flex: 1, fontSize: Type.large, color: Colors.text },
  labelOn: { fontWeight: '700', color: Colors.accent },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    textAlign: 'center',
    backgroundColor: Colors.danger,
    color: Colors.white,
    fontSize: Type.small,
    fontWeight: '800',
  },
}));
