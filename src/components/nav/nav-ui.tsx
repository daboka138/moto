import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/nav/bottom-sheet';
import { WeatherAlerts, WeatherStrip } from '@/components/weather-strip';
import { makeStyles, useColors } from '@/constants/theme';
import type { RouteOptions } from '@/lib/moto';
import { needsValhalla, shortDistance, variantInfo, variantOptions, type ManeuverIcon, type RouteVariant } from '@/lib/navigation';
import { poiInfo } from '@/lib/pois';
import { reportInfo } from '@/lib/reports';
import { formatDuration } from '@/lib/routing';
import type { SearchResult } from '@/lib/search';
import type { FuelSuggestion } from '@/lib/fuel';
import type { DangerAhead } from '@/lib/use-danger-alerts';
import { etaFrom, type NavProgress, type RouteChoice } from '@/lib/use-navigation';
import type { RouteWeather } from '@/lib/weather';

const ICONS: Record<ManeuverIcon, keyof typeof MaterialCommunityIcons.glyphMap> = {
  straight: 'arrow-up',
  left: 'arrow-left-top',
  right: 'arrow-right-top',
  'slight-left': 'arrow-top-left',
  'slight-right': 'arrow-top-right',
  'sharp-left': 'arrow-bottom-left',
  'sharp-right': 'arrow-bottom-right',
  uturn: 'arrow-u-left-top',
  roundabout: 'rotate-right',
  arrive: 'flag-checkered',
  depart: 'navigation',
};

const VARIANT_ICONS: Record<RouteVariant, keyof typeof MaterialCommunityIcons.glyphMap> = {
  fast: 'lightning-bolt',
  noHighway: 'road',
  fun: 'road-variant',
};

function clock(date: Date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Aperçu avant de partir, dans un panneau qu'on glisse : choix entre plusieurs itinéraires,
 * étapes, options. « Annuler » et « Démarrer » restent toujours visibles en bas.
 */
export function RoutePreviewSheet({
  destination,
  choices,
  variant,
  stops,
  options,
  moto,
  favorite,
  onSelectVariant,
  onChangeOptions,
  onAddStop,
  onRemoveStop,
  onFavorite,
  onStart,
  onCancel,
  weather,
  fuel,
  onAddFuel,
}: {
  destination: SearchResult;
  choices: RouteChoice[];
  variant: RouteVariant;
  stops: SearchResult[];
  options: RouteOptions;
  /** Moto utilisée pour préremplir les options, ex. « Kisbee (50 cm³) » */
  moto: string | null;
  /** Destination déjà dans les favoris */
  favorite: boolean;
  onSelectVariant: (v: RouteVariant) => void;
  onChangeOptions: (patch: Partial<RouteOptions>) => void;
  onAddStop: () => void;
  onRemoveStop: (index: number) => void;
  onFavorite: () => void;
  onStart: () => void;
  onCancel: () => void;
  /** Météo le long de l'itinéraire choisi, à l'heure de passage */
  weather: { weather: RouteWeather | null; loading: boolean; error: boolean };
  /** Autonomie (Garage) : null si inconnue ; needed = plein nécessaire avant d'arriver */
  fuel: { leftKm: number; needed: boolean } | null;
  onAddFuel: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const selected = choices.find((c) => c.variant === variant) ?? null;
  const route = selected?.route ?? null;
  const visible = choices.filter((c) => !c.sameAs);
  // Variante choisie identique à une autre : c'est l'autre qui apparaît cochée
  const shownSelected = selected?.sameAs ?? variant;
  const fallback = route && route.engine === 'osrm' && needsValhalla(variantOptions(options, variant));

  return (
    <BottomSheet
      initiallyExpanded
      maxBodyRatio={0.38}
      header={
        <>
          <View style={styles.destRow}>
            <MaterialCommunityIcons name="flag-checkered" size={22} color={Colors.accent} />
            <Text style={styles.dest} numberOfLines={2}>
              {destination.label}
            </Text>
            <Pressable
              style={styles.iconButton}
              onPress={onFavorite}
              hitSlop={8}
              accessibilityLabel={favorite ? 'Favori : modifier' : 'Ajouter aux favoris'}>
              <Ionicons name={favorite ? 'star' : 'star-outline'} size={26} color={favorite ? Colors.warning : Colors.textMuted} />
            </Pressable>
          </View>
          {selected?.loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.muted}>Calcul de l’itinéraire…</Text>
            </View>
          ) : selected?.error ? (
            <Text style={styles.error}>{selected.error}</Text>
          ) : route ? (
            <View style={styles.summary}>
              <Text style={styles.duration}>{formatDuration(route.durationS)}</Text>
              <Text style={styles.muted}>
                {shortDistance(route.distanceM)} · arrivée {clock(etaFrom(route.durationS))} · {variantInfo(variant).label}
              </Text>
            </View>
          ) : null}
          {/* Alertes avant de partir : météo, carburant */}
          {route && weather.weather && <WeatherAlerts alerts={weather.weather.alerts} />}
          {route && fuel?.needed && (
            <Pressable style={styles.fuelWarning} onPress={onAddFuel}>
              <MaterialCommunityIcons name="gas-station" size={22} color={Colors.danger} />
              <Text style={styles.fuelWarningText}>
                Autonomie ~{Math.round(fuel.leftKm)} km : plein à prévoir. Ajouter une station
              </Text>
            </Pressable>
          )}
        </>
      }
      footer={
        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.bigButton, styles.cancel, pressed && styles.pressed]}
            onPress={onCancel}
            accessibilityLabel="Annuler le trajet">
            <Ionicons name="close" size={24} color={Colors.danger} />
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.bigButton, styles.go, (!route || pressed) && styles.pressed]}
            onPress={onStart}
            disabled={!route}
            accessibilityLabel="Démarrer la navigation">
            <Ionicons name="navigate" size={24} color={Colors.white} />
            <Text style={styles.goText}>Démarrer</Text>
          </Pressable>
        </View>
      }>
      <Text style={styles.section}>Itinéraires</Text>
      {visible.map((c) => (
        <VariantCard key={c.variant} choice={c} selected={c.variant === shownSelected} onPress={() => onSelectVariant(c.variant)} />
      ))}
      {fallback && <Text style={styles.warning}>Options indisponibles pour le moment : itinéraire standard affiché.</Text>}

      {route && (
        <>
          <Text style={styles.section}>Météo sur le trajet</Text>
          <WeatherStrip weather={weather.weather} loading={weather.loading} error={weather.error} />
        </>
      )}

      <Text style={styles.section}>Étapes</Text>
      <StopList stops={stops} onRemove={onRemoveStop} />
      {fuel && !fuel.needed && route && (
        <Text style={styles.small}>⛽ Autonomie ~{Math.round(fuel.leftKm)} km : pas besoin de plein pour ce trajet.</Text>
      )}
      <Pressable style={({ pressed }) => [styles.addStop, pressed && styles.pressed]} onPress={onAddStop}>
        <Ionicons name="add-circle" size={24} color={Colors.accent} />
        <Text style={styles.addStopText}>Ajouter un arrêt (essence, café…)</Text>
      </Pressable>

      <Text style={styles.section}>Options</Text>
      {moto && (
        <View style={styles.motoRow}>
          <MaterialCommunityIcons name="motorbike" size={18} color={Colors.accent} />
          <Text style={styles.muted}>Préréglé pour ta {moto}</Text>
        </View>
      )}
      <View style={styles.optionChips}>
        {options.scooter50 && <OptionChip label="Sans autoroute (obligatoire en 50)" active locked onPress={() => {}} />}
        <OptionChip label="Sans péage" active={options.avoidTolls} onPress={() => onChangeOptions({ avoidTolls: !options.avoidTolls })} />
        <OptionChip
          label="Sans non-goudronné"
          active={options.avoidUnpaved}
          onPress={() => onChangeOptions({ avoidUnpaved: !options.avoidUnpaved, preferTrails: false })}
        />
      </View>
    </BottomSheet>
  );
}

function VariantCard({ choice, selected, onPress }: { choice: RouteChoice; selected: boolean; onPress: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const info = variantInfo(choice.variant);
  const unusable = !choice.route && !choice.loading;
  return (
    <Pressable
      style={({ pressed }) => [styles.variant, selected && styles.variantOn, (pressed || unusable) && styles.pressed]}
      onPress={onPress}
      disabled={unusable}
      accessibilityState={{ selected }}>
      <MaterialCommunityIcons name={VARIANT_ICONS[choice.variant]} size={26} color={selected ? Colors.accent : Colors.textMuted} />
      <View style={styles.variantText}>
        <Text style={styles.variantLabel}>{info.label}</Text>
        <Text style={styles.small} numberOfLines={1}>
          {choice.error ?? info.description}
        </Text>
      </View>
      {choice.loading ? (
        <ActivityIndicator color={Colors.accent} />
      ) : choice.route ? (
        <View style={styles.variantNumbers}>
          <Text style={styles.variantDuration}>{formatDuration(choice.route.durationS)}</Text>
          <Text style={styles.small}>{shortDistance(choice.route.distanceM)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function StopList({ stops, onRemove }: { stops: SearchResult[]; onRemove: (index: number) => void }) {
  const Colors = useColors();
  const styles = useStyles();
  if (!stops.length) return <Text style={styles.small}>Aucun arrêt prévu.</Text>;
  return (
    <>
      {stops.map((s, i) => (
        <View key={`${s.latitude},${s.longitude}`} style={styles.stopRow}>
          <View style={styles.stopIndex}>
            <Text style={styles.stopIndexText}>{i + 1}</Text>
          </View>
          <View style={styles.variantText}>
            <Text style={styles.stopLabel} numberOfLines={1}>
              {s.label}
            </Text>
            {!!s.detail && (
              <Text style={styles.small} numberOfLines={1}>
                {s.detail}
              </Text>
            )}
          </View>
          <Pressable style={styles.iconButton} onPress={() => onRemove(i)} hitSlop={8} accessibilityLabel={`Retirer l'arrêt ${s.label}`}>
            <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </>
  );
}

function OptionChip({
  label,
  active,
  locked,
  onPress,
}: {
  label: string;
  active: boolean;
  locked?: boolean;
  onPress: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.optionChip, active && styles.optionChipOn, locked && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={locked}>
      <Ionicons
        name={locked ? 'lock-closed' : active ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={active ? Colors.white : Colors.textMuted}
      />
      <Text style={[styles.optionText, active && styles.optionTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** Bandeau du haut : prochaine manœuvre en gros, alerte danger en dessous. */
export function NavBanner({
  progress,
  danger,
  rerouting,
}: {
  progress: NavProgress | null;
  danger: DangerAhead | null;
  rerouting: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const next = progress?.next;
  return (
    <View style={styles.bannerWrap}>
      <View style={styles.banner}>
        {next ? (
          <>
            <MaterialCommunityIcons name={ICONS[next.step.icon]} size={56} color={Colors.white} />
            <View style={styles.bannerText}>
              <Text style={styles.bannerDistance}>{shortDistance(next.distanceM)}</Text>
              <Text style={styles.bannerAction} numberOfLines={2}>
                {next.step.action}
              </Text>
              {!!next.step.road && (
                <Text style={styles.bannerRoad} numberOfLines={1}>
                  {next.step.road}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.bannerAction}>{progress ? 'Suivez l’itinéraire' : 'Calcul de l’itinéraire…'}</Text>
        )}
      </View>
      {(progress?.offRoute || (rerouting && !!progress)) && (
        <View style={[styles.chip, { backgroundColor: Colors.ghost }]}>
          <Text style={styles.chipText}>Recalcul de l’itinéraire…</Text>
        </View>
      )}
      {danger && (
        <View style={[styles.chip, { backgroundColor: Colors.danger }]}>
          <Text style={styles.chipText}>
            {reportInfo(danger.report.type).emoji} {reportInfo(danger.report.type).label} dans {shortDistance(danger.distanceM)}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Panneau du bas en navigation : temps restant et gros bouton rouge « Arrêter » toujours
 * visibles ; en le dépliant : station essence sur le trajet, arrêts, partage en direct.
 */
export function NavSheet({
  progress,
  stops,
  sharedWith,
  onStop,
  onFuel,
  onAddStop,
  onShare,
  onRemoveStop,
  fuelLeftKm,
  onFilled,
}: {
  progress: NavProgress | null;
  stops: SearchResult[];
  /** Pseudos des amis qui suivent mon trajet */
  sharedWith: string[];
  onStop: () => void;
  onFuel: () => void;
  onAddStop: () => void;
  onShare: () => void;
  onRemoveStop: (index: number) => void;
  /** Autonomie restante estimée (null : inconnue) */
  fuelLeftKm: number | null;
  /** Plein fait (la jauge repart du plein) ; absent : réservoir non renseigné */
  onFilled?: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <BottomSheet
      initiallyExpanded={false}
      header={
        <View style={styles.navHeader}>
          <View style={styles.variantText}>
            <Text style={styles.duration}>{progress ? formatDuration(progress.remainingS) : '–'}</Text>
            <Text style={styles.muted}>
              {progress ? `${shortDistance(progress.remainingM)} · arrivée ${clock(etaFrom(progress.remainingS))}` : ''}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
            onPress={onStop}
            hitSlop={8}
            accessibilityLabel="Arrêter la navigation">
            <Ionicons name="close" size={30} color={Colors.white} />
            <Text style={styles.stopText}>Arrêter</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.actions}>
        <ActionButton icon="gas-station" label={`${poiInfo('fuel').label} sur mon trajet`} onPress={onFuel} />
        <ActionButton icon="map-marker-plus" label="Ajouter un arrêt" onPress={onAddStop} />
      </View>
      <ActionButton
        icon="share-variant"
        label={sharedWith.length ? `Partagé avec ${sharedWith.map((u) => `@${u}`).join(', ')}` : 'Partager mon trajet en direct'}
        onPress={onShare}
        wide
      />
      {onFilled && (
        <ActionButton
          icon="fuel"
          label={fuelLeftKm !== null ? `Autonomie ~${Math.round(fuelLeftKm)} km · J’ai fait le plein` : 'J’ai fait le plein'}
          onPress={onFilled}
          wide
        />
      )}
      {stops.length > 0 && (
        <>
          <Text style={styles.section}>Étapes</Text>
          <StopList stops={stops} onRemove={onRemoveStop} />
        </>
      )}
    </BottomSheet>
  );
}

/** Autonomie faible en navigation : station proposée sur le trajet */
export function FuelSuggestionCard({
  suggestion,
  onAdd,
  onSearch,
  onClose,
}: {
  suggestion: FuelSuggestion;
  onAdd: () => void;
  onSearch: () => void;
  onClose: () => void;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const { station } = suggestion;
  return (
    <View style={styles.fuelCard}>
      <View style={styles.destRow}>
        <MaterialCommunityIcons name="gas-station" size={30} color={Colors.danger} />
        <View style={styles.variantText}>
          <Text style={styles.variantLabel}>Autonomie ~{Math.round(suggestion.leftKm)} km</Text>
          <Text style={styles.small} numberOfLines={2}>
            {suggestion.searching
              ? 'Recherche d’une station sur le trajet…'
              : station
                ? `${station.label} · dans ${shortDistance(station.aheadM)} sur ton trajet`
                : 'Aucune station trouvée sur les 50 prochains km'}
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={onClose} hitSlop={8} accessibilityLabel="Fermer">
          <Ionicons name="close" size={26} color={Colors.textMuted} />
        </Pressable>
      </View>
      {!suggestion.searching && (
        <Pressable
          style={({ pressed }) => [styles.bigButton, styles.go, pressed && styles.pressed]}
          onPress={station ? onAdd : onSearch}>
          <MaterialCommunityIcons name={station ? 'map-marker-plus' : 'magnify'} size={24} color={Colors.white} />
          <Text style={styles.goText}>{station ? 'Ajouter l’arrêt' : 'Chercher une station'}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Gros bouton d'action, utilisable avec des gants */
function ActionButton({
  icon,
  label,
  onPress,
  wide,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  wide?: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable style={({ pressed }) => [styles.action, wide && styles.actionWide, pressed && styles.pressed]} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={30} color={Colors.accent} />
      <Text style={styles.actionText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Compteur de vitesse et panneau de limitation ; rouge si je dépasse. */
export function Speedometer({ kmh, limit, over }: { kmh: number; limit: number | null; over: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.speedRow}>
      <View style={[styles.speed, over && styles.speedOver]}>
        <Text style={styles.speedValue}>{kmh}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>
      {limit !== null && (
        <View style={styles.limit} accessibilityLabel={`Limitation ${limit} kilomètres heure`}>
          <Text style={[styles.limitText, limit >= 100 && { fontSize: 19 }]}>{limit}</Text>
        </View>
      )}
    </View>
  );
}

/** Gros bouton rond « + » pour signaler, utilisable avec des gants. */
export function ReportButton({ onPress }: { onPress: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [styles.reportButton, pressed && { transform: [{ scale: 0.95 }] }]}
      onPress={onPress}
      hitSlop={12}
      accessibilityLabel="Signaler un danger">
      <Ionicons name="add" size={44} color={Colors.white} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dest: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { gap: 2 },
  duration: { fontSize: 26, fontWeight: '900', color: Colors.text },
  muted: { fontSize: 14, color: Colors.textMuted },
  small: { fontSize: 13, color: Colors.textMuted },
  error: { color: Colors.danger, fontWeight: '600' },
  warning: { color: Colors.textMuted, fontSize: 13 },
  section: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  variant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  variantOn: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  variantText: { flex: 1, gap: 2 },
  variantLabel: { fontSize: 16, fontWeight: '800', color: Colors.text },
  variantNumbers: { alignItems: 'flex-end' },
  variantDuration: { fontSize: 17, fontWeight: '900', color: Colors.text },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIndexText: { color: Colors.white, fontWeight: '800' },
  stopLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  addStopText: { fontSize: 15, fontWeight: '700', color: Colors.accent },
  motoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fuelWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 10,
  },
  fuelWarningText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  fuelCard: {
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 2,
    borderColor: Colors.danger,
    elevation: 6,
  },
  optionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionChipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  optionText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  optionTextOn: { color: Colors.white },
  buttons: { flexDirection: 'row', gap: 10 },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 60,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  cancel: { flex: 1, borderWidth: 2, borderColor: Colors.danger, backgroundColor: Colors.surface },
  cancelText: { fontSize: 17, fontWeight: '900', color: Colors.danger },
  go: { flex: 2, backgroundColor: Colors.accent },
  goText: { fontSize: 18, fontWeight: '900', color: Colors.white },
  pressed: { opacity: 0.6 },
  bannerWrap: { gap: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.guidance,
    borderRadius: 20,
    padding: 16,
    elevation: 6,
  },
  bannerText: { flex: 1 },
  bannerDistance: { color: Colors.white, fontSize: 34, fontWeight: '900' },
  bannerAction: { color: Colors.white, fontSize: 19, fontWeight: '700' },
  bannerRoad: { color: Colors.successSoft, fontSize: 15 },
  chip: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, elevation: 4 },
  chipText: { color: Colors.white, fontWeight: '800', fontSize: 16 },
  navHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.danger,
    borderRadius: 18,
    paddingHorizontal: 22,
    minHeight: 68,
  },
  stopText: { color: Colors.white, fontSize: 20, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.background,
  },
  actionWide: { flex: 0 },
  actionText: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.text },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speed: {
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  speedOver: { backgroundColor: Colors.danger },
  speedValue: { color: Colors.white, fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedUnit: { color: Colors.white, fontSize: 12, opacity: 0.8 },
  // Panneau rond de limitation, comme sur la route
  limit: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.white,
    borderWidth: 6,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  limitText: { fontSize: 22, fontWeight: '900', color: Colors.dark, fontVariant: ['tabular-nums'] },
  reportButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.white,
    elevation: 8,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
}));
