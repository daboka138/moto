import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/constants/theme';
import { weatherInfo, type RouteWeather } from '@/lib/weather';

function clock(d: Date) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Alertes météo du trajet (pluie, vent, froid…) en bandeau orange */
export function WeatherAlerts({ alerts }: { alerts: string[] }) {
  const Colors = useColors();
  const styles = useStyles();
  if (!alerts.length) return null;
  return (
    <View style={styles.alerts}>
      <Ionicons name="warning" size={18} color={Colors.warning} />
      <Text style={styles.alertText}>{alerts.join(' · ')}</Text>
    </View>
  );
}

/** Météo le long du trajet : un point tous les 15 km environ, à l'heure de passage. */
export function WeatherStrip({ weather, loading, error }: { weather: RouteWeather | null; loading: boolean; error?: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  if (loading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={Colors.accent} size="small" />
        <Text style={styles.muted}>Météo du trajet…</Text>
      </View>
    );
  }
  if (error) return <Text style={styles.muted}>Météo indisponible pour le moment.</Text>;
  if (!weather) return null;
  if (weather.tooFar) return <Text style={styles.muted}>Prévisions météo disponibles 16 jours avant.</Text>;
  return (
    <View style={styles.wrap}>
      <WeatherAlerts alerts={weather.alerts} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {weather.samples.map((s, i) => {
          const f = s.forecast;
          return (
            <View key={i} style={styles.cell}>
              <Text style={styles.time}>{clock(s.at)}</Text>
              <Text style={styles.km}>{Math.round(s.alongM / 1000)} km</Text>
              {f ? (
                <>
                  <Text style={styles.emoji}>{weatherInfo(f.code).emoji}</Text>
                  <Text style={styles.temp}>{Math.round(f.tempC)}°</Text>
                  <Text style={[styles.small, f.precipMm >= 0.5 && { color: Colors.accent, fontWeight: '800' }]}>
                    💧{f.precipProb !== null ? `${f.precipProb}%` : `${f.precipMm.toFixed(1)}`}
                  </Text>
                  <Text style={[styles.small, f.gustKmh >= 60 && { color: Colors.danger, fontWeight: '800' }]}>
                    💨{Math.round(f.windKmh)}
                  </Text>
                </>
              ) : (
                <Text style={styles.small}>–</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
      <Text style={styles.credit}>Météo : Open-Meteo · vent en km/h</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: 13, color: Colors.textMuted },
  alerts: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 10,
  },
  alertText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  strip: { gap: 8 },
  cell: {
    alignItems: 'center',
    gap: 1,
    minWidth: 58,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: Colors.background,
  },
  time: { fontSize: 13, fontWeight: '800', color: Colors.text },
  km: { fontSize: 11, color: Colors.textMuted },
  emoji: { fontSize: 22 },
  temp: { fontSize: 16, fontWeight: '900', color: Colors.text },
  small: { fontSize: 11, color: Colors.textMuted },
  credit: { fontSize: 10, color: Colors.textFaint },
}));
