import { forwardRef } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { MAP_BASE_URL, type MapFrameHandle, type MapFrameProps } from '@/components/map-frame-types';

// Page de carte HTML (Leaflet ou MapLibre) dans une WebView. Variante web : map-frame.web.tsx (iframe),
// pour l'aperçu de l'écran de navigation et les captures.

export const MapFrame = forwardRef<MapFrameHandle, MapFrameProps>(function MapFrame(
  { html, onMessage },
  ref,
) {
  return (
    <WebView
      ref={ref as never}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: MAP_BASE_URL }}
      onMessage={(event: WebViewMessageEvent) => onMessage(event.nativeEvent.data)}
      // Le bip de dépassement de vitesse doit pouvoir sonner sans toucher la carte
      mediaPlaybackRequiresUserAction={false}
      // Android : pas de zoom de page de la WebView (activé par défaut) en concurrence avec le
      // pincement de la carte ; seule la carte zoome
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      scalesPageToFit={false}
      // Les liens (attribution OSM) s'ouvrent dans le navigateur, pas dans la carte
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === MAP_BASE_URL || req.url.startsWith('about:')) return true;
        Linking.openURL(req.url);
        return false;
      }}
    />
  );
});
