import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { mapCss, MAPTILER_KEY, OSM_COPYRIGHT, TILES } from '@/components/map-style';
import type { MapProps } from '@/components/map-types';
import { DarkColors, LightColors, useTheme, type Palette } from '@/constants/theme';
import { CLUSTER_JS, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS_PX } from '@/lib/map-cluster';
import { useMapDark } from '@/lib/use-map-dark';

export type { MapMarker, MapPin, MapPosition, MapRoute } from '@/components/map-types';

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

const BASE_URL = 'https://localhost/';

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
  ${mapCss(Colors)}
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
  // Premières tuiles affichées (ou 1,5 s après le chargement) : l'app retire l'écran de démarrage
  var painted = false;
  function firstPaint() { if (!painted) { painted = true; post({ type: 'painted' }); } }
  setTimeout(firstPaint, 1500);
  // Fond MapTiler, avec repli sur OpenStreetMap si les tuiles sont refusées
  var fallenBack = false, primary = null;
  function useFallbackTiles(reason) {
    if (fallenBack) return;
    fallenBack = true;
    if (primary) map.removeLayer(primary);
    L.tileLayer('${TILES.fallback}', { maxZoom: 19, attribution: '${OSM_COPYRIGHT}' }).on('load', firstPaint).addTo(map);
    post({ type: 'error', message: 'Tuiles MapTiler indisponibles (' + reason + ') : repli sur OpenStreetMap' });
  }
  if ('${tilesUrl}') {
    var loaded = 0, failed = 0;
    primary = L.tileLayer('${tilesUrl}', { maxZoom: 19, attribution: '${TILES.attribution}' });
    primary.on('tileload', function () { loaded++; });
    primary.on('load', firstPaint);
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
  // Doigts posés (événements tactiles) : à 2 doigts, la carte tourne / zoome en CSS et rien n'est redessiné
  var touches = 0;
  function onTouches(e) {
    touches = e.touches ? e.touches.length : 0;
    if (touches < 2) redrawAfterGesture();
  }
  container.addEventListener('touchstart', onTouches, true);
  // Navigation, carte déplacée : chaque nouveau toucher repousse le retour automatique au mode conduite
  container.addEventListener('touchstart', function () { if (me.nav && !me.follow) post({ type: 'pan' }); }, true);
  container.addEventListener('touchend', onTouches, true);
  container.addEventListener('touchcancel', onTouches, true);
  // Glisser ou tourner la carte au doigt coupe le suivi tout de suite (l'app affiche « Recentrer »)
  function userMoved() {
    lastDragAt = Date.now();
    me.follow = false;
    // Carte déplacée à la main : la première position GPS ne la recentre plus de force
    me.centered = true;
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
    // Pastilles et flèche : repositionnées sans transition pendant que la carte tourne (au doigt ou en suivi)
    markRotating();
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
  map.on('zoomstart', function () {
    container.classList.add('zooming');
    // Navigation : un pincement coupe le suivi (sinon le zoom automatique le défait aussitôt)
    if (me.nav && me.follow && touches > 1) userMoved();
  });
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
  /** Zoom de navigation voulu (selon la vitesse, lib/nav-view.ts), rejoint en douceur pendant le suivi */
  var navZoom = NAV_ZOOM;
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
  /** Navigation : 'heading' = ma direction en haut (par défaut), 'north' = nord en haut (bouton boussole) */
  var mapOrientation = 'heading';

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
    var touching = pointers > 0 || touches > 0 || container.classList.contains('zooming');

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
    if (me.nav && me.follow && mapOrientation === 'heading' && me.heading !== null) targetBearing = (360 - me.heading) % 360;
    else if (resetNorth || (me.nav && me.follow && mapOrientation === 'north')) targetBearing = 0;
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

    // Navigation suivie : zoom adapté à la vitesse, animé autour de ma flèche (elle reste à sa place)
    if (me.nav && me.follow && !touching && !map._animatingZoom && Math.abs(map.getZoom() - navZoom) > 0.05 && now - lastZoomAt > 1500) {
      lastZoomAt = now;
      zoomTo(navZoom, map.latLngToContainerPoint(pos), true);
    }

    if (busy) frame = requestAnimationFrame(animate);
  }

  var lastZoomAt = 0;
  /** Zoom fractionnaire (paliers de 0,5) : l'arrondi de Leaflet est coupé le temps de l'appel */
  function zoomTo(z, around, animate) {
    var snap = map.options.zoomSnap;
    map.options.zoomSnap = 0;
    try {
      if (around) map.setZoomAround(around, z, { animate: animate });
      else map.setZoom(z, { animate: animate });
    } finally {
      map.options.zoomSnap = snap;
    }
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

    // Début de navigation : zoom de conduite tout de suite
    if (nav && !me.nav) zoomTo(navZoom, null, false);
    // Fin de navigation : retour nord en haut
    if (!nav && me.nav) resetNorth = true;
    me.nav = !!nav;

    if (!me.centered) {
      map.setView(ll, nav ? Math.round(navZoom) : 13, { animate: false });
      me.centered = true;
    }
    wake();
  };

  /** Vue de départ (dernière position, ville…) : seulement si rien n'a encore centré la carte */
  window.setDefaultView = function (v) {
    if (!me.centered && v) map.setView([v.latitude, v.longitude], v.zoom, { animate: false });
  };

  window.northUp = function () {
    resetNorth = true;
    wake();
  };

  window.setNavZoom = function (z) {
    if (typeof z === 'number' && z > 0) navZoom = z;
    wake();
  };

  window.setOrientation = function (mode) {
    mapOrientation = mode === 'north' ? 'north' : 'heading';
    if (mapOrientation === 'north') resetNorth = true;
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
    setBadge(el, m.badge);
    return L.divIcon({ className: 'person-wrap', html: el, iconSize: [44, 44], iconAnchor: [22, 22] });
  }

  // Badge du convoi (ouvreur / serre-file), ajouté, changé ou retiré
  function setBadge(el, text) {
    var badge = el.querySelector('.badge');
    if (!text) { if (badge) el.removeChild(badge); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; el.appendChild(badge); }
    if (badge.textContent !== text) badge.textContent = text;
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
        setBadge(el.firstChild, m.badge);
        marker.setZIndexOffset(m.id === selectedId ? 1000 : 0);
      }
    });
    Object.keys(markers).forEach(function (id) {
      if (!seen[id]) { map.removeLayer(markers[id]); delete markers[id]; }
    });
    var count = document.querySelectorAll('.person').length;
    if (count !== renderedCount) { renderedCount = count; post({ type: 'markers', count: count }); }
  };

  ${CLUSTER_JS}
  var pins = {};
  var pinList = [];
  window.setPins = function (list) {
    pinList = list;
    renderPins();
  };
  /** Groupe de repères : pastille avec le nombre (couleur du type le plus présent), toucher = zoom dessus */
  function addCluster(group) {
    var lat = 0, lng = 0, counts = {}, top = 'meeting';
    group.forEach(function (p) {
      lat += p.latitude; lng += p.longitude;
      counts[p.kind] = (counts[p.kind] || 0) + 1;
      if (counts[p.kind] > (counts[top] || 0)) top = p.kind;
    });
    var size = group.length < 10 ? 36 : group.length < 100 ? 44 : 52;
    var el = document.createElement('div');
    el.className = 'cluster ' + top;
    el.textContent = clusterLabel(group.length);
    var icon = L.divIcon({ className: 'cluster-wrap', html: el, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    var marker = L.marker([lat / group.length, lng / group.length], { icon: icon, zIndexOffset: 400 }).addTo(map);
    marker.on('click', function () {
      var b = L.latLngBounds(group.map(function (p) { return [p.latitude, p.longitude]; }));
      var z = map.getZoom();
      if (b.getNorthEast().equals(b.getSouthWest())) map.setView(b.getCenter(), Math.min(z + 3, 18));
      else map.fitBounds(b, { padding: [60, 60], maxZoom: Math.max(z + 1, Math.min(z + 4, ${CLUSTER_MAX_ZOOM})) });
    });
    pins['cluster:' + Object.keys(pins).length] = marker;
  }
  function renderPins() {
    Object.keys(pins).forEach(function (id) { map.removeLayer(pins[id]); });
    pins = {};
    var z = map.getZoom();
    var loose = [], grouped = [];
    pinList.forEach(function (p) { (p.cluster && z < ${CLUSTER_MAX_ZOOM} ? grouped : loose).push(p); });
    var items = grouped.map(function (p) { var pt = map.project([p.latitude, p.longitude], z); return { x: pt.x, y: pt.y, p: p }; });
    clusterPoints(items, ${CLUSTER_RADIUS_PX}).forEach(function (g) {
      if (g.length > 1) addCluster(g.map(function (o) { return o.p; }));
      else loose.push(g[0].p);
    });
    loose.forEach(function (p) {
      var el = document.createElement('div');
      var icon;
      if (p.icon) {
        // Icône SVG (signalements, spots, parkings, feux, zones de danger : constants/map-icons.ts)
        el.className = 'mapicon';
        el.innerHTML = p.icon.svg;
        var w = p.icon.width, h = p.icon.height;
        icon = L.divIcon({ className: 'mapicon-wrap', html: el, iconSize: [w, h], iconAnchor: [w / 2, p.icon.anchor === 'bottom' ? h * 0.88 : h / 2] });
        if (p.kind === 'signal' || p.kind === 'zone') {
          // Feu tricolore, zone de danger : non cliquables, au-dessus des tuiles mais sous les autres repères
          pins[p.id] = L.marker([p.latitude, p.longitude], { icon: icon, interactive: false, keyboard: false, zIndexOffset: p.kind === 'zone' ? -500 : -1000 }).addTo(map);
          return;
        }
      } else if (p.kind === 'dropped') {
        el.className = 'drop';
        icon = L.divIcon({ className: 'pin-wrap', html: el, iconSize: [26, 26], iconAnchor: [13, 31] });
      } else {
        el.className = 'pin ' + p.kind;
        el.textContent = p.label;
        icon = L.divIcon({ className: 'pin-wrap', html: el, iconSize: null, iconAnchor: [14, 14] });
      }
      var marker = L.marker([p.latitude, p.longitude], { icon: icon, zIndexOffset: p.kind === 'dropped' ? 2000 : p.kind === 'parking' ? 300 : 500 }).addTo(map);
      marker.on('click', function () { post({ type: 'pin', id: p.id }); });
      pins[p.id] = marker;
    });
  }
  // Regroupement recalculé à chaque changement de zoom (pas pendant un simple déplacement)
  map.on('zoomend', function () { if (pinList.length) renderPins(); });

  var routeLayer = L.layerGroup().addTo(map);
  // Tracés dessinés sur un canvas, pas en SVG : pendant un zoom au doigt, le WebView Android
  // recompose le SVG en retard sur les tuiles (le tracé « glisse » puis se recale) ; le canvas est
  // transformé comme une image, avec les tuiles. Marge 0,7 : rien de coupé en dézoomant ni en tournant.
  var routeRenderer = L.canvas({ padding: 0.7 });
  // leaflet-rotate redessine le canvas à CHAQUE pas de rotation : pendant un geste à 2 doigts, le zoom
  // est fractionnaire et l'origine des pixels bouge, mais les points du tracé sont encore projetés au
  // zoom de départ → tracé redessiné à la mauvaise échelle (il se décale de la route) jusqu'au
  // relâchement. Ici : rien n'est redessiné pendant le geste (le canvas tourne et zoome en CSS avec
  // les tuiles), et hors geste seulement si la vue sort de la zone déjà dessinée (suivi GPS, rotation
  // en navigation : plus de redessin complet à chaque image).
  var rawRendererUpdate = routeRenderer._update;
  var drawnOrigin = null, redrawPending = false;
  routeRenderer._update = function () {
    var m = this._map;
    if (this._bounds && m) {
      if (touches > 1) { redrawPending = true; return; }
      var sameView = drawnOrigin && this._zoom === m.getZoom() && m.getPixelOrigin().equals(drawnOrigin);
      if (sameView && this._bounds.contains(m._getPaddedPixelBounds(0.05))) return;
    }
    rawRendererUpdate.apply(this, arguments);
    if (m) drawnOrigin = m.getPixelOrigin();
  };
  /** Fin du geste sans zoom ni déplacement (rotation seule) : la zone dessinée est vérifiée une fois */
  function redrawAfterGesture() {
    if (!redrawPending) return;
    redrawPending = false;
    setTimeout(function () { if (touches < 2 && !map._animatingZoom) routeRenderer._update(); }, 350);
  }
  window.setRoutes = function (list) {
    routeLayer.clearLayers();
    // Alternatives d'abord : l'itinéraire choisi est dessiné par-dessus
    // Zones de danger : surlignage large et transparent, sous l'itinéraire
    list.filter(function (r) { return r.zone; }).forEach(function (r) {
      L.polyline(r.points, { renderer: routeRenderer, color: r.color, weight: 16, opacity: 1, lineCap: 'butt', interactive: false }).addTo(routeLayer);
    });
    list.filter(function (r) { return r.muted && !r.zone; }).concat(list.filter(function (r) { return !r.muted && !r.zone; })).forEach(function (r) {
      L.polyline(r.points, { renderer: routeRenderer, color: '${Colors.white}', weight: r.muted ? 6 : 8, opacity: 0.9, interactive: false }).addTo(routeLayer);
      L.polyline(r.points, { renderer: routeRenderer, color: r.color || '${Colors.accent}', weight: r.muted ? 4 : 5, opacity: r.muted ? 0.8 : 0.95, interactive: false }).addTo(routeLayer);
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

  // Zone affichée (chargement des parkings moto de la zone) : regroupée, la carte bouge souvent en suivi
  var viewTimer = null, lastView = '';
  map.on('moveend zoomend', function () {
    clearTimeout(viewTimer);
    viewTimer = setTimeout(function () {
      var c = map.getCenter(), z = map.getZoom();
      var key = c.lat.toFixed(3) + ',' + c.lng.toFixed(3) + ',' + Math.round(z);
      if (key === lastView) return;
      lastView = key;
      post({ type: 'view', latitude: c.lat, longitude: c.lng, zoom: z });
    }, 700);
  });

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
  onViewChange,
  defaultView,
  onPainted,
  orientation = 'heading',
  navZoom,
}: MapProps) {
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

  return (
    <WebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: BASE_URL }}
      onMessage={onMessage}
      // Le bip de dépassement de vitesse doit pouvoir sonner sans toucher la carte
      mediaPlaybackRequiresUserAction={false}
      // Android : pas de zoom de page de la WebView (activé par défaut) en concurrence avec le
      // pincement de Leaflet ; seule la carte zoome
      setBuiltInZoomControls={false}
      setDisplayZoomControls={false}
      scalesPageToFit={false}
      // Les liens (attribution OSM) s'ouvrent dans le navigateur, pas dans la carte
      onShouldStartLoadWithRequest={(req) => {
        if (req.url === BASE_URL || req.url.startsWith('about:')) return true;
        Linking.openURL(req.url);
        return false;
      }}
    />
  );
}
