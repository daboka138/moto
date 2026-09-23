import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { SIGN_INK, useTheme, type Palette, type SignStyle } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';

export type MapPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

/** Pastille avec photo affichée sur la carte (autres motards). */
export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  photoUrl: string;
  /** default : orange, muted : gris (arrêté), alert : rouge (excès de vitesse) */
  tone?: 'default' | 'muted' | 'alert';
};

/** Repère fixe : départ, arrivée, étape, point de RDV. */
export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  kind: 'start' | 'end' | 'step' | 'meeting' | 'report';
  label: string;
  /** Panneau de signalisation (signalements) : dessiné à la place de la pastille */
  sign?: SignStyle;
};

/** Tracé : [[lat, lng], ...] */
export type MapRoute = { id: string; points: [number, number][]; color?: string };

type Props = {
  position: MapPosition | null;
  /** Mode navigation : carte orientée dans mon sens de marche, zoom rapproché */
  navigation?: { heading: number | null } | null;
  follow?: boolean;
  onUserPan?: () => void;
  markers?: MapMarker[];
  selectedMarkerId?: string | null;
  onMarkerPress?: (id: string) => void;
  onMapPress?: (point: LatLng) => void;
  pins?: MapPin[];
  onPinPress?: (id: string) => void;
  routes?: MapRoute[];
  /** Cadre la carte sur ces points à chaque changement */
  fitPoints?: LatLng[];
  /** Nombre de pastilles réellement affichées dans la page (diagnostic) */
  onMarkersRendered?: (count: number) => void;
};

type WebMessage =
  | { type: 'ready' }
  | { type: 'pan' }
  | { type: 'mapPress'; latitude: number; longitude: number }
  | { type: 'marker'; id: string }
  | { type: 'pin'; id: string }
  | { type: 'markers'; count: number }
  | { type: 'error'; message: string };

const BASE_URL = 'https://localhost/';

// Tuiles : OSM en clair, CARTO Dark Matter en sombre. OK pour le dev, à remplacer par un
// fournisseur avec contrat avant la prod (usage limité sur ces serveurs publics).
const TILES = {
  light: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

/** Page de la carte, aux couleurs du thème actif. */
function buildHtml(Colors: Palette, dark: boolean) {
  const tiles = dark ? TILES.dark : TILES.light;
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${Colors.mapBackground}; }
  .person-wrap { background: none; border: none; transition: transform 1s linear; }
  .zooming .person-wrap { transition: none; }
  .person {
    width: 38px; height: 38px; border-radius: 50%; overflow: hidden; background: ${Colors.white};
    border: 3px solid ${Colors.accent}; box-shadow: 0 2px 6px ${Colors.markerShadow};
    transition: transform .2s, border-color .3s;
  }
  .person img { width: 100%; height: 100%; display: block; }
  .person.muted { border-color: ${Colors.textFaint}; }
  .person.alert { border-color: ${Colors.danger}; box-shadow: 0 0 0 3px ${Colors.dangerHalo}, 0 2px 6px ${Colors.markerShadow}; }
  .person.selected { transform: scale(1.25); }
  .pin-wrap { background: none; border: none; }
  .pin {
    min-width: 28px; height: 28px; padding: 0 6px; box-sizing: border-box; border-radius: 14px;
    border: 2px solid ${Colors.white}; color: ${Colors.white}; font: 700 12px sans-serif;
    display: flex; align-items: center; justify-content: center; white-space: nowrap;
    box-shadow: 0 2px 6px ${Colors.markerShadow};
  }
  .pin.start { background: ${Colors.success}; } .pin.end { background: ${Colors.danger}; }
  .pin.step { background: ${Colors.neutral}; } .pin.meeting { background: ${Colors.accent}; }
  .pin.report {
    background: ${Colors.white}; border: 3px solid ${Colors.danger}; color: ${Colors.text}; font-size: 18px;
    min-width: 36px; height: 36px; border-radius: 18px; padding: 0;
  }
  .sign-wrap { background: none; border: none; }
  .sign svg { width: 46px; height: 46px; display: block; overflow: visible;
    filter: drop-shadow(0 2px 3px ${Colors.markerShadow}); }
  .leaflet-control-attribution { background: ${Colors.surface}cc !important; color: ${Colors.textMuted}; }
  .leaflet-control-attribution a { color: ${Colors.accent}; }
  .arrow-wrap { background: none; border: none; }
  .arrow svg { width: 40px; height: 40px; display: block; filter: drop-shadow(0 2px 3px ${Colors.markerShadow}); }
</style>
</head>
<body>
<div id="map"></div>
<script>
  function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  // Remonte les erreurs JS de la page dans les logs de l'app
  window.onerror = function (message, source, line) {
    post({ type: 'error', message: String(message) + ' (' + source + ':' + line + ')' });
  };
</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<!-- Rotation de la carte en navigation (le contenu tourne dans le sens horaire de "bearing") -->
<script src="https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js"></script>
<script>
  if (!window.L) post({ type: 'error', message: 'Leaflet non chargé (réseau ?)' });

  var map = L.map('map', {
    zoomControl: false,
    rotate: true,
    rotateControl: false,
    touchRotate: false,
    shiftKeyRotate: false,
    bearing: 0
  }).setView([46.6, 2.4], 6);
  function mapBearing() { return map.getBearing ? map.getBearing() : 0; }
  L.tileLayer('${tiles.url}', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '${tiles.attribution}'
  }).addTo(map);
  map.on('dragstart', function () { post({ type: 'pan' }); });
  map.on('click', function (e) { post({ type: 'mapPress', latitude: e.latlng.lat, longitude: e.latlng.lng }); });
  // Pas d'animation de déplacement des pastilles pendant un zoom
  map.on('zoomstart', function () { map.getContainer().classList.add('zooming'); });
  map.on('zoomend', function () {
    setTimeout(function () { map.getContainer().classList.remove('zooming'); }, 50);
  });

  var dot = null, halo = null, arrow = null, centered = false;

  function arrowIcon() {
    var el = document.createElement('div');
    el.className = 'arrow';
    el.innerHTML = '<svg viewBox="0 0 40 40"><path d="M20 3 L34 35 L20 27 L6 35 Z" fill="${Colors.me}" stroke="${Colors.white}" stroke-width="3" stroke-linejoin="round"/></svg>';
    return L.divIcon({ className: 'arrow-wrap', html: el, iconSize: [40, 40], iconAnchor: [20, 20] });
  }

  window.setPosition = function (p, follow, nav) {
    var ll = [p.latitude, p.longitude];
    var radius = p.accuracy || 0;
    if (!dot) {
      halo = L.circle(ll, { radius: radius, stroke: false, fillColor: '${Colors.me}', fillOpacity: 0.15, interactive: false }).addTo(map);
      dot = L.circleMarker(ll, { radius: 8, color: '${Colors.white}', weight: 3, fillColor: '${Colors.me}', fillOpacity: 1, interactive: false }).addTo(map);
    } else {
      dot.setLatLng(ll);
      halo.setLatLng(ll).setRadius(radius);
    }

    // Navigation : flèche dans mon sens de marche, carte tournée pour que ma direction soit en haut
    if (nav) {
      var heading = nav.heading;
      if (heading !== null && map.setBearing) map.setBearing(-heading);
      if (!arrow) arrow = L.marker(ll, { icon: arrowIcon(), interactive: false, zIndexOffset: 3000 }).addTo(map);
      else arrow.setLatLng(ll);
      var el = arrow.getElement();
      if (el && el.firstChild) el.firstChild.style.transform = 'rotate(' + ((heading || 0) + mapBearing()) + 'deg)';
      dot.setStyle({ opacity: 0, fillOpacity: 0 });
      halo.setStyle({ fillOpacity: 0 });
      map.setView(ll, 17, { animate: true, duration: 0.8 });
      centered = true;
      return;
    }
    if (arrow) { map.removeLayer(arrow); arrow = null; }
    dot.setStyle({ opacity: 1, fillOpacity: 1 });
    halo.setStyle({ fillOpacity: 0.15 });
    if (mapBearing() !== 0 && map.setBearing) map.setBearing(0);

    if (!centered) {
      map.setView(ll, 13, { animate: false });
      centered = true;
    } else if (follow) {
      map.panTo(ll, { animate: true, duration: 0.5 });
    }
  };

  var markers = {};
  var renderedCount = -1;

  function personIcon(m) {
    var el = document.createElement('div');
    el.className = 'person';
    var img = document.createElement('img');
    img.src = m.photoUrl;
    el.appendChild(img);
    return L.divIcon({ className: 'person-wrap', html: el, iconSize: [44, 44], iconAnchor: [22, 22] });
  }

  window.setMarkers = function (list, selectedId) {
    var seen = {};
    list.forEach(function (m) {
      seen[m.id] = true;
      var marker = markers[m.id];
      if (!marker) {
        marker = L.marker([m.latitude, m.longitude], { icon: personIcon(m) }).addTo(map);
        marker.on('click', function () { post({ type: 'marker', id: m.id }); });
        markers[m.id] = marker;
      } else {
        marker.setLatLng([m.latitude, m.longitude]);
      }
      var el = marker.getElement();
      if (el && el.firstChild) {
        var cls = 'person' + (m.tone && m.tone !== 'default' ? ' ' + m.tone : '') + (m.id === selectedId ? ' selected' : '');
        if (el.firstChild.className !== cls) el.firstChild.className = cls;
        marker.setZIndexOffset(m.id === selectedId ? 1000 : 0);
      }
    });
    Object.keys(markers).forEach(function (id) {
      if (!seen[id]) { map.removeLayer(markers[id]); delete markers[id]; }
    });
    var count = document.querySelectorAll('.person').length;
    if (count !== renderedCount) { renderedCount = count; post({ type: 'markers', count: count }); }
  };

  var pins = {};
  window.setPins = function (list) {
    Object.keys(pins).forEach(function (id) { map.removeLayer(pins[id]); });
    pins = {};
    list.forEach(function (p) {
      var el = document.createElement('div');
      var icon;
      if (p.sign) {
        // Panneau façon signalisation routière : triangle (danger) ou losange (circulation)
        el.className = 'sign';
        var shape = p.sign.shape === 'diamond'
          ? '<path d="M23 2 L44 23 L23 44 L2 23 Z"'
          : '<path d="M23 3 L44 41 L2 41 Z"';
        var y = p.sign.shape === 'diamond' ? 30 : 35;
        var size = p.sign.glyph === '!' ? 24 : 17;
        el.innerHTML = '<svg viewBox="0 0 46 46">' + shape + ' fill="' + p.sign.fill + '" stroke="' + p.sign.stroke +
          '" stroke-width="4" stroke-linejoin="round"/>' +
          '<text x="23" y="' + y + '" font-size="' + size + '" font-weight="900" font-family="sans-serif" text-anchor="middle" fill="${SIGN_INK}">' +
          p.sign.glyph + '</text></svg>';
        icon = L.divIcon({ className: 'sign-wrap', html: el, iconSize: [46, 46], iconAnchor: [23, 41] });
      } else {
        el.className = 'pin ' + p.kind;
        el.textContent = p.label;
        icon = L.divIcon({ className: 'pin-wrap', html: el, iconSize: null, iconAnchor: [14, 14] });
      }
      var marker = L.marker([p.latitude, p.longitude], { icon: icon, zIndexOffset: 500 }).addTo(map);
      marker.on('click', function () { post({ type: 'pin', id: p.id }); });
      pins[p.id] = marker;
    });
  };

  var routeLayer = L.layerGroup().addTo(map);
  window.setRoutes = function (list) {
    routeLayer.clearLayers();
    list.forEach(function (r) {
      L.polyline(r.points, { color: '${Colors.white}', weight: 8, opacity: 0.9 }).addTo(routeLayer);
      L.polyline(r.points, { color: r.color || '${Colors.accent}', weight: 5, opacity: 0.95 }).addTo(routeLayer);
    });
  };

  window.fitTo = function (points) {
    if (!points.length) return;
    centered = true;
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15, animate: false });
  };

  post({ type: 'ready' });
</script>
</body>
</html>`;
}

export function LeafletMap({
  position,
  navigation = null,
  follow = false,
  onUserPan,
  markers = [],
  pins = [],
  onPinPress,
  routes = [],
  fitPoints,
  selectedMarkerId = null,
  onMarkerPress,
  onMapPress,
  onMarkersRendered,
}: Props) {
  const webRef = useRef<WebView>(null);
  const { colors, scheme } = useTheme();
  // Changer de thème recharge la page (l'état est renvoyé au « ready » suivant)
  const html = useMemo(() => buildHtml(colors, scheme === 'dark'), [colors, scheme]);
  // Incrémenté à chaque chargement de la page : après un rechargement, tout l'état est renvoyé
  const [pageLoads, setPageLoads] = useState(0);

  useEffect(() => {
    if (!pageLoads || !position) return;
    webRef.current?.injectJavaScript(
      `window.setPosition && window.setPosition(${JSON.stringify(position)}, ${follow}, ${JSON.stringify(navigation)}); true;`,
    );
  }, [pageLoads, position, follow, navigation]);

  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(
      `window.setMarkers && window.setMarkers(${JSON.stringify(markers)}, ${JSON.stringify(selectedMarkerId ?? null)}); true;`,
    );
  }, [pageLoads, markers, selectedMarkerId]);

  // Les tracés peuvent être gros : on ne les renvoie que s'ils ont changé
  const pinsJson = JSON.stringify(pins);
  const routesJson = JSON.stringify(routes);
  const fitJson = fitPoints ? JSON.stringify(fitPoints.map((p) => [p.latitude, p.longitude])) : null;

  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(`window.setPins && window.setPins(${pinsJson}); true;`);
  }, [pageLoads, pinsJson]);

  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(`window.setRoutes && window.setRoutes(${routesJson}); true;`);
  }, [pageLoads, routesJson]);

  useEffect(() => {
    if (!pageLoads || !fitJson) return;
    webRef.current?.injectJavaScript(`window.fitTo && window.fitTo(${fitJson}); true;`);
  }, [pageLoads, fitJson]);

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: WebMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setPageLoads((n) => n + 1);
    else if (msg.type === 'pan') onUserPan?.();
    else if (msg.type === 'mapPress') onMapPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'marker') onMarkerPress?.(msg.id);
    else if (msg.type === 'pin') onPinPress?.(msg.id);
    else if (msg.type === 'markers') onMarkersRendered?.(msg.count);
    else if (msg.type === 'error') console.warn('[carte]', msg.message);
  };

  return (
    <WebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: BASE_URL }}
      onMessage={onMessage}
      // Les liens (attribution OSM) s'ouvrent dans le navigateur, pas dans la carte
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === BASE_URL || req.url.startsWith('about:')) return true;
        Linking.openURL(req.url);
        return false;
      }}
    />
  );
}
