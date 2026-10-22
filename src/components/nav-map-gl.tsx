import { useEffect, useMemo, useRef, useState } from 'react';

import { MapFrame } from '@/components/map-frame';
import type { MapFrameHandle } from '@/components/map-frame-types';
import type { MapProps } from '@/components/map-types';
import { buildNavGlHtml } from '@/components/nav-map-gl-html';
import { useTheme } from '@/constants/theme';
import { useMapDark } from '@/lib/use-map-dark';

type WebMessage =
  | { type: 'ready'; gl?: { version: number; renderer: string } | null }
  | { type: 'painted' }
  | { type: 'fallback'; reason: string }
  | { type: 'pan' }
  | { type: 'bearing'; value: number }
  | { type: 'mapPress'; latitude: number; longitude: number }
  | { type: 'marker'; id: string }
  | { type: 'pin'; id: string }
  | { type: 'markers'; count: number }
  | { type: 'view'; latitude: number; longitude: number; zoom: number }
  | { type: 'error'; message: string };

export type NavGlInfo = { version: number; renderer: string } | null;

/**
 * Carte de navigation en vue inclinée (MapLibre GL dans une WebView), posée par-dessus la carte
 * Leaflet. Mêmes props que LeafletMap ; onFallback = 3D impossible (pas de WebGL, MapLibre ou style
 * non chargé…) : l'app retire cette carte et garde Leaflet.
 */
export function NavMapGL({
  position,
  navigating = true,
  follow = false,
  onUserPan,
  onBearingChange,
  northUpKey = 0,
  markers = [],
  pins = [],
  onPinPress,
  routes = [],
  selectedMarkerId = null,
  onMarkerPress,
  onMapPress,
  onViewChange,
  orientation = 'heading',
  navZoom,
  overviewKey = 0,
  onPainted,
  onReady,
  onFallback,
}: MapProps & { onReady?: (gl: NavGlInfo) => void; onFallback: (reason: string) => void }) {
  const webRef = useRef<MapFrameHandle>(null);
  const { colors } = useTheme();
  const mapDark = useMapDark(position ?? null);
  const html = useMemo(() => buildNavGlHtml(colors, mapDark), [colors, mapDark]);
  const [pageLoads, setPageLoads] = useState(0);
  const run = (code: string) => webRef.current?.injectJavaScript(`${code}; true;`);

  const heading = position?.heading ?? null;
  const positionJson = position
    ? JSON.stringify({ latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy, heading })
    : null;
  useEffect(() => {
    if (!pageLoads || !positionJson) return;
    run(`window.setPosition && window.setPosition(${positionJson}, ${follow}, ${navigating})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoads, position?.latitude, position?.longitude, position?.accuracy, follow, navigating]);
  useEffect(() => {
    if (pageLoads) run(`window.setHeading && window.setHeading(${JSON.stringify(heading)})`);
  }, [pageLoads, heading]);
  useEffect(() => {
    if (pageLoads && northUpKey) run('window.northUp && window.northUp()');
  }, [pageLoads, northUpKey]);
  useEffect(() => {
    if (pageLoads) run(`window.setOrientation && window.setOrientation(${JSON.stringify(orientation)})`);
  }, [pageLoads, orientation]);
  useEffect(() => {
    if (pageLoads && navZoom) run(`window.setNavZoom && window.setNavZoom(${navZoom})`);
  }, [pageLoads, navZoom]);
  useEffect(() => {
    if (pageLoads && overviewKey) run('window.overview && window.overview()');
  }, [pageLoads, overviewKey]);
  const markersJson = JSON.stringify(markers);
  useEffect(() => {
    if (pageLoads) run(`window.setMarkers && window.setMarkers(${markersJson}, ${JSON.stringify(selectedMarkerId ?? null)})`);
  }, [pageLoads, markersJson, selectedMarkerId]);
  const pinsJson = useMemo(() => JSON.stringify(pins), [pins]);
  const routesJson = useMemo(() => JSON.stringify(routes), [routes]);
  useEffect(() => {
    if (pageLoads) run(`window.setPins && window.setPins(${pinsJson})`);
  }, [pageLoads, pinsJson]);
  useEffect(() => {
    if (pageLoads) run(`window.setRoutes && window.setRoutes(${routesJson})`);
  }, [pageLoads, routesJson]);

  const onMessage = (data: string) => {
    let msg: WebMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      setPageLoads((n) => n + 1);
      onReady?.(msg.gl ?? null);
    } else if (msg.type === 'painted') onPainted?.();
    else if (msg.type === 'fallback') onFallback(msg.reason);
    else if (msg.type === 'pan') onUserPan?.();
    else if (msg.type === 'bearing') onBearingChange?.(msg.value);
    else if (msg.type === 'mapPress') onMapPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'marker') onMarkerPress?.(msg.id);
    else if (msg.type === 'pin') onPinPress?.(msg.id);
    else if (msg.type === 'view') onViewChange?.({ latitude: msg.latitude, longitude: msg.longitude }, msg.zoom);
    else if (msg.type === 'error') console.warn('[carte 3D]', msg.message);
  };

  return <MapFrame ref={webRef} html={html} onMessage={onMessage} />;
}
