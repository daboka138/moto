import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { mapCss, MAPTILER_KEY, OSM_COPYRIGHT, TILES } from '@/components/map-style';
import type { MapMarker, MapPin, MapProps } from '@/components/map-types';
import { DarkColors, LightColors, SIGN_INK, useTheme, type Palette } from '@/constants/theme';
import { useMapDark } from '@/lib/use-map-dark';

export type { MapMarker, MapPin, MapPosition, MapRoute } from '@/components/map-types';

// Version web de la carte : Leaflet directement dans la page (pas de WebView), mêmes props que
// l'app. Carte de consultation : pas de rotation, de flèche animée ni de bip de navigation.
// Clic = appui, clic droit (ou appui long sur mobile) = appui long.

const STYLE_ID = 'passeryder-map-style';

/** Styles des repères aux couleurs du thème, ajoutés une fois dans la page (mis à jour au changement de thème). */
function injectStyles(Colors: Palette) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `${mapCss(Colors)}
  .leaflet-container { font-family: inherit; }
  .leaflet-control-zoom a { background: ${Colors.surface}; color: ${Colors.text}; border-color: ${Colors.border} !important; }`;
}

function personIcon(m: MapMarker, selected: boolean) {
  const el = document.createElement('div');
  el.className = 'person' + (m.tone && m.tone !== 'default' ? ' ' + m.tone : '') + (selected ? ' selected' : '');
  const img = document.createElement('img');
  img.src = m.photoUrl;
  img.alt = '';
  el.appendChild(img);
  return L.divIcon({ className: 'person-wrap', html: el, iconSize: [44, 44], iconAnchor: [22, 22] });
}

function pinIcon(p: MapPin) {
  const el = document.createElement('div');
  if (p.sign) {
    // Panneau façon signalisation routière : triangle (danger) ou losange (circulation)
    el.className = 'sign';
    const shape =
      p.sign.shape === 'diamond' ? '<path d="M23 2 L44 23 L23 44 L2 23 Z"' : '<path d="M23 3 L44 41 L2 41 Z"';
    const y = p.sign.shape === 'diamond' ? 30 : 35;
    const size = p.sign.glyph === '!' ? 24 : 17;
    el.innerHTML =
      `<svg viewBox="0 0 46 46">${shape} fill="${p.sign.fill}" stroke="${p.sign.stroke}" stroke-width="4" stroke-linejoin="round"/>` +
      `<text x="23" y="${y}" font-size="${size}" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="${SIGN_INK}">` +
      `${p.sign.glyph}</text></svg>`;
    return L.divIcon({ className: 'sign-wrap', html: el, iconSize: [46, 46], iconAnchor: [23, 41] });
  }
  if (p.kind === 'dropped') {
    el.className = 'drop';
    return L.divIcon({ className: 'pin-wrap', html: el, iconSize: [26, 26], iconAnchor: [13, 31] });
  }
  el.className = 'pin ' + p.kind;
  el.textContent = p.label;
  return L.divIcon({ className: 'pin-wrap', html: el, iconSize: undefined, iconAnchor: [14, 14] });
}

function meIcon(Colors: Palette) {
  const el = document.createElement('div');
  el.className = 'me nohead';
  el.innerHTML = `<svg class="dot" viewBox="0 0 40 40"><circle cx="20" cy="20" r="9" fill="${Colors.me}" stroke="${Colors.white}" stroke-width="3"/></svg>`;
  return L.divIcon({ className: 'me-wrap', html: el, iconSize: [40, 40], iconAnchor: [20, 20] });
}

export function LeafletMap({
  position,
  follow = false,
  onUserPan,
  onBearingChange,
  markers = [],
  pins = [],
  onPinPress,
  routes = [],
  fitPoints,
  selectedMarkerId = null,
  onMarkerPress,
  onMapPress,
  onMapLongPress,
  onMarkersRendered,
  onViewChange,
}: MapProps) {
  const { colors } = useTheme();
  const mapDark = useMapDark(position ?? null);
  const containerRef = useRef<View>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const routesRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<{ marker: L.Marker; halo: L.Circle } | null>(null);
  const centeredRef = useRef(false);
  // Derniers callbacks reçus : les écouteurs Leaflet, posés une seule fois, les lisent ici
  const handlers = useRef({ onUserPan, onMarkerPress, onPinPress, onMapPress, onMapLongPress, onViewChange });
  useEffect(() => {
    handlers.current = { onUserPan, onMarkerPress, onPinPress, onMapPress, onMapLongPress, onViewChange };
  });

  // Création de la carte
  useEffect(() => {
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el) return;
    const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([46.6, 2.4], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    pinsRef.current = L.layerGroup().addTo(map);
    routesRef.current = L.layerGroup().addTo(map);

    map.on('dragstart', () => handlers.current.onUserPan?.());
    // Pas d'animation de déplacement des pastilles pendant un zoom
    map.on('zoomstart', () => el.classList.add('zooming'));
    map.on('zoomend', () => setTimeout(() => el.classList.remove('zooming'), 50));
    map.on('click', (e: L.LeafletMouseEvent) =>
      handlers.current.onMapPress?.({ latitude: e.latlng.lat, longitude: e.latlng.lng }),
    );
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      handlers.current.onMapLongPress?.({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    });
    const sendView = () => {
      const c = map.getCenter();
      handlers.current.onViewChange?.({ latitude: c.lat, longitude: c.lng });
    };
    map.on('moveend', sendView);
    sendView();
    onBearingChange?.(0);

    // La carte suit la taille de son conteneur (fenêtre redimensionnée, panneau latéral…)
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el);
    const markerMap = markersRef.current;
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      tilesRef.current = null;
      meRef.current = null;
      markerMap.clear();
    };
    // Une seule carte par composant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    injectStyles(colors);
  }, [colors]);

  // Fond MapTiler (clair ou sombre), repli sur OpenStreetMap si les tuiles sont refusées
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    container.style.background = (mapDark ? DarkColors : LightColors).mapBackground;
    tilesRef.current?.remove();
    const fallback = () => L.tileLayer(TILES.fallback, { maxZoom: 19, attribution: OSM_COPYRIGHT });
    if (!MAPTILER_KEY) {
      tilesRef.current = fallback().addTo(map);
      return;
    }
    const url = (mapDark ? TILES.dark : TILES.light) + encodeURIComponent(MAPTILER_KEY);
    const primary = L.tileLayer(url, { maxZoom: 19, attribution: TILES.attribution });
    let loaded = 0;
    let failed = 0;
    primary.on('tileload', () => loaded++);
    primary.on('tileerror', () => {
      failed++;
      if (tilesRef.current !== primary) return;
      if ((failed >= 3 && loaded === 0) || (failed >= 10 && failed > loaded)) {
        console.warn('[carte] Tuiles MapTiler indisponibles : repli sur OpenStreetMap');
        primary.remove();
        tilesRef.current = fallback().addTo(map);
      }
    });
    tilesRef.current = primary.addTo(map);
  }, [mapDark]);

  // Ma position : point bleu (et halo de précision) ; la carte la suit si demandé
  const lat = position?.latitude;
  const lng = position?.longitude;
  const accuracy = position?.accuracy ?? 0;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat == null || lng == null) {
      meRef.current?.marker.remove();
      meRef.current?.halo.remove();
      meRef.current = null;
      return;
    }
    const ll = L.latLng(lat, lng);
    if (!meRef.current) {
      meRef.current = {
        halo: L.circle(ll, {
          radius: accuracy,
          stroke: false,
          fillColor: colors.me,
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(map),
        marker: L.marker(ll, { icon: meIcon(colors), interactive: false, keyboard: false, zIndexOffset: 3000 }).addTo(
          map,
        ),
      };
    } else {
      meRef.current.marker.setLatLng(ll);
      meRef.current.halo.setLatLng(ll).setRadius(accuracy);
    }
    if (!centeredRef.current) {
      map.setView(ll, 13, { animate: false });
      centeredRef.current = true;
    } else if (follow) {
      map.panTo(ll);
    }
  }, [lat, lng, accuracy, follow, colors]);

  // Pastilles des motards
  const markersJson = JSON.stringify(markers);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const list = JSON.parse(markersJson) as MapMarker[];
    const existing = markersRef.current;
    const seen = new Set<string>();
    for (const m of list) {
      seen.add(m.id);
      const selected = m.id === selectedMarkerId;
      const marker = existing.get(m.id);
      if (marker) {
        marker.setLatLng([m.latitude, m.longitude]);
        marker.setIcon(personIcon(m, selected));
        marker.setZIndexOffset(selected ? 1000 : 0);
      } else {
        const created = L.marker([m.latitude, m.longitude], {
          icon: personIcon(m, selected),
          zIndexOffset: selected ? 1000 : 0,
        })
          .on('click', () => handlers.current.onMarkerPress?.(m.id))
          .addTo(map);
        existing.set(m.id, created);
      }
    }
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
    onMarkersRendered?.(existing.size);
    // onMarkersRendered : diagnostic, pas besoin de redessiner quand il change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersJson, selectedMarkerId]);

  // Repères : RDV, départ/arrivée, signalements, point posé
  const pinsJson = JSON.stringify(pins);
  useEffect(() => {
    const group = pinsRef.current;
    if (!group) return;
    group.clearLayers();
    for (const p of JSON.parse(pinsJson) as MapPin[]) {
      L.marker([p.latitude, p.longitude], { icon: pinIcon(p), zIndexOffset: p.kind === 'dropped' ? 2000 : 500 })
        .on('click', () => handlers.current.onPinPress?.(p.id))
        .addTo(group);
    }
  }, [pinsJson]);

  // Tracés : alternatives d'abord, l'itinéraire choisi par-dessus
  const routesJson = JSON.stringify(routes);
  useEffect(() => {
    const group = routesRef.current;
    if (!group) return;
    group.clearLayers();
    const list = JSON.parse(routesJson) as NonNullable<MapProps['routes']>;
    for (const r of [...list.filter((x) => x.muted), ...list.filter((x) => !x.muted)]) {
      L.polyline(r.points, { color: colors.white, weight: r.muted ? 6 : 8, opacity: 0.9, interactive: false }).addTo(
        group,
      );
      L.polyline(r.points, {
        color: r.color || colors.accent,
        weight: r.muted ? 4 : 5,
        opacity: r.muted ? 0.8 : 0.95,
        interactive: false,
      }).addTo(group);
    }
  }, [routesJson, colors]);

  // Cadrage sur des points (tracé d'une balade, aperçu)
  const fitJson = fitPoints ? JSON.stringify(fitPoints.map((p) => [p.latitude, p.longitude])) : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitJson) return;
    const points = JSON.parse(fitJson) as [number, number][];
    if (!points.length) return;
    centeredRef.current = true;
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15, animate: false });
  }, [fitJson]);

  return <View ref={containerRef} style={[StyleSheet.absoluteFill, styles.map]} />;
}

const styles = StyleSheet.create({
  // Les contrôles Leaflet (zoom, attribution) restent sous les fiches de l'écran
  map: { zIndex: 0 },
});
