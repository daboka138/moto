import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

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

type Props = {
  position: MapPosition | null;
  follow: boolean;
  onUserPan: () => void;
  markers?: MapMarker[];
  selectedMarkerId?: string | null;
  onMarkerPress?: (id: string) => void;
  onMapPress?: () => void;
  /** Nombre de pastilles réellement affichées dans la page (diagnostic) */
  onMarkersRendered?: (count: number) => void;
};

type WebMessage =
  | { type: 'ready' }
  | { type: 'pan' }
  | { type: 'mapPress' }
  | { type: 'marker'; id: string }
  | { type: 'markers'; count: number }
  | { type: 'error'; message: string };

const BASE_URL = 'https://localhost/';

// Tuiles OSM : OK pour le dev, à remplacer par un fournisseur avec clé avant la prod
// (la politique d'usage des tuiles OSM interdit le trafic d'une vraie app).
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: #e5e3df; }
  .person-wrap { background: none; border: none; transition: transform 1s linear; }
  .zooming .person-wrap { transition: none; }
  .person {
    width: 38px; height: 38px; border-radius: 50%; overflow: hidden; background: #fff;
    border: 3px solid #F97316; box-shadow: 0 2px 6px rgba(0,0,0,.35);
    transition: transform .2s, border-color .3s;
  }
  .person img { width: 100%; height: 100%; display: block; }
  .person.muted { border-color: #A1A1AA; }
  .person.alert { border-color: #DC2626; box-shadow: 0 0 0 3px rgba(220,38,38,.35), 0 2px 6px rgba(0,0,0,.35); }
  .person.selected { transform: scale(1.25); }
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
<script>
  if (!window.L) post({ type: 'error', message: 'Leaflet non chargé (réseau ?)' });

  var map = L.map('map', { zoomControl: false }).setView([46.6, 2.4], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  map.on('dragstart', function () { post({ type: 'pan' }); });
  map.on('click', function () { post({ type: 'mapPress' }); });
  // Pas d'animation de déplacement des pastilles pendant un zoom
  map.on('zoomstart', function () { map.getContainer().classList.add('zooming'); });
  map.on('zoomend', function () {
    setTimeout(function () { map.getContainer().classList.remove('zooming'); }, 50);
  });

  var dot = null, halo = null, centered = false;

  window.setPosition = function (p, follow) {
    var ll = [p.latitude, p.longitude];
    var radius = p.accuracy || 0;
    if (!dot) {
      halo = L.circle(ll, { radius: radius, stroke: false, fillColor: '#208AEF', fillOpacity: 0.15, interactive: false }).addTo(map);
      dot = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#208AEF', fillOpacity: 1, interactive: false }).addTo(map);
    } else {
      dot.setLatLng(ll);
      halo.setLatLng(ll).setRadius(radius);
    }
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

  post({ type: 'ready' });
</script>
</body>
</html>`;

export function LeafletMap({
  position,
  follow,
  onUserPan,
  markers = [],
  selectedMarkerId = null,
  onMarkerPress,
  onMapPress,
  onMarkersRendered,
}: Props) {
  const webRef = useRef<WebView>(null);
  // Incrémenté à chaque chargement de la page : après un rechargement, tout l'état est renvoyé
  const [pageLoads, setPageLoads] = useState(0);

  useEffect(() => {
    if (!pageLoads || !position) return;
    webRef.current?.injectJavaScript(
      `window.setPosition && window.setPosition(${JSON.stringify(position)}, ${follow}); true;`,
    );
  }, [pageLoads, position, follow]);

  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(
      `window.setMarkers && window.setMarkers(${JSON.stringify(markers)}, ${JSON.stringify(selectedMarkerId ?? null)}); true;`,
    );
  }, [pageLoads, markers, selectedMarkerId]);

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: WebMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') setPageLoads((n) => n + 1);
    else if (msg.type === 'pan') onUserPan();
    else if (msg.type === 'mapPress') onMapPress?.();
    else if (msg.type === 'marker') onMarkerPress?.(msg.id);
    else if (msg.type === 'markers') onMarkersRendered?.(msg.count);
    else if (msg.type === 'error') console.warn('[carte]', msg.message);
  };

  return (
    <WebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html: HTML, baseUrl: BASE_URL }}
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
