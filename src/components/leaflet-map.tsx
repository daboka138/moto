import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type MapPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type Props = {
  position: MapPosition | null;
  follow: boolean;
  onUserPan: () => void;
};

const BASE_URL = 'https://localhost/';

// Tuiles OSM : OK pour le dev, à remplacer par un fournisseur avec clé avant la prod
// (la politique d'usage des tuiles OSM interdit le trafic d'une vraie app).
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html, body, #map { margin: 0; height: 100%; background: #e5e3df; }</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  function post(msg) { window.ReactNativeWebView.postMessage(msg); }

  var map = L.map('map', { zoomControl: false }).setView([46.6, 2.4], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  map.on('dragstart', function () { post('pan'); });

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
      map.setView(ll, 16, { animate: false });
      centered = true;
    } else if (follow) {
      map.panTo(ll, { animate: true, duration: 0.5 });
    }
  };

  post('ready');
</script>
</body>
</html>`;

export function LeafletMap({ position, follow, onUserPan }: Props) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !position) return;
    webRef.current?.injectJavaScript(`window.setPosition(${JSON.stringify(position)}, ${follow}); true;`);
  }, [ready, position, follow]);

  const onMessage = (event: WebViewMessageEvent) => {
    const msg = event.nativeEvent.data;
    if (msg === 'ready') setReady(true);
    else if (msg === 'pan') onUserPan();
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
