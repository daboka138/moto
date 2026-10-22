import { Text, View } from 'react-native';

import { makeStyles, Type } from '@/constants/theme';
import { usePerfEnabled, usePerfStats } from '@/lib/perf-meter';

/** Admin : « 58 i/s · 1,2 ms/image · pire 34 ms · 6 msg/s » (lib/perf-meter.ts), seul à se redessiner */
export function PerfBadge() {
  const styles = useStyles();
  const on = usePerfEnabled();
  const stats = usePerfStats();
  if (!on) return null;
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.text}>
        {stats
          ? `${stats.fps} i/s · ${stats.workMs.toFixed(1).replace('.', ',')} ms/image · pire ${stats.worstMs} ms · ${String(stats.msgsPerS).replace('.', ',')} msg/s`
          : 'Mesures de fluidité…'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  badge: { alignSelf: 'center', backgroundColor: Colors.overlayStrong, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: Colors.white, fontSize: Type.small, fontVariant: ['tabular-nums'] },
}));
