import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, PanResponder, Pressable, Text, View } from 'react-native';

import { BottomSheet } from '@/components/nav/bottom-sheet';
import { WeatherAlerts, WeatherStrip } from '@/components/weather-strip';
import { Fonts, makeStyles, MapIconColors, Radius, Type, useColors } from '@/constants/theme';
import type { RouteOptions } from '@/lib/moto';
import { needsValhalla, shortDistance, variantInfo, variantOptions, type ManeuverIcon, type RouteVariant } from '@/lib/navigation';
import { poiInfo } from '@/lib/pois';
import { formatDuration } from '@/lib/routing';
import { countSignalsOnRoute } from '@/lib/traffic-signals';
import type { LatLng } from '@/lib/geo';
import type { SearchResult } from '@/lib/search';
import type { FuelSuggestion } from '@/lib/fuel';
import { etaFrom, type NavProgress, type RouteChoice } from '@/lib/use-navigation';
import type { RouteWeather } from '@/lib/weather';
import { FUEL_CREDIT, formatPrice, type FuelType, type RouteStation } from '@/lib/fuel-prices';

/** « 🚦 3 feux » sur l'itinéraire (trajets de moins de 60 km ; rien si inconnu ou aucun) */
function SignalCount({ route }: { route: { points: LatLng[]; distanceM: number } }) {
  const styles = useStyles();
  const [count, setCount] = useState<{ route: object; n: number | null } | null>(null);
  useEffect(() => {
    let alive = true;
    countSignalsOnRoute(route).then((n) => alive && setCount({ route, n }));
    return () => {
      alive = false;
    };
  }, [route]);
  const n = count && count.route === route ? count.n : null;
  if (!n) return null;
  return <Text style={styles.small}>🚦 {n} feu{n > 1 ? 'x' : ''}</Text>;
}

/** Panneau de navigation réduit en fine barre (mémorisé sur le téléphone) */
const MINIMIZED_KEY = 'moto.navSheet.minimized';
function readMinimized() {
  try {
    return localStorage.getItem(MINIMIZED_KEY) === '1';
  } catch {
    return false;
  }
}

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
  onMoveStop,
  onFavorite,
  onStart,
  onCancel,
  onRetry,
  weather,
  fuel,
  onAddFuel,
  stations,
  onAddStation,
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
  onMoveStop?: (index: number, delta: -1 | 1) => void;
  onFavorite: () => void;
  onStart: () => void;
  onCancel: () => void;
  /** Aucun itinéraire calculé : relancer le calcul */
  onRetry?: () => void;
  /** Météo le long de l'itinéraire choisi, à l'heure de passage */
  weather: { weather: RouteWeather | null; loading: boolean; error: boolean };
  /** Autonomie (Garage) : null si inconnue ; needed = plein nécessaire avant d'arriver */
  fuel: { leftKm: number; needed: boolean } | null;
  onAddFuel: () => void;
  /** Stations à moins de 2 km du trajet (prix officiels) : résumé et la moins chère pour mon carburant */
  stations?: { text: string | null; cheapest: (RouteStation & { price: number }) | null; fuel: FuelType } | null;
  onAddStation?: (s: RouteStation) => void;
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
            <View style={styles.errorRow}>
              <Text style={[styles.error, styles.errorText]}>{selected.error}</Text>
              {onRetry && (
                <Pressable style={styles.retry} onPress={onRetry} accessibilityRole="button">
                  <Ionicons name="refresh" size={18} color={Colors.accent} />
                  <Text style={styles.retryText}>Réessayer</Text>
                </Pressable>
              )}
            </View>
          ) : route ? (
            <View style={styles.summary}>
              <Text style={styles.duration}>{formatDuration(route.durationS)}</Text>
              <Text style={styles.muted}>
                {shortDistance(route.distanceM)} · arrivée {clock(etaFrom(route.durationS))} · {variantInfo(variant).label}
              </Text>
              {route.urban && <Text style={styles.small}>{urbanText(route.urban)}</Text>}
              <SignalCount route={route} />
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
        <VariantCard
          key={c.variant}
          choice={c}
          fast={choices.find((x) => x.variant === 'fast') ?? null}
          selected={c.variant === shownSelected}
          onPress={() => onSelectVariant(c.variant)}
        />
      ))}
      {fallback && <Text style={styles.warning}>Options indisponibles pour le moment : itinéraire standard affiché.</Text>}

      {route && (
        <>
          <Text style={styles.section}>Météo sur le trajet</Text>
          <WeatherStrip weather={weather.weather} loading={weather.loading} error={weather.error} />
        </>
      )}

      {route && stations?.text && (
        <>
          <Text style={styles.section}>Carburant sur le trajet</Text>
          <Text style={styles.muted}>⛽ {stations.text}</Text>
          {stations.cheapest && onAddStation && (
            <Pressable style={({ pressed }) => [styles.addStop, pressed && styles.pressed]} onPress={() => onAddStation(stations.cheapest!)}>
              <MaterialCommunityIcons name="gas-station" size={22} color={Colors.accent} />
              <Text style={styles.addStopText}>
                Ajouter la moins chère en étape ({formatPrice(stations.cheapest.price)}, {stations.cheapest.city ?? 'station'})
              </Text>
            </Pressable>
          )}
          <Text style={styles.small}>{FUEL_CREDIT}</Text>
        </>
      )}

      <Text style={styles.section}>Étapes</Text>
      <StopList stops={stops} onRemove={onRemoveStop} onMove={onMoveStop} />
      {fuel && !fuel.needed && route && (
        <Text style={styles.small}>⛽ Autonomie ~{Math.round(fuel.leftKm)} km : pas besoin de plein pour ce trajet.</Text>
      )}
      <Pressable style={({ pressed }) => [styles.addStop, pressed && styles.pressed]} onPress={onAddStop}>
        <Ionicons name="add-circle" size={24} color={Colors.accent} />
        <Text style={styles.addStopText}>Ajouter une étape (adresse, essence, café…)</Text>
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
          label="Éviter les villes"
          active={!!options.avoidCities}
          onPress={() => onChangeOptions({ avoidCities: !options.avoidCities })}
        />
        <OptionChip
          label="Sans non-goudronné"
          active={options.avoidUnpaved}
          onPress={() => onChangeOptions({ avoidUnpaved: !options.avoidUnpaved, preferTrails: false })}
        />
      </View>
    </BottomSheet>
  );
}

/** « +18 min · 3× plus de virages » par rapport au plus rapide */
function comparedToFast(choice: RouteChoice, fast: RouteChoice | null) {
  if (!choice.route || !fast?.route || choice.variant === 'fast') return null;
  const extraMin = Math.round((choice.route.durationS - fast.route.durationS) / 60);
  const parts = [extraMin > 0 ? `+${formatDuration(extraMin * 60)}` : extraMin < 0 ? `-${formatDuration(-extraMin * 60)}` : 'même durée'];
  if (choice.curvy && fast.curvy) {
    const ratio = choice.curvy / Math.max(fast.curvy, 1);
    if (ratio >= 1.15) parts.push(`${ratio >= 2 ? Math.round(ratio) : ratio.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}× plus de virages`);
  }
  return parts.join(' · ');
}

function VariantCard({ choice, fast, selected, onPress }: { choice: RouteChoice; fast: RouteChoice | null; selected: boolean; onPress: () => void }) {
  const Colors = useColors();
  const styles = useStyles();
  const info = variantInfo(choice.variant);
  const compared = comparedToFast(choice, fast);
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
          {choice.error ?? compared ?? info.description}
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

/** « En ville : 34 % → 5 % » (Éviter les villes) */
export function urbanText(u: { before: number; after: number }) {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  if (u.before < 0.03) return 'Presque pas de ville sur ce trajet';
  if (u.after >= u.before - 0.02) return `En ville : ${pct(u.after)} (pas de contournement raisonnable)`;
  return `En ville : ${pct(u.before)} → ${pct(u.after)}`;
}

function StopList({
  stops,
  onRemove,
  onMove,
}: {
  stops: SearchResult[];
  onRemove: (index: number) => void;
  onMove?: (index: number, delta: -1 | 1) => void;
}) {
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
          {onMove && stops.length > 1 && (
            <>
              <Pressable
                style={[styles.iconButton, i === 0 && styles.pressed]}
                disabled={i === 0}
                onPress={() => onMove(i, -1)}
                hitSlop={4}
                accessibilityLabel={`Monter l'étape ${s.label}`}>
                <Ionicons name="arrow-up-circle-outline" size={28} color={Colors.textMuted} />
              </Pressable>
              <Pressable
                style={[styles.iconButton, i === stops.length - 1 && styles.pressed]}
                disabled={i === stops.length - 1}
                onPress={() => onMove(i, 1)}
                hitSlop={4}
                accessibilityLabel={`Descendre l'étape ${s.label}`}>
                <Ionicons name="arrow-down-circle-outline" size={28} color={Colors.textMuted} />
              </Pressable>
            </>
          )}
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

/**
 * Bandeau du haut, compact : prochaine manœuvre (distance + action sur une ligne, route en petit) et,
 * si elle suit de près, la manœuvre d'après (« puis à droite »). Les alertes sont dans la pastille de
 * NavHud, plus ici.
 */
export function NavBanner({
  progress,
  then,
  rerouting,
}: {
  progress: NavProgress | null;
  /** Manœuvre suivante si elle arrive juste après (< 300 m) */
  then?: { icon: ManeuverIcon; action: string } | null;
  rerouting: boolean;
}) {
  const Colors = useColors();
  const styles = useStyles();
  const next = progress?.next;
  const recalc = progress?.offRoute || (rerouting && !!progress);
  return (
    <View style={styles.banner}>
      {next ? (
        <>
          <MaterialCommunityIcons name={ICONS[next.step.icon]} size={40} color={Colors.white} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerLine} numberOfLines={1}>
              <Text style={styles.bannerDistance}>{shortDistance(next.distanceM)}</Text>
              {'  '}
              <Text style={styles.bannerAction}>{next.step.action}</Text>
            </Text>
            {recalc ? (
              <Text style={styles.bannerRoad}>Recalcul de l’itinéraire…</Text>
            ) : (
              !!next.step.road && (
                <Text style={styles.bannerRoad} numberOfLines={1}>
                  {next.step.road}
                </Text>
              )
            )}
          </View>
        </>
      ) : (
        <Text style={styles.bannerAction}>
          {recalc ? 'Recalcul de l’itinéraire…' : progress ? 'Suis l’itinéraire' : 'Calcul de l’itinéraire…'}
        </Text>
      )}
      {next && then && (
        <View style={styles.bannerThen}>
          <Text style={styles.bannerThenText}>puis</Text>
          <MaterialCommunityIcons name={ICONS[then.icon]} size={20} color={Colors.white} />
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
  nextStation,
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
  /** « ⛽ Prochaine station dans 35 km · SP98 1,899 € » (prix officiels) */
  nextStation?: string | null;
}) {
  const Colors = useColors();
  const styles = useStyles();
  // Réduit en fine barre (glisser vers le bas) ou panneau habituel (glisser vers le haut / toucher), mémorisé
  const [minimized, setMinimizedState] = useState(readMinimized);
  const setMinimized = useCallback((v: boolean) => {
    setMinimizedState(v);
    try {
      localStorage.setItem(MINIMIZED_KEY, v ? '1' : '0');
    } catch {
      // stockage indisponible : vaut pour cette navigation
    }
  }, []);
  const minimize = useCallback(() => setMinimized(true), [setMinimized]);
  const barPan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -20 || g.vy < -0.4) setMinimized(false);
        },
      }),
    [setMinimized],
  );
  // Arrêter : toujours confirmé (un appui par erreur ne coupe pas le guidage)
  const confirmStop = () =>
    Alert.alert('Arrêter la navigation ?', undefined, [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Arrêter', style: 'destructive', onPress: onStop },
    ]);

  if (minimized) {
    const next = progress?.next;
    return (
      <View {...barPan.panHandlers}>
        <Pressable
          style={({ pressed }) => [styles.miniBar, pressed && styles.pressed]}
          onPress={() => setMinimized(false)}
          accessibilityRole="button"
          accessibilityLabel="Déplier le panneau de navigation">
          <View style={styles.miniHandle} />
          <View style={styles.miniRow}>
            {next && <MaterialCommunityIcons name={ICONS[next.step.icon]} size={24} color={Colors.accent} />}
            <Text style={styles.miniNext} numberOfLines={1}>
              {next ? `${shortDistance(next.distanceM)} · ${next.step.action}` : 'Navigation'}
            </Text>
            <Text style={styles.miniTime}>{progress ? formatDuration(progress.remainingS) : '–'}</Text>
            <Text style={styles.miniDist}>{progress ? shortDistance(progress.remainingM) : ''}</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <BottomSheet
      compact
      initiallyExpanded={false}
      onCollapse={minimize}
      header={
        <View style={styles.navHeader}>
          <View style={styles.variantText}>
            <Text style={styles.duration}>{progress ? formatDuration(progress.remainingS) : '–'}</Text>
            <Text style={styles.muted}>
              {progress ? `${shortDistance(progress.remainingM)} · arrivée ${clock(etaFrom(progress.remainingS))}` : ''}
            </Text>
            {!!nextStation && (
              <Text style={styles.small} numberOfLines={1}>
                ⛽ {nextStation}
              </Text>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
            onPress={confirmStop}
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
export function Speedometer({ kmh, limit, over, compact }: { kmh: number; limit: number | null; over: boolean; compact?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.speedRow}>
      <View style={[styles.speed, compact && styles.speedCompact, over && styles.speedOver]}>
        <Text style={[styles.speedValue, compact && styles.speedValueCompact]}>{kmh}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>
      {limit !== null && (
        <View style={[styles.limitRim, compact && styles.limitRimCompact]} accessibilityLabel={`Limitation ${limit} kilomètres heure`}>
          <View style={[styles.limit, compact && styles.limitCompact]}>
            <Text style={[styles.limitText, limit >= 100 && styles.limitText3, compact && styles.limitTextCompact, compact && limit >= 100 && styles.limitText3Compact]}>
              {limit}
            </Text>
          </View>
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
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dest: { flex: 1, fontSize: Type.large, fontWeight: '800', color: Colors.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { gap: 2 },
  duration: { fontSize: Type.title, fontWeight: '900', color: Colors.text },
  muted: { fontSize: Type.body, color: Colors.textMuted },
  small: { fontSize: Type.small, color: Colors.textMuted },
  error: { color: Colors.danger, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { flex: 1 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.accent },
  retryText: { color: Colors.accent, fontWeight: '700' },
  warning: { color: Colors.textMuted, fontSize: Type.small },
  section: { fontSize: Type.small, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  variant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  variantOn: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  variantText: { flex: 1, gap: 2 },
  variantLabel: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  variantNumbers: { alignItems: 'flex-end' },
  variantDuration: { fontSize: Type.large, fontWeight: '900', color: Colors.text },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIndexText: { color: Colors.white, fontWeight: '800' },
  stopLabel: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  addStop: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  addStopText: { fontSize: Type.body, fontWeight: '700', color: Colors.accent },
  motoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fuelWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 12,
  },
  fuelWarningText: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  fuelCard: {
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.danger,
    elevation: 4,
  },
  optionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionChipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  optionText: { fontSize: Type.body, fontWeight: '700', color: Colors.text },
  optionTextOn: { color: Colors.white },
  buttons: { flexDirection: 'row', gap: 12 },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 60,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
  },
  cancel: { flex: 1, borderWidth: 2, borderColor: Colors.danger, backgroundColor: Colors.surface },
  cancelText: { fontSize: Type.large, fontWeight: '900', color: Colors.danger },
  go: { flex: 2, backgroundColor: Colors.accent },
  goText: { fontSize: Type.large, fontWeight: '900', color: Colors.white },
  pressed: { opacity: 0.6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.guidance,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 4,
  },
  bannerText: { flex: 1 },
  bannerLine: { color: Colors.white },
  bannerDistance: { color: Colors.white, fontSize: Type.title, fontWeight: '900' },
  bannerAction: { color: Colors.white, fontSize: Type.large, fontWeight: '700' },
  bannerRoad: { color: Colors.successSoft, fontSize: Type.small + 1 },
  // « puis ↱ » : manœuvre suivante toute proche, dans le coin du bandeau
  bannerThen: { alignItems: 'center', paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: Colors.successSoft },
  bannerThenText: { color: Colors.successSoft, fontSize: Type.small },
  chip: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, elevation: 4 },
  chipText: { color: Colors.white, fontWeight: '800', fontSize: Type.body },
  navHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Panneau réduit : une ligne (prochaine instruction, temps restant, distance)
  miniBar: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 6,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  miniHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.textFaint },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniNext: { flex: 1, fontSize: Type.body, fontWeight: '700', color: Colors.text },
  miniTime: { fontSize: Type.large, fontWeight: '900', color: Colors.text },
  miniDist: { fontSize: Type.body, color: Colors.textMuted },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.danger,
    borderRadius: Radius.md,
    paddingHorizontal: 18,
    minHeight: 56,
  },
  stopText: { color: Colors.white, fontSize: Type.large, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  actionWide: { flex: 0 },
  actionText: { flex: 1, fontSize: Type.body, fontWeight: '800', color: Colors.text },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speed: {
    alignItems: 'center',
    backgroundColor: Colors.overlay,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  speedOver: { backgroundColor: Colors.danger },
  // Navigation : compteur compact, panneau collé à côté
  speedCompact: { paddingHorizontal: 10, paddingVertical: 4, minWidth: 64 },
  speedValueCompact: { fontSize: 28, lineHeight: 32, fontWeight: '700' },
  limitRimCompact: { width: 50, height: 50, borderRadius: 25 },
  limitCompact: { borderRadius: 23, borderWidth: 6 },
  limitTextCompact: { fontFamily: Fonts.title, fontSize: 21 },
  limitText3Compact: { fontFamily: Fonts.title, fontSize: 17 },
  speedValue: { color: Colors.white, fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedUnit: { color: Colors.white, fontSize: Type.small, opacity: 0.8 },
  // Panneau rond de limitation façon panneau officiel (B14) : couronne rouge, fond blanc, chiffres noirs,
  // liseré blanc extérieur ; mêmes couleurs en clair et en sombre (MapIconColors)
  limitRim: {
    width: 62,
    height: 62,
    borderRadius: 31,
    padding: 2,
    backgroundColor: MapIconColors.white,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  limit: {
    flex: 1,
    borderRadius: 29,
    backgroundColor: MapIconColors.white,
    borderWidth: 7,
    borderColor: MapIconColors.alert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: { fontFamily: Fonts.title, fontSize: 27, color: MapIconColors.ink, fontVariant: ['tabular-nums'], marginTop: -1 },
  limitText3: { fontSize: 22, letterSpacing: -0.5 },
  reportButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.white,
    elevation: 4,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
}));
