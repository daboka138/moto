import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { Fonts, makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { useCanUse } from '@/lib/features';
import { useWeatherSummary, WEATHER_CREDIT, weatherInfo, type RouteWeather, type WeatherAhead, type WeatherSummary } from '@/lib/weather';

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

/** Navigation : prochain phénomène météo devant moi (« Pluie prévue dans ~40 km ») */
export function NavWeatherChip({ ahead }: { ahead: WeatherAhead | null }) {
  const styles = useStyles();
  if (!ahead) return null;
  return (
    <View style={styles.navChip}>
      <Text style={styles.navChipText} numberOfLines={1}>
        {ahead.emoji} {ahead.text}
      </Text>
    </View>
  );
}

/** Résumé en une ligne : « ☀️ Sec, 18-22 °C » ou « 🌧️ Pluie possible vers Gémenos vers 15h… » */
export function WeatherSummaryLine({ summary }: { summary: WeatherSummary | null }) {
  const styles = useStyles();
  if (!summary) return null;
  return (
    <View style={[styles.summary, summary.bad && styles.summaryBad]}>
      <Text style={styles.summaryEmoji}>{summary.emoji}</Text>
      <Text style={styles.summaryText}>{summary.text}</Text>
    </View>
  );
}

/** Résumé seul (boucles) : chargement discret, rien en cas d'erreur */
export function WeatherSummaryOnly({ weather, loading }: { weather: RouteWeather | null; loading: boolean }) {
  const Colors = useColors();
  const styles = useStyles();
  const summary = useWeatherSummary(weather);
  if (loading) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={Colors.accent} size="small" />
        <Text style={styles.muted}>Météo du trajet…</Text>
      </View>
    );
  }
  if (!summary) return null;
  return (
    <View style={styles.wrap}>
      <WeatherSummaryLine summary={summary} />
      <Text style={styles.credit}>{WEATHER_CREDIT}</Text>
    </View>
  );
}

/** Balade : météo prévue au départ et à l'arrivée, aux heures prévues */
function Endpoints({ weather }: { weather: RouteWeather }) {
  const styles = useStyles();
  const first = weather.samples[0];
  const last = weather.samples[weather.samples.length - 1];
  if (!first || !last || first === last) return null;
  const line = (label: string, s: typeof first) => {
    const f = s.forecast;
    return (
      <Text style={styles.endpoint}>
        <Text style={styles.endpointLabel}>{label} {clock(s.at)} : </Text>
        {f ? `${weatherInfo(f.symbol).emoji} ${weatherInfo(f.symbol).label}, ${Math.round(f.tempC)}°, vent ${Math.round(f.windKmh)} km/h` : '–'}
      </Text>
    );
  };
  return (
    <View style={styles.endpoints}>
      {line('Départ', first)}
      {line('Arrivée', last)}
    </View>
  );
}

/**
 * Météo le long du trajet : résumé + alertes (gratuits pour tous), puis le détail (fonction
 * weather_detail) : un point tous les ~20 km à l'heure de passage.
 */
export function WeatherStrip({
  weather,
  loading,
  error,
  showEnds,
}: {
  weather: RouteWeather | null;
  loading: boolean;
  error?: boolean;
  /** Afficher la météo au départ et à l'arrivée (fiche balade) */
  showEnds?: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const summary = useWeatherSummary(weather);
  const detail = useCanUse('weather_detail');
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
  if (weather.tooFar) return <Text style={styles.muted}>Prévisions météo disponibles 9 jours avant.</Text>;
  return (
    <View style={styles.wrap}>
      <WeatherSummaryLine summary={summary} />
      {detail && showEnds && <Endpoints weather={weather} />}
      <WeatherAlerts alerts={weather.alerts} />
      {detail && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {weather.samples.map((s, i) => {
            const f = s.forecast;
            return (
              <View key={i} style={styles.cell}>
                <Text style={styles.time}>{clock(s.at)}</Text>
                <Text style={styles.km}>{Math.round(s.alongM / 1000)} km</Text>
                {f ? (
                  <>
                    <Text style={styles.emoji}>{weatherInfo(f.symbol).emoji}</Text>
                    <Text style={styles.temp}>{Math.round(f.tempC)}°</Text>
                    <Text style={[styles.small, f.precipMm >= 0.5 && { color: Colors.accent, fontFamily: Fonts.bold }]}>💧{f.precipMm.toFixed(1)}</Text>
                    <Text style={[styles.small, f.gustKmh >= 50 && { color: Colors.danger, fontFamily: Fonts.bold }]}>💨{Math.round(f.windKmh)}</Text>
                  </>
                ) : (
                  <Text style={styles.small}>–</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      <Text style={styles.credit}>
        {WEATHER_CREDIT}
        {detail ? ' · pluie en mm/h, vent en km/h' : ''}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  wrap: { gap: 8 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryBad: { borderWidth: 1, borderColor: Colors.warning },
  summaryEmoji: { fontSize: Type.large },
  summaryText: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  endpoints: { gap: 4 },
  endpoint: { fontSize: Type.body, color: Colors.text },
  endpointLabel: { fontWeight: '800' },
  navChip: {
    alignSelf: 'center',
    maxWidth: '100%',
    backgroundColor: Colors.warning,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
  },
  navChipText: { color: Colors.white, fontWeight: '800', fontSize: Type.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: Type.small, color: Colors.textMuted },
  alerts: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    padding: 12,
  },
  alertText: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  strip: { gap: 8 },
  cell: {
    alignItems: 'center',
    gap: 1,
    minWidth: 58,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  time: { fontSize: Type.small, fontWeight: '800', color: Colors.text },
  km: { fontSize: Type.small, color: Colors.textMuted },
  emoji: { fontSize: Type.title },
  temp: { fontSize: Type.body, fontWeight: '900', color: Colors.text },
  small: { fontSize: Type.small, color: Colors.textMuted },
  credit: { fontSize: Type.small, color: Colors.textFaint },
}));
