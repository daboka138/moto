import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import { makeStyles, Type } from '@/constants/theme';
import { useDisplayName } from '@/lib/display-names';

/**
 * Nom d'un motard : nom affiché en gros + @pseudo en petit dessous (stacked), ou sur une ligne
 * « Dimitri @admin » (inline). Sans nom affiché : @pseudo seul, dans le style principal.
 */
export function UserName({
  userId,
  username,
  style,
  subStyle,
  variant = 'stacked',
  numberOfLines = 1,
  prefix,
}: {
  userId: string | null | undefined;
  username: string;
  style?: StyleProp<TextStyle>;
  subStyle?: StyleProp<TextStyle>;
  variant?: 'stacked' | 'inline';
  numberOfLines?: number;
  /** Texte avant le nom (ex. « Organisé par ») */
  prefix?: string;
}) {
  const styles = useStyles();
  const name = useDisplayName(userId);
  if (!name) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {prefix}@{username}
      </Text>
    );
  }
  if (variant === 'inline') {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {prefix}
        {name}
        <Text style={[styles.sub, subStyle]}> @{username}</Text>
      </Text>
    );
  }
  return (
    <View>
      <Text style={style} numberOfLines={numberOfLines}>
        {prefix}
        {name}
      </Text>
      <Text style={[styles.sub, subStyle]} numberOfLines={1}>
        @{username}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  sub: { fontSize: Type.small, fontWeight: '400', color: Colors.textMuted },
}));
