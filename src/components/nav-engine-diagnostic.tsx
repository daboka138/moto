import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { MapFrame } from '@/components/map-frame';
import { GL_STYLES, MAPLIBRE_VERSION } from '@/components/nav-map-gl-html';
import { MAPTILER_KEY } from '@/components/map-style';
import { makeStyles, Radius, Type, useColors } from '@/constants/theme';
import { navEngineLabel, useNavEnginePref, useNavEngineStatus } from '@/lib/nav-engine';

// Paramètres › Navigation : « Moteur de navigation : 3D (MapLibre) / 2D (Leaflet) + raison »,
// d'après la dernière navigation, et un test immédiat (WebGL, MapLibre, style MapTiler) dans une
// petite page invisible, la même WebView que la carte.

type Probe = { ok: boolean; text: string };

const PROBE_HTML = `<!DOCTYPE html><html><head></head><body><script>
function post(m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
var info = 'WebGL indisponible';
try {
  var c = document.createElement('canvas');
  var gl = c.getContext('webgl2') || c.getContext('webgl');
  if (gl) {
    var ext = gl.getExtension('WEBGL_debug_renderer_info');
    info = 'WebGL ' + (window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext ? 2 : 1) + (ext ? ' · ' + gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
  }
} catch (e) {}
if (info === 'WebGL indisponible') post({ ok: false, text: 'WebGL indisponible sur ce téléphone' });
else {
  var s = document.createElement('script');
  s.src = 'https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js';
  s.onerror = function () { post({ ok: false, text: info + ' · MapLibre non chargé (réseau ?)' }); };
  s.onload = function () {
    if (!'${MAPTILER_KEY ? 'ok' : ''}') return post({ ok: false, text: info + ' · clé MapTiler absente' });
    fetch('${GL_STYLES.light}${encodeURIComponent(MAPTILER_KEY)}').then(function (r) {
      post(r.ok ? { ok: true, text: info } : { ok: false, text: info + ' · style MapTiler refusé (' + r.status + ')' });
    }, function () { post({ ok: false, text: info + ' · style MapTiler injoignable' }); });
  };
  document.body.appendChild(s);
}
</script></body></html>`;

export function NavEngineDiagnostic() {
  const Colors = useColors();
  const styles = useStyles();
  const pref = useNavEnginePref();
  const status = useNavEngineStatus();
  const [probe, setProbe] = useState<Probe | 'running' | null>(null);

  const last = status
    ? `${navEngineLabel(status.engine)} · ${status.reason} (${new Date(status.at).toLocaleDateString('fr-FR')} ${new Date(status.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})`
    : 'pas encore de navigation sur ce téléphone';

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Moteur de navigation : {status ? navEngineLabel(status.engine) : navEngineLabel(pref)}</Text>
      <Text style={styles.text}>Dernière navigation : {last}</Text>
      <Text style={styles.text}>
        Choix : vue {pref === '3d' ? '3D inclinée' : '2D à plat'} (à changer pendant la navigation, menu « ⋯ »)
      </Text>
      {probe && probe !== 'running' && (
        <View style={styles.result}>
          <Ionicons name={probe.ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={probe.ok ? Colors.success : Colors.danger} />
          <Text style={styles.resultText}>
            {probe.ok ? '3D possible' : '3D impossible, la navigation sera en 2D'} · {probe.text}
          </Text>
        </View>
      )}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
        onPress={() => setProbe('running')}
        disabled={probe === 'running'}
        accessibilityRole="button">
        {probe === 'running' ? <ActivityIndicator color={Colors.accent} /> : <Ionicons name="pulse-outline" size={18} color={Colors.accent} />}
        <Text style={styles.buttonText}>Tester la 3D maintenant</Text>
      </Pressable>
      {probe === 'running' && (
        <View style={styles.probe} pointerEvents="none">
          <MapFrame
            html={PROBE_HTML}
            onMessage={(data) => {
              try {
                setProbe(JSON.parse(data) as Probe);
              } catch {
                setProbe({ ok: false, text: 'réponse illisible' });
              }
            }}
          />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  box: { gap: 6, padding: 16 },
  title: { fontSize: Type.body, fontWeight: '800', color: Colors.text },
  text: { fontSize: Type.small, color: Colors.textMuted },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { flex: 1, fontSize: Type.small, color: Colors.text },
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  buttonText: { color: Colors.accent, fontWeight: '700', fontSize: Type.small },
  probe: { position: 'absolute', width: 2, height: 2, opacity: 0.01, overflow: 'hidden' },
}));
