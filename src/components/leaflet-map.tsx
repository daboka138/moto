import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { DarkColors, LightColors, SIGN_INK, useTheme, type Palette, type SignStyle } from '@/constants/theme';
import type { LatLng } from '@/lib/geo';
import { useMapDark } from '@/lib/use-map-dark';

export type MapPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  /** Cap en degrés (0 = nord) : GPS en mouvement, boussole à l'arrêt. null = inconnu (rond au lieu de la flèche) */
  heading?: number | null;
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

/** Repère fixe : départ, arrivée, étape, point de RDV, point posé par appui long. */
export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  kind: 'start' | 'end' | 'step' | 'meeting' | 'report' | 'dropped';
  label: string;
  /** Panneau de signalisation (signalements) : dessiné à la place de la pastille */
  sign?: SignStyle;
};

/** Tracé : [[lat, lng], ...]. muted : itinéraire alternatif, plus fin et dessous */
export type MapRoute = { id: string; points: [number, number][]; color?: string; muted?: boolean };

type Props = {
  position: MapPosition | null;
  /** Mode navigation : carte orientée dans mon sens de marche, flèche en bas de l'écran, zoom rapproché */
  navigating?: boolean;
  /** La carte suit ma position (et, en navigation, mon cap). Coupé par un glissement ou une rotation au doigt */
  follow?: boolean;
  /** L'utilisateur a déplacé ou tourné la carte */
  onUserPan?: () => void;
  /** Orientation de la carte en degrés (0 = nord en haut), envoyée quand elle change */
  onBearingChange?: (bearing: number) => void;
  /** Incrémenter pour remettre le nord en haut (bouton boussole) */
  northUpKey?: number;
  markers?: MapMarker[];
  selectedMarkerId?: string | null;
  onMarkerPress?: (id: string) => void;
  onMapPress?: (point: LatLng) => void;
  /** Appui long sur la carte (comme Google Maps) */
  onMapLongPress?: (point: LatLng) => void;
  pins?: MapPin[];
  onPinPress?: (id: string) => void;
  routes?: MapRoute[];
  /** Cadre la carte sur ces points à chaque changement */
  fitPoints?: LatLng[];
  /** Nombre de pastilles réellement affichées dans la page (diagnostic) */
  onMarkersRendered?: (count: number) => void;
  /** Incrémenter pour jouer un petit bip (dépassement de vitesse) */
  beepKey?: number;
  /** Le bip n'a pas pu être joué (son bloqué par la page) */
  onBeepFailed?: () => void;
};

type WebMessage =
  | { type: 'ready' }
  | { type: 'pan' }
  | { type: 'bearing'; value: number }
  | { type: 'mapPress'; latitude: number; longitude: number }
  | { type: 'longPress'; latitude: number; longitude: number }
  | { type: 'marker'; id: string }
  | { type: 'pin'; id: string }
  | { type: 'markers'; count: number }
  | { type: 'beep'; ok: boolean }
  | { type: 'error'; message: string };

const BASE_URL = 'https://localhost/';

// Tuiles : MapTiler « streets-v2 » (propre et lisible, façon Google Maps), « streets-v2-dark » si le
// style de carte est sombre (réglage séparé du thème de l'app). Clé : EXPO_PUBLIC_MAPTILER_KEY (.env
// en local, variables EAS preview/production). Sans clé ou si MapTiler refuse les tuiles (quota, clé
// invalide…), la page repasse sur les tuiles OpenStreetMap standard.
const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '';
const OSM_COPYRIGHT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const TILES = {
  light: 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}{r}.png?key=',
  dark: 'https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}{r}.png?key=',
  attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + OSM_COPYRIGHT,
  fallback: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

/** Page de la carte : marqueurs aux couleurs du thème, tuiles selon le style de carte. */
function buildHtml(Colors: Palette, dark: boolean) {
  const tilesUrl = MAPTILER_KEY ? (dark ? TILES.dark : TILES.light) + encodeURIComponent(MAPTILER_KEY) : '';
  // Fond pendant le chargement des tuiles : celui du style de carte, pas du thème
  Colors = { ...Colors, mapBackground: dark ? DarkColors.mapBackground : LightColors.mapBackground };
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${Colors.mapBackground}; }
  /* Appui long : pas de sélection de texte ni de menu du navigateur */
  body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .person-wrap { background: none; border: none; transition: transform 1s linear; }
  .zooming .person-wrap, .rotating .person-wrap { transition: none; }
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
  /* Point posé par appui long : goutte façon Google Maps, pointe sur le lieu */
  .drop {
    width: 26px; height: 26px; box-sizing: border-box; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
    background: ${Colors.danger}; border: 3px solid ${Colors.white}; box-shadow: 0 2px 6px ${Colors.markerShadow};
  }
  .sign-wrap { background: none; border: none; }
  .sign svg { width: 46px; height: 46px; display: block; overflow: visible;
    filter: drop-shadow(0 2px 3px ${Colors.markerShadow}); }
  .leaflet-control-attribution { background: ${Colors.surface}cc !important; color: ${Colors.textMuted}; }
  .leaflet-control-attribution a { color: ${Colors.accent}; }
  /* Ma position : flèche pointée dans ma direction, rond si le cap est inconnu */
  .me-wrap { background: none; border: none; }
  .me { width: 40px; height: 40px; }
  .me svg { width: 40px; height: 40px; display: block; filter: drop-shadow(0 2px 3px ${Colors.markerShadow}); }
  .me .dot { display: none; }
  .me.nohead .arrow { display: none; }
  .me.nohead .dot { display: block; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  function post(msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
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
    touchRotate: true,
    shiftKeyRotate: false,
    bearing: 0
  }).setView([46.6, 2.4], 6);
  function mapBearing() { return map.getBearing ? map.getBearing() : 0; }
  /** Écart d'angle le plus court, entre -180 et 180 */
  function angleDelta(from, to) { return ((to - from + 540) % 360) - 180; }
  // Fond MapTiler, avec repli sur OpenStreetMap si les tuiles sont refusées
  var fallenBack = false, primary = null;
  function useFallbackTiles(reason) {
    if (fallenBack) return;
    fallenBack = true;
    if (primary) map.removeLayer(primary);
    L.tileLayer('${TILES.fallback}', { maxZoom: 19, attribution: '${OSM_COPYRIGHT}' }).addTo(map);
    post({ type: 'error', message: 'Tuiles MapTiler indisponibles (' + reason + ') : repli sur OpenStreetMap' });
  }
  if ('${tilesUrl}') {
    var loaded = 0, failed = 0;
    primary = L.tileLayer('${tilesUrl}', { maxZoom: 19, attribution: '${TILES.attribution}' });
    primary.on('tileload', function () { loaded++; });
    primary.on('tileerror', function () {
      failed++;
      // Aucune tuile reçue, ou beaucoup plus d'échecs que de réussites : MapTiler ne répond pas
      if ((failed >= 3 && loaded === 0) || (failed >= 10 && failed > loaded)) useFallbackTiles('erreurs de chargement');
    });
    primary.addTo(map);
  } else {
    useFallbackTiles('clé absente');
  }

  var container = map.getContainer();
  var lastDragAt = 0;
  // Glisser ou tourner la carte au doigt coupe le suivi tout de suite (l'app affiche « Recentrer »)
  function userMoved() {
    lastDragAt = Date.now();
    me.follow = false;
    resetNorth = false;
    post({ type: 'pan' });
  }
  map.on('dragstart', userMoved);

  // Rotation à deux doigts (leaflet-rotate) avec un seuil de 15°, comme Google Maps :
  // un simple pincement pour zoomer ne fait pas tourner la carte.
  var ROTATE_THRESHOLD_DEG = 15;
  var gesture = null;
  var rawSetBearing = map.setBearing;
  if (rawSetBearing && map.touchGestures) {
    var tg = map.touchGestures;
    var rawStart = tg._onTouchStart, rawMove = tg._onTouchMove;
    tg.disable();
    tg._onTouchStart = function (e) {
      gesture = { start: mapBearing(), offset: null, moving: false };
      rawStart.call(this, e);
    };
    tg._onTouchMove = function (e) {
      if (gesture) gesture.moving = true;
      rawMove.call(this, e);
      if (gesture) gesture.moving = false;
    };
    tg.enable();
    map.setBearing = function (theta) {
      if (!gesture || !gesture.moving) return rawSetBearing.call(map, theta);
      if (gesture.offset === null) {
        var turned = angleDelta(gesture.start, theta);
        if (Math.abs(turned) < ROTATE_THRESHOLD_DEG) return;
        gesture.offset = turned;
        userMoved();
      }
      rawSetBearing.call(map, theta - gesture.offset);
    };
  }

  // Orientation envoyée à l'app (boussole) : au plus toutes les 200 ms, et seulement si elle a
  // bougé de 4° ou plus (ou vient de revenir au nord) pour ne pas redessiner l'écran en continu
  var sentBearing = 0, bearingTimer = null;
  map.on('rotate', function () {
    if (bearingTimer) return;
    bearingTimer = setTimeout(function () {
      bearingTimer = null;
      var b = Math.round(mapBearing()) % 360;
      if (b === sentBearing) return;
      if (b === 0 || Math.abs(angleDelta(sentBearing, b)) >= 4) { sentBearing = b; post({ type: 'bearing', value: b }); }
    }, 200);
  });

  // Appui et appui long détectés à la main : le « click » de Leaflet est annulé dès que le doigt
  // bouge de 3 px (vu comme un glissement), ce qui arrive sur la plupart des appuis au doigt.
  var LONG_PRESS_MS = 550;
  var tap = null, longTimer = null, pointers = 0;
  function cancelLong() { if (longTimer) { clearTimeout(longTimer); longTimer = null; } }
  function latLngAt(x, y) {
    var rect = container.getBoundingClientRect();
    return map.containerPointToLatLng(L.point(x - rect.left, y - rect.top));
  }
  container.addEventListener('pointerdown', function (e) {
    // Premier doigt : repart de zéro (un relâchement perdu ne bloque pas le compteur)
    pointers = e.isPrimary ? 1 : pointers + 1;
    cancelLong();
    var onItem = e.target.closest && e.target.closest('.leaflet-marker-icon, .leaflet-control');
    // Deux doigts (zoom) : ni appui ni appui long
    tap = e.isPrimary && !onItem && pointers === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() } : null;
    if (!tap) return;
    var start = tap;
    longTimer = setTimeout(function () {
      longTimer = null;
      if (tap !== start) return;
      tap = null; // le relâchement ne compte pas comme un appui
      var ll = latLngAt(start.x, start.y);
      post({ type: 'longPress', latitude: ll.lat, longitude: ll.lng });
    }, LONG_PRESS_MS);
  }, true);
  container.addEventListener('pointermove', function (e) {
    if (tap && e.pointerId === tap.id && Math.abs(e.clientX - tap.x) + Math.abs(e.clientY - tap.y) > 16) cancelLong();
  }, true);
  container.addEventListener('pointerup', function (e) {
    pointers = Math.max(0, pointers - 1);
    cancelLong();
    var t = tap;
    tap = null;
    if (!t || e.pointerId !== t.id) return;
    if (Math.abs(e.clientX - t.x) + Math.abs(e.clientY - t.y) > 16 || Date.now() - t.t > 700) return;
    var ll = latLngAt(e.clientX, e.clientY);
    post({ type: 'mapPress', latitude: ll.lat, longitude: ll.lng });
  }, true);
  container.addEventListener('pointercancel', function () { pointers = Math.max(0, pointers - 1); cancelLong(); tap = null; }, true);
  container.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);

  // Pas d'animation de déplacement des pastilles pendant un zoom ou une rotation
  map.on('zoomstart', function () { container.classList.add('zooming'); });
  map.on('zoomend', function () {
    setTimeout(function () { container.classList.remove('zooming'); }, 50);
  });
  var rotatingTimer = null;
  function markRotating() {
    container.classList.add('rotating');
    clearTimeout(rotatingTimer);
    rotatingTimer = setTimeout(function () { container.classList.remove('rotating'); }, 300);
  }

  // ---------- Ma position ----------
  // Chaque nouvelle position GPS est rejointe en douceur (interpolation sur la durée entre
  // deux mesures), le cap et la rotation de la carte sont lissés : plus de sauts.
  var NAV_ZOOM = 17;
  /** En navigation, ma flèche est à 72 % de la hauteur de l'écran (on voit plus loin devant) */
  var NAV_ANCHOR_Y = 0.72;
  /** Au-delà, on saute directement à la nouvelle position (reprise après une coupure GPS) */
  var TELEPORT_M = 500;

  var me = {
    marker: null, halo: null, el: null,
    from: null, to: null, t0: 0, dur: 0, lastFixAt: 0, accuracy: 0,
    targetHeading: null, heading: null,
    follow: false, nav: false, centered: false
  };
  var frame = null, lastFrameAt = 0;
  /** Bouton boussole ou fin de navigation : la carte revient nord en haut */
  var resetNorth = false;

  function meIcon() {
    var el = document.createElement('div');
    el.className = 'me nohead';
    el.innerHTML =
      '<svg class="arrow" viewBox="0 0 40 40"><path d="M20 3 L34 35 L20 27 L6 35 Z" fill="${Colors.me}" stroke="${Colors.white}" stroke-width="3" stroke-linejoin="round"/></svg>' +
      '<svg class="dot" viewBox="0 0 40 40"><circle cx="20" cy="20" r="9" fill="${Colors.me}" stroke="${Colors.white}" stroke-width="3"/></svg>';
    return L.divIcon({ className: 'me-wrap', html: el, iconSize: [40, 40], iconAnchor: [20, 20] });
  }

  function interpolated(now) {
    if (!me.to) return null;
    if (!me.from || !me.dur) return me.to;
    var k = Math.min(1, (now - me.t0) / me.dur);
    return L.latLng(me.from.lat + (me.to.lat - me.from.lat) * k, me.from.lng + (me.to.lng - me.from.lng) * k);
  }

  function animate() {
    frame = null;
    var now = Date.now();
    var dt = Math.min(100, now - (lastFrameAt || now));
    lastFrameAt = now;
    var pos = interpolated(now);
    var busy = !!(pos && me.dur && now - me.t0 < me.dur);
    // Pas pendant un zoom ni tant qu'un doigt est posé (pincement, rotation)
    var touching = pointers > 0 || container.classList.contains('zooming');

    // Cap lissé (constante de temps 250 ms)
    if (me.targetHeading !== null) {
      if (me.heading === null) me.heading = me.targetHeading;
      else {
        var dh = angleDelta(me.heading, me.targetHeading);
        me.heading = (me.heading + dh * (1 - Math.exp(-dt / 250)) + 360) % 360;
        if (Math.abs(dh) > 0.5) busy = true;
      }
    }

    // Navigation suivie : ma direction en haut. Nord en haut sur demande. Sinon, l'orientation
    // choisie au doigt est gardée.
    var targetBearing = null;
    if (me.nav && me.follow && me.heading !== null) targetBearing = (360 - me.heading) % 360;
    else if (resetNorth) targetBearing = 0;
    if (map.setBearing && targetBearing !== null && !touching) {
      var bearing = mapBearing();
      var db = angleDelta(bearing, targetBearing);
      if (Math.abs(db) > 0.3) {
        map.setBearing(bearing + db * (1 - Math.exp(-dt / 350)));
        markRotating();
        busy = true;
      } else {
        if (Math.abs(db) > 0.01) map.setBearing(targetBearing);
        if (targetBearing === 0) resetNorth = false;
      }
    }
    if (!pos) return busy ? (frame = requestAnimationFrame(animate)) : undefined;

    me.marker.setLatLng(pos);
    me.halo.setLatLng(pos).setRadius(me.accuracy);
    if (me.el) {
      var noHead = me.heading === null;
      if (me.el.classList.contains('nohead') !== noHead) me.el.classList.toggle('nohead', noHead);
      if (!noHead) me.el.style.transform = 'rotate(' + (me.heading + mapBearing()) + 'deg)';
    }

    // Caméra : suit la flèche (au centre, ou en bas de l'écran en navigation)
    if (me.follow && !touching) {
      var size = map.getSize();
      var target = L.point(size.x / 2, size.y * (me.nav ? NAV_ANCHOR_Y : 0.5));
      var offset = map.latLngToContainerPoint(pos).subtract(target);
      var far = Math.abs(offset.x) + Math.abs(offset.y);
      if (far >= 1) {
        // Grand écart (entrée en navigation, recentrage) : rejoint en douceur ; sinon suivi image par image
        map.panBy(far > 40 ? offset.multiplyBy(1 - Math.exp(-dt / 120)) : offset, { animate: false });
        if (far > 40) busy = true;
      }
    }
    if (me.nav && me.follow) busy = true;

    if (busy) frame = requestAnimationFrame(animate);
  }

  function wake() {
    if (!frame) { lastFrameAt = Date.now(); frame = requestAnimationFrame(animate); }
  }

  window.setPosition = function (p, follow, nav) {
    var now = Date.now();
    var ll = L.latLng(p.latitude, p.longitude);
    // Un « suivre » envoyé juste après un glissement de l'utilisateur est périmé
    me.follow = !!follow && now - lastDragAt > 600;
    me.accuracy = p.accuracy || 0;
    me.targetHeading = typeof p.heading === 'number' ? p.heading : null;
    if (me.targetHeading === null) me.heading = null;

    if (!me.marker) {
      me.halo = L.circle(ll, { radius: me.accuracy, stroke: false, fillColor: '${Colors.me}', fillOpacity: 0.1, interactive: false }).addTo(map);
      me.marker = L.marker(ll, { icon: meIcon(), interactive: false, keyboard: false, zIndexOffset: 3000 }).addTo(map);
      var wrap = me.marker.getElement();
      me.el = wrap && wrap.firstChild;
    }

    if (!me.to || !ll.equals(me.to)) {
      var cur = interpolated(now) || ll;
      var gap = me.lastFixAt ? now - me.lastFixAt : 0;
      me.from = cur;
      me.to = ll;
      me.t0 = now;
      // Durée = temps entre deux mesures (bornée) : la flèche arrive quand la suivante tombe
      me.dur = gap && cur.distanceTo(ll) < TELEPORT_M ? Math.max(250, Math.min(1500, gap)) : 0;
      me.lastFixAt = now;
    }

    if (nav && !me.nav) map.setZoom(Math.max(map.getZoom(), NAV_ZOOM), { animate: false });
    // Fin de navigation : retour nord en haut
    if (!nav && me.nav) resetNorth = true;
    me.nav = !!nav;

    if (!me.centered) {
      map.setView(ll, nav ? NAV_ZOOM : 13, { animate: false });
      me.centered = true;
    }
    wake();
  };

  window.northUp = function () {
    resetNorth = true;
    wake();
  };

  window.setHeading = function (heading) {
    me.targetHeading = typeof heading === 'number' ? heading : null;
    if (me.targetHeading === null) me.heading = null;
    if (me.marker) wake();
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
      } else if (p.kind === 'dropped') {
        el.className = 'drop';
        icon = L.divIcon({ className: 'pin-wrap', html: el, iconSize: [26, 26], iconAnchor: [13, 31] });
      } else {
        el.className = 'pin ' + p.kind;
        el.textContent = p.label;
        icon = L.divIcon({ className: 'pin-wrap', html: el, iconSize: null, iconAnchor: [14, 14] });
      }
      var marker = L.marker([p.latitude, p.longitude], { icon: icon, zIndexOffset: p.kind === 'dropped' ? 2000 : 500 }).addTo(map);
      marker.on('click', function () { post({ type: 'pin', id: p.id }); });
      pins[p.id] = marker;
    });
  };

  var routeLayer = L.layerGroup().addTo(map);
  window.setRoutes = function (list) {
    routeLayer.clearLayers();
    // Alternatives d'abord : l'itinéraire choisi est dessiné par-dessus
    list.filter(function (r) { return r.muted; }).concat(list.filter(function (r) { return !r.muted; })).forEach(function (r) {
      L.polyline(r.points, { color: '${Colors.white}', weight: r.muted ? 6 : 8, opacity: 0.9, interactive: false }).addTo(routeLayer);
      L.polyline(r.points, { color: r.color || '${Colors.accent}', weight: r.muted ? 4 : 5, opacity: r.muted ? 0.8 : 0.95, interactive: false }).addTo(routeLayer);
    });
  };

  // Petit bip (deux tonalités courtes), joué par la page : pas de module son natif
  var audioCtx = null;
  window.beep = function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return post({ type: 'beep', ok: false });
      if (!audioCtx) audioCtx = new AC();
      var done = false;
      var play = function () {
        if (done) return;
        done = true;
        var t = audioCtx.currentTime;
        [0, 0.2].forEach(function (d) {
          var o = audioCtx.createOscillator(), g = audioCtx.createGain();
          o.type = 'sine';
          o.frequency.value = 1320;
          g.gain.setValueAtTime(0.0001, t + d);
          g.gain.exponentialRampToValueAtTime(0.7, t + d + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.15);
          o.connect(g);
          g.connect(audioCtx.destination);
          o.start(t + d);
          o.stop(t + d + 0.17);
        });
        post({ type: 'beep', ok: true });
      };
      if (audioCtx.state === 'running') return play();
      audioCtx.resume().then(play, function () {});
      // Son refusé (pas encore de toucher sur la page) : l'app prend le relais
      setTimeout(function () { if (!done) { done = true; post({ type: 'beep', ok: false }); } }, 600);
    } catch (e) {
      post({ type: 'beep', ok: false });
    }
  };

  window.fitTo = function (points) {
    if (!points.length) return;
    me.centered = true;
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
}: Props) {
  const webRef = useRef<WebView>(null);
  const { colors } = useTheme();
  const mapDark = useMapDark(position ?? null);
  // Changer de thème ou de style de carte recharge la page (l'état est renvoyé au « ready » suivant)
  const html = useMemo(() => buildHtml(colors, mapDark), [colors, mapDark]);
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

  useEffect(() => {
    if (!pageLoads || !northUpKey) return;
    webRef.current?.injectJavaScript(`window.northUp && window.northUp(); true;`);
  }, [pageLoads, northUpKey]);

  const markersJson = JSON.stringify(markers);
  useEffect(() => {
    if (!pageLoads) return;
    webRef.current?.injectJavaScript(
      `window.setMarkers && window.setMarkers(${markersJson}, ${JSON.stringify(selectedMarkerId ?? null)}); true;`,
    );
  }, [pageLoads, markersJson, selectedMarkerId]);

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

  useEffect(() => {
    if (!pageLoads || !beepKey) return;
    webRef.current?.injectJavaScript(`window.beep && window.beep(); true;`);
  }, [pageLoads, beepKey]);

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: WebMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      setPageLoads((n) => n + 1);
      onBearingChange?.(0);
    } else if (msg.type === 'pan') onUserPan?.();
    else if (msg.type === 'bearing') onBearingChange?.(msg.value);
    else if (msg.type === 'mapPress') onMapPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'longPress') onMapLongPress?.({ latitude: msg.latitude, longitude: msg.longitude });
    else if (msg.type === 'marker') onMarkerPress?.(msg.id);
    else if (msg.type === 'pin') onPinPress?.(msg.id);
    else if (msg.type === 'markers') onMarkersRendered?.(msg.count);
    else if (msg.type === 'beep' && !msg.ok) onBeepFailed?.();
    else if (msg.type === 'error') console.warn('[carte]', msg.message);
  };

  return (
    <WebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: BASE_URL }}
      onMessage={onMessage}
      // Le bip de dépassement de vitesse doit pouvoir sonner sans toucher la carte
      mediaPlaybackRequiresUserAction={false}
      // Les liens (attribution OSM) s'ouvrent dans le navigateur, pas dans la carte
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === BASE_URL || req.url.startsWith('about:')) return true;
        Linking.openURL(req.url);
        return false;
      }}
    />
  );
}
