import { mapCss, MAPTILER_KEY } from '@/components/map-style';
import { DarkColors, LightColors, type Palette } from '@/constants/theme';

// Page de la carte de NAVIGATION en vue inclinée (MapLibre GL JS, WebGL) : nav-map-gl.tsx.
// Même interface que la page Leaflet (setPosition, setRoutes, setPins…), mêmes messages vers l'app.
// Sans WebGL, sans MapLibre (réseau) ou si le style ne charge pas : message « fallback » → l'app
// garde la carte Leaflet. Hors navigation, la carte reste Leaflet (leaflet-map-html.ts).

export const MAPLIBRE_VERSION = '5.24.0';
const MAPLIBRE = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl`;
/** Styles vectoriels MapTiler (même clé que les tuiles de Leaflet) */
export const GL_STYLES = {
  light: 'https://api.maptiler.com/maps/streets-v2/style.json?key=',
  dark: 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key=',
};
/** Inclinaison de la vue de navigation (degrés) */
export const NAV_PITCH = 45;
/**
 * Zoom MapLibre = zoom Leaflet - 1 (tuiles de 512 px). Vue inclinée : la flèche, en bas de l'écran,
 * est plus près de la caméra et paraît plus grosse ; on recule encore un peu.
 */
export const GL_ZOOM_OFFSET = -1;

export function buildNavGlHtml(Colors: Palette, dark: boolean) {
  const styleUrl = MAPTILER_KEY ? (dark ? GL_STYLES.dark : GL_STYLES.light) + encodeURIComponent(MAPTILER_KEY) : '';
  Colors = { ...Colors, mapBackground: dark ? DarkColors.mapBackground : LightColors.mapBackground };
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${MAPLIBRE}.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${Colors.mapBackground}; overflow: hidden; }
  body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  ${mapCss(Colors)}
  .maplibregl-marker { will-change: transform; }
  /* Flèche posée à plat sur la carte inclinée : un peu plus grande pour rester bien visible */
  .me.gl, .me.gl svg { width: 56px; height: 56px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  function post(msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  window.onerror = function (message, source, line) {
    post({ type: 'error', message: String(message) + ' (' + source + ':' + line + ')' });
  };
</script>
<script src="${MAPLIBRE}.js"></script>
<script>
  var PITCH = ${NAV_PITCH}, ZOOM_OFFSET = ${GL_ZOOM_OFFSET};
  /** Ma flèche à 72 % de la hauteur : marge haute de 44 % (le centre de la vue descend d'autant) */
  var NAV_ANCHOR_Y = 0.72;
  var TELEPORT_M = 500;
  var gaveUp = false, loaded = false;
  /** Carte 3D impossible : l'app garde Leaflet (une seule fois) */
  function fallback(reason) {
    if (gaveUp || loaded && reason.indexOf('WebGL perdu') < 0) return;
    gaveUp = true;
    post({ type: 'fallback', reason: reason });
  }
  function angleDelta(from, to) { return ((to - from + 540) % 360) - 180; }

  function webglInfo() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl instanceof (window.WebGL2RenderingContext || function () {}) ? 2 : 1, renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '' };
    } catch (e) { return null; }
  }

  var gl = webglInfo();
  if (!window.maplibregl) fallback('MapLibre non chargé (pas de réseau ?)');
  else if (!'${styleUrl}') fallback('clé MapTiler absente');
  else if (!gl) fallback('WebGL indisponible sur ce téléphone');
  else start();

  function start() {
    var map = window.map = new maplibregl.Map({
      container: 'map',
      style: '${styleUrl}',
      center: [2.4, 46.6],
      zoom: 5,
      pitch: PITCH,
      maxPitch: 60,
      attributionControl: false,
      touchPitch: false,
      pitchWithRotate: false,
      fadeDuration: 0
    });
    var container = map.getContainer();
    var timer = setTimeout(function () { if (!loaded) fallback('carte 3D trop lente à charger'); }, 12000);
    map.on('error', function (e) {
      var msg = e && e.error && (e.error.message || String(e.error)) || 'erreur';
      if (!loaded) fallback('style MapTiler indisponible (' + msg + ')');
      else post({ type: 'error', message: msg });
    });
    map.getCanvas().addEventListener('webglcontextlost', function () { fallback('WebGL perdu'); });

    // ---------- Gestes : glisser, pincer, tourner coupent le suivi ----------
    var lastDragAt = 0;
    function userMoved() {
      lastDragAt = Date.now();
      me.follow = false;
      me.centered = true;
      resetNorth = false;
      post({ type: 'pan' });
    }
    ['dragstart', 'zoomstart', 'rotatestart'].forEach(function (ev) {
      map.on(ev, function (e) { if (e && e.originalEvent) userMoved(); });
    });
    container.addEventListener('touchstart', function () { if (me.nav && !me.follow) post({ type: 'pan' }); }, true);
    map.on('click', function (e) {
      var hit = map.getLayer('pins') ? map.queryRenderedFeatures(e.point, { layers: ['pins'] }) : [];
      var f = hit.filter(function (h) { return h.properties.tap; })[0];
      if (f) return post({ type: 'pin', id: f.properties.id });
      post({ type: 'mapPress', latitude: e.lngLat.lat, longitude: e.lngLat.lng });
    });

    // Orientation envoyée à l'app (boussole), au format de la page Leaflet (sens inverse)
    var sentBearing = 0, bearingTimer = null;
    map.on('rotate', function () {
      if (bearingTimer) return;
      bearingTimer = setTimeout(function () {
        bearingTimer = null;
        var b = Math.round(360 - map.getBearing()) % 360;
        if (b === sentBearing) return;
        if (b === 0 || Math.abs(angleDelta(sentBearing, b)) >= 4) { sentBearing = b; post({ type: 'bearing', value: b }); }
      }, 200);
    });
    var viewTimer = null, lastView = '';
    map.on('moveend', function () {
      clearTimeout(viewTimer);
      viewTimer = setTimeout(function () {
        var c = map.getCenter(), z = map.getZoom() + 1;
        var key = c.lat.toFixed(3) + ',' + c.lng.toFixed(3) + ',' + Math.round(z);
        if (key === lastView) return;
        lastView = key;
        post({ type: 'view', latitude: c.lat, longitude: c.lng, zoom: z });
      }, 700);
    });

    // ---------- Ma position ----------
    var me = {
      marker: null, el: null,
      from: null, to: null, t0: 0, dur: 0, lastFixAt: 0,
      targetHeading: null, heading: null,
      follow: false, nav: false, centered: false
    };
    var resetNorth = false, mapOrientation = 'heading', navZoom = 17;
    var frame = null, lastFrameAt = 0;

    function meElement() {
      var el = document.createElement('div');
      el.className = 'me gl nohead';
      el.innerHTML =
        '<svg class="arrow" viewBox="0 0 40 40"><path d="M20 3 L34 35 L20 27 L6 35 Z" fill="${Colors.me}" stroke="${Colors.white}" stroke-width="3" stroke-linejoin="round"/></svg>' +
        '<svg class="dot" viewBox="0 0 40 40"><circle cx="20" cy="20" r="9" fill="${Colors.me}" stroke="${Colors.white}" stroke-width="3"/></svg>';
      return el;
    }
    function interpolated(now) {
      if (!me.to) return null;
      if (!me.from || !me.dur) return me.to;
      var k = Math.min(1, (now - me.t0) / me.dur);
      return { lng: me.from.lng + (me.to.lng - me.from.lng) * k, lat: me.from.lat + (me.to.lat - me.from.lat) * k };
    }
    function distanceM(a, b) {
      var R = 6371000, toRad = Math.PI / 180;
      var dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    function anchorPadding() { return { top: Math.round(map.getContainer().clientHeight * (2 * NAV_ANCHOR_Y - 1)), bottom: 0, left: 0, right: 0 }; }

    function animate() {
      frame = null;
      var now = Date.now();
      var dt = Math.min(100, now - (lastFrameAt || now));
      lastFrameAt = now;
      var pos = interpolated(now);
      var busy = !!(pos && me.dur && now - me.t0 < me.dur);

      // Cap lissé (constante de temps 250 ms), comme la carte Leaflet
      if (me.targetHeading !== null) {
        if (me.heading === null) me.heading = me.targetHeading;
        else {
          var dh = angleDelta(me.heading, me.targetHeading);
          me.heading = (me.heading + dh * (1 - Math.exp(-dt / 250)) + 360) % 360;
          if (Math.abs(dh) > 0.5) busy = true;
        }
      }
      if (pos && me.marker) {
        me.marker.setLngLat(pos);
        var noHead = me.heading === null;
        if (me.el.classList.contains('nohead') !== noHead) me.el.classList.toggle('nohead', noHead);
        if (!noHead) me.marker.setRotation(me.heading);
      }

      // Caméra : suit la flèche, cap en haut (ou nord), inclinée, zoom de conduite ; tout en douceur
      if (pos && me.follow) {
        var cam = {};
        var c = map.getCenter();
        var far = distanceM({ lat: c.lat, lng: c.lng }, pos);
        var k = far > 30 ? 1 - Math.exp(-dt / 150) : 1;
        cam.center = [c.lng + (pos.lng - c.lng) * k, c.lat + (pos.lat - c.lat) * k];
        if (k < 1) busy = true;
        var targetBearing = mapOrientation === 'heading' && me.nav && me.heading !== null ? me.heading : (mapOrientation === 'north' || resetNorth ? 0 : null);
        if (targetBearing !== null) {
          var b = map.getBearing();
          var db = angleDelta(b, targetBearing);
          cam.bearing = Math.abs(db) > 0.2 ? b + db * (1 - Math.exp(-dt / 350)) : targetBearing;
          if (Math.abs(db) > 0.2) busy = true;
        }
        var zTarget = navZoom + ZOOM_OFFSET;
        var dz = zTarget - map.getZoom();
        cam.zoom = Math.abs(dz) > 0.01 ? map.getZoom() + dz * (1 - Math.exp(-dt / 700)) : zTarget;
        if (Math.abs(dz) > 0.01) busy = true;
        var dp = PITCH - map.getPitch();
        if (Math.abs(dp) > 0.2) { cam.pitch = map.getPitch() + dp * (1 - Math.exp(-dt / 300)); busy = true; }
        else if (dp !== 0) cam.pitch = PITCH;
        map.jumpTo(cam);
      }
      if (me.nav && me.follow) busy = true;
      if (busy) frame = requestAnimationFrame(animate);
    }
    function wake() {
      if (!frame) { lastFrameAt = Date.now(); frame = requestAnimationFrame(animate); }
    }

    window.setPosition = function (p, follow, nav) {
      var now = Date.now();
      var ll = { lng: p.longitude, lat: p.latitude };
      var wasFollowing = me.follow;
      me.follow = !!follow && now - lastDragAt > 600;
      me.targetHeading = typeof p.heading === 'number' ? p.heading : null;
      if (me.targetHeading === null) me.heading = null;
      if (!me.marker) {
        me.el = meElement();
        me.marker = new maplibregl.Marker({ element: me.el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(ll).addTo(map);
      }
      if (!me.to || me.to.lng !== ll.lng || me.to.lat !== ll.lat) {
        var cur = interpolated(now) || ll;
        var gap = me.lastFixAt ? now - me.lastFixAt : 0;
        me.from = cur;
        me.to = ll;
        me.t0 = now;
        me.dur = gap && distanceM(cur, ll) < TELEPORT_M ? Math.max(250, Math.min(1500, gap)) : 0;
        me.lastFixAt = now;
      }
      if (!nav && me.nav) resetNorth = true;
      me.nav = !!nav;
      // Suivi (re)pris : la flèche redescend à 72 % de la hauteur
      if (me.follow && !wasFollowing) map.setPadding(anchorPadding());
      if (!me.centered) {
        map.jumpTo({ center: ll, zoom: navZoom + ZOOM_OFFSET, pitch: PITCH, bearing: me.targetHeading || 0, padding: anchorPadding() });
        me.centered = true;
      }
      wake();
    };
    window.setDefaultView = function (v) {
      if (!me.centered && v) map.jumpTo({ center: [v.longitude, v.latitude], zoom: v.zoom - 1 });
    };
    window.northUp = function () { resetNorth = true; wake(); };
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
    window.setNavZoom = function (z) { if (typeof z === 'number' && z > 0) navZoom = z; wake(); };
    window.addEventListener('resize', function () { if (me.follow) map.setPadding(anchorPadding()); });

    // ---------- Amis en direct (pastilles photo) ----------
    var markers = {};
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
        var entry = markers[m.id];
        if (!entry) {
          var wrap = document.createElement('div');
          var el = document.createElement('div');
          var img = document.createElement('img');
          img.src = m.photoUrl;
          el.appendChild(img);
          wrap.appendChild(el);
          wrap.addEventListener('click', function (e) { e.stopPropagation(); post({ type: 'marker', id: m.id }); });
          entry = markers[m.id] = { el: el, marker: new maplibregl.Marker({ element: wrap }).setLngLat([m.longitude, m.latitude]).addTo(map) };
        } else entry.marker.setLngLat([m.longitude, m.latitude]);
        var cls = 'person' + (m.tone && m.tone !== 'default' ? ' ' + m.tone : '') + (m.id === selectedId ? ' selected' : '');
        if (entry.el.className !== cls) entry.el.className = cls;
        setBadge(entry.el, m.badge);
      });
      Object.keys(markers).forEach(function (id) {
        if (!seen[id]) { markers[id].marker.remove(); delete markers[id]; }
      });
      post({ type: 'markers', count: Object.keys(markers).length });
    };

    // ---------- Repères ----------
    // Icônes SVG (signalements, feux, zones, stations…) : couche de symboles WebGL (fluide même
    // nombreuses) ; repères à texte (départ, étapes, RDV…) : petits éléments HTML.
    var images = {}, labelPins = {}, pinList = [];
    function imageId(icon) {
      var s = icon.svg + icon.width + 'x' + icon.height, h = 0;
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return 'i' + (h >>> 0).toString(36);
    }
    function loadImage(id, icon) {
      if (images[id]) return images[id];
      images[id] = new Promise(function (resolve) {
        var img = new Image();
        var scale = 2;
        img.onload = function () {
          var c = document.createElement('canvas');
          c.width = icon.width * scale; c.height = icon.height * scale;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var data = c.getContext('2d').getImageData(0, 0, c.width, c.height);
          if (!map.hasImage(id)) map.addImage(id, { width: c.width, height: c.height, data: new Uint8Array(data.data.buffer) }, { pixelRatio: scale });
          resolve();
        };
        img.onerror = function () { resolve(); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon.svg);
      });
      return images[id];
    }
    var pinsVersion = 0;
    window.setPins = function (list) {
      pinList = list;
      var version = ++pinsVersion;
      var features = [], waits = [];
      list.forEach(function (p) {
        if (!p.icon) return;
        var id = imageId(p.icon);
        waits.push(loadImage(id, p.icon));
        var bottom = p.icon.anchor === 'bottom';
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
          properties: {
            id: p.id, img: id, tap: p.kind !== 'signal' && p.kind !== 'zone',
            // Pointe du triangle à 88 % de la hauteur, comme sur la carte Leaflet
            anchor: bottom ? 'bottom' : 'center', offset: [0, bottom ? Math.round(p.icon.height * 0.12) : 0],
            z: p.kind === 'signal' ? 0 : p.kind === 'zone' ? 1 : 2
          }
        });
      });
      Promise.all(waits).then(function () {
        if (version !== pinsVersion) return;
        map.getSource('pins').setData({ type: 'FeatureCollection', features: features });
      });
      // Repères à texte
      var seen = {};
      list.forEach(function (p) {
        if (p.icon) return;
        seen[p.id] = true;
        if (labelPins[p.id]) { labelPins[p.id].setLngLat([p.longitude, p.latitude]); return; }
        var el = document.createElement('div');
        if (p.kind === 'dropped') el.className = 'drop';
        else { el.className = 'pin ' + p.kind; el.textContent = p.label; }
        var wrap = document.createElement('div');
        wrap.appendChild(el);
        wrap.addEventListener('click', function (e) { e.stopPropagation(); post({ type: 'pin', id: p.id }); });
        labelPins[p.id] = new maplibregl.Marker({ element: wrap, anchor: p.kind === 'dropped' ? 'bottom' : 'center' }).setLngLat([p.longitude, p.latitude]).addTo(map);
      });
      Object.keys(labelPins).forEach(function (id) {
        if (!seen[id]) { labelPins[id].remove(); delete labelPins[id]; }
      });
    };

    // ---------- Tracés ----------
    window.setRoutes = function (list) {
      var features = list.map(function (r) {
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: r.points.map(function (p) { return [p[1], p[0]]; }) },
          properties: { color: r.color || '${Colors.accent}', muted: !!r.muted, zone: !!r.zone, order: r.zone ? 0 : r.muted ? 1 : 2 }
        };
      });
      map.getSource('routes').setData({ type: 'FeatureCollection', features: features });
    };

    window.fitTo = function (points) {
      if (!points.length) return;
      me.centered = true;
      if (points.length === 1) return map.jumpTo({ center: [points[0][1], points[0][0]], zoom: 13 });
      var b = new maplibregl.LngLatBounds();
      points.forEach(function (p) { b.extend([p[1], p[0]]); });
      map.fitBounds(b, { padding: 40, maxZoom: 14, animate: false });
    };

    // Petit bip : joué par la carte Leaflet (toujours chargée sous celle-ci)
    window.beep = function () {};

    map.on('load', function () {
      loaded = true;
      clearTimeout(timer);
      // Tracés sous les libellés de la carte (noms de rues lisibles)
      var firstSymbol = (map.getStyle().layers || []).filter(function (l) { return l.type === 'symbol'; })[0];
      var before = firstSymbol ? firstSymbol.id : undefined;
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-zone', type: 'line', source: 'routes', filter: ['get', 'zone'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, 6, 15, 18, 18, 60] } }, before);
      map.addLayer({ id: 'route-casing', type: 'line', source: 'routes', filter: ['!', ['get', 'zone']],
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] },
        paint: { 'line-color': '${Colors.white}', 'line-opacity': 0.95,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, ['case', ['get', 'muted'], 4, 6], 15, ['case', ['get', 'muted'], 9, 13], 18, ['case', ['get', 'muted'], 30, 44]] } }, before);
      map.addLayer({ id: 'route-line', type: 'line', source: 'routes', filter: ['!', ['get', 'zone']],
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] },
        paint: { 'line-color': ['get', 'color'], 'line-opacity': ['case', ['get', 'muted'], 0.8, 1],
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, ['case', ['get', 'muted'], 2.5, 4], 15, ['case', ['get', 'muted'], 6, 9], 18, ['case', ['get', 'muted'], 20, 30]] } }, before);
      map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'pins', type: 'symbol', source: 'pins',
        layout: {
          'icon-image': ['get', 'img'], 'icon-anchor': ['get', 'anchor'], 'icon-offset': ['get', 'offset'],
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'z'],
          'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport'
        } });
      post({ type: 'ready', gl: gl });
      map.once('idle', function () { post({ type: 'painted' }); });
    });
  }
</script>
</body>
</html>`;
}
