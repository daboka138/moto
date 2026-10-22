import { Ionicons } from '@expo/vector-icons';
import { trackUsage } from '@/lib/usage';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';
import { useLocalWeather, WEATHER_CREDIT, weatherInfo } from '@/lib/weather';

/**
 * Carte hors navigation : petite météo actuelle de l'endroit (pastille ronde dans la colonne des
 * boutons) ; toucher = détail heure par heure sur 12 h. Position arrondie à ~10 km.
 */
export function MapWeather({ at }: { at: LatLng | null }) {
  const Colors = useColors();
  const styles = useStyles();
  const hours = useLocalWeather(at, true);
  const [open, setOpen] = useState(false);
  const now = hours?.[0];
  if (!now) return null;
  const info = weatherInfo(now.symbol);
  return (
    <>
      <Pressable
        style={styles.pill}
        onPress={() => {
          setOpen(true);
          trackUsage('weather');
        }}
        hitSlop={6}
        accessibilityLabel={`Météo : ${info.label}, ${Math.round(now.tempC)} degrés. Détail sur 12 heures`}>
        <Text style={styles.pillEmoji}>{info.emoji}</Text>
        <Text style={styles.pillTemp}>{Math.round(now.tempC)}°</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>Météo ici, 12 prochaines heures</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Fermer">
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {(hours ?? []).map((h, i) => {
                const w = weatherInfo(h.symbol);
                return (
                  <View key={i} style={[styles.hour, i > 0 && styles.sep]}>
                    <Text style={styles.time}>{i === 0 ? 'Maint.' : `${h.at.getHours()}h`}</Text>
                    <Text style={styles.emoji}>{w.emoji}</Text>
                    <Text style={styles.temp}>{Math.round(h.tempC)}°</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label} numberOfLines={1}>
                        {w.label}
                      </Text>
                      <Text style={[styles.sub, h.gustKmh >= 50 && { color: Colors.danger }]}>
                        {h.precipMm >= 0.1 ? `${h.precipMm.toFixed(1)} mm · ` : ''}vent {Math.round(h.windKmh)} km/h
                        {h.gustKmh >= 50 ? ` · rafales ${h.gustEstimated ? '~' : ''}${Math.round(h.gustKmh)}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <Text style={styles.credit}>{WEATHER_CREDIT} · zone d’environ 10 km</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  pill: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pillEmoji: { fontSize: Type.large, lineHeight: 22 },
  pillTemp: { fontSize: Type.small, fontWeight: '800', color: Colors.text },
  backdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 16,
    gap: 12,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: Type.large, fontWeight: '800', color: Colors.text },
  hour: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  sep: { borderTopWidth: 1, borderTopColor: Colors.border },
  time: { width: 52, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  emoji: { fontSize: Type.title },
  temp: { width: 40, fontSize: Type.large, fontWeight: '800', color: Colors.text },
  label: { fontSize: Type.body, color: Colors.text },
  sub: { fontSize: Type.small, color: Colors.textMuted },
  credit: { fontSize: Type.small, color: Colors.textFaint },
}));
