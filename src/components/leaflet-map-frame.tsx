import { useEffect, useMemo, useRef, useState } from 'react';

import { buildLeafletHtml } from '@/components/leaflet-map-html';
import { MapFrame } from '@/components/map-frame';
import type { MapFrameHandle } from '@/components/map-frame-types';
import type { MapProps } from '@/components/map-types';
import { useTheme } from '@/constants/theme';
import { useMapDark } from '@/lib/use-map-dark';

// Carte Leaflet de l'app dans une page HTML (WebView ; iframe sur le web, pour l'aperçu de l'écran de
// navigation). La carte du site web est leaflet-map.web.tsx.

type WebMessage =
  | { type: 'ready' }
  | { type: 'painted' }
  | { type: 'pan' }
  | { type: 'bearing'; value: number }
  | { type: 'mapPress'; latitude: number; longitude: number }
  | { type: 'longPress'; latitude: number; longitude: number }
  | { type: 'marker'; id: string }
  | { type: 'pin'; id: string }
  | { type: 'markers'; count: number }
  | { type: 'beep'; ok: boolean }
  | { type: 'view'; latitude: number; longitude: number; zoom: number }
  | { type: 'error'; message: string };

export function LeafletFrameMap({
  position,
  navigating = false,
  follow = false,
  onUserPan,
  onBearingChange,
  northUpKey = 0,
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
  beepKey = 0,
  onBeepFailed,
  onViewChange,
  defaultView,
  onPainted,
  orientation = 'heading',
  navZoom,
}: MapProps) {
  const webRef = useRef<MapFrameHandle>(null);
  const { colors } = useTheme();
  const mapDark = useMapDark(position ?? null);
  // Changer de thème ou de style de carte recharge la page (l'état est renvoyé au « ready » suivant)
  const html = useMemo(() => buildLeafletHtml(colors, mapDark), [colors, mapDark]);
  // Incrémenté à chaque chargement de la page : après un rechargement, tout l'état est renvoyé
  const [pageLoads, setPageLoads] = useState(0);

  // Position et cap envoyés séparément : la boussole change souvent, sans nouvelle position GPS
  const heading = position?.heading ?? null;
  const positionJson = position
    ? JSON.stringify({ latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy, heading })
    : null;

  useEffect(() => {
    if (!pageLoads || !positionJson) return;
    webRef.current?.injectJavaScript(`window.setPosition && window.setPosition(${positionJson}, ${follow}, ${navigating}); true;`);
    // Le cap est dans positionJson au moment de l'envoi ; ses changements seuls passent par setHeading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoads, position?.latitude, position?.longitude, position?.accuracy, follow, navigating]);

  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(`window.setHeading && window.setHeading(${JSON.stringify(heading)}); true;`);
  }, [pageLoads, heading]);

  const dvLat = defaultView?.latitude;
  const dvLng = defaultView?.longitude;
  const dvZoom = defaultView?.zoom;
  useEffect(() => {
    if (!pageLoads || dvLat == null || dvLng == null) return;
    const v = JSON.stringify({ latitude: dvLat, longitude: dvLng, zoom: dvZoom ?? 13 });
    webRef.current?.injectJavaScript(`window.setDefaultView && window.setDefaultView(${v}); true;`);
  }, [pageLoads, dvLat, dvLng, dvZoom]);

  useEffect(() => {
    if (!pageLoads || !northUpKey) return;
    webRef.current?.injectJavaScript(`window.northUp && window.northUp(); true;`);
  }, [pageLoads, northUpKey]);

  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(`window.setOrientation && window.setOrientation(${JSON.stringify(orientation)}); true;`);
  }, [pageLoads, orientation]);

  useEffect(() => {
    if (!pageLoads || !navZoom) return;
    webRef.current?.injectJavaScript(`window.setNavZoom && window.setNavZoom(${navZoom}); true;`);
  }, [pageLoads, navZoom]);

  const markersJson = JSON.stringify(markers);
  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(
      `window.setMarkers && window.setMarkers(${markersJson}, ${JSON.stringify(selectedMarkerId ?? null)}); true;`,
    );
  }, [pageLoads, markersJson, selectedMarkerId]);

  // Les tracés peuvent être gros : on ne les renvoie que s'ils ont changé
  // Sérialisés seulement quand la liste change (la carte se redessine à chaque position GPS)
  const pinsJson = useMemo(() => JSON.stringify(pins), [pins]);
  const routesJson = useMemo(() => JSON.stringify(routes), [routes]);
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

  useEffect(() => {
    if (!pageLoads || !beepKey) return;
    webRef.current?.injectJavaScript(`window.beep && window.beep(); true;`);
  }, [pageLoads, beepKey]);

  const onMessage = (data: string) => {
    let msg: WebMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      setPageLoads((n) => n + 1);
      onBearingChange?.(0);
    } else if (msg.type === 'painted') onPainted?.();
    else if (msg.type === 'pan') onUserPan?.();
    else if (msg.type === 'bearing') onBearingChange?.(msg.value);
    else if (msg.type === 'mapPress') onMapPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'longPress') onMapLongPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'marker') onMarkerPress?.(msg.id);
    else if (msg.type === 'pin') onPinPress?.(msg.id);
    else if (msg.type === 'markers') onMarkersRendered?.(msg.count);
    else if (msg.type === 'beep' && !msg.ok) onBeepFailed?.();
    else if (msg.type === 'view') onViewChange?.({ latitude: msg.latitude, longitude: msg.longitude }, msg.zoom);
    else if (msg.type === 'error') console.warn('[carte]', msg.message);
  };

  return <MapFrame ref={webRef} html={html} onMessage={onMessage} />;
}
