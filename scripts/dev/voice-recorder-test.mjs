// Banc d'essai du bouton 🎤 (src/lib/use-voice-recorder.ts) : appui long, tap / 2e tap, glisser pour annuler,
// trop court, 2 min max, autorisation du micro, appareil sans enregistrement. Aucun accès réseau ni base.
// node --import ./scripts/dev/register.mjs scripts/dev/voice-recorder-test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';

// react / react-native / enregistreur remplacés par des doublures pilotées par le test
const STUBS = {
  react: `
    const H = () => globalThis.__hooks;
    export function useState(init) {
      const h = H(); const i = h.i++;
      if (!(i in h.state)) h.state[i] = init;
      return [h.state[i], (v) => { h.state[i] = typeof v === 'function' ? v(h.state[i]) : v; h.dirty = true; }];
    }
    export function useRef(init) { const h = H(); const i = h.i++; if (!(i in h.state)) h.state[i] = { current: init }; return h.state[i]; }
    export function useEffect(fn) { H().effects.push(fn); }`,
  'react-native': `
    export const Platform = { get OS() { return globalThis.__platform; } };
    export const Vibration = { vibrate: () => globalThis.__log.push('buzz') };
    export const Alert = { alert: (t, m) => globalThis.__log.push('alert:' + m) };`,
  '@/lib/messages': 'export const VOICE_MAX_MS = 120000;',
  '@/lib/voice-recorder': `
    const M = () => globalThis.__mic;
    export const MIC_PROMPT_HINT = 'PROMPT', MIC_DENIED_HELP = 'DENIED', VOICE_UNSUPPORTED = 'UNSUPPORTED';
    export const voiceRecordingSupported = () => M().supported;
    export const micPermission = async () => M().perm;
    export const requestMicPermission = async () => { M().perm = M().grant ? 'granted' : 'denied'; return M().grant; };
    export const releaseRecordedVoice = (v) => globalThis.__log.push('release');
    export async function startVoiceRecording() {
      await new Promise((r) => setTimeout(r, M().startDelay));
      M().started++;
      const startedAt = Date.now();
      return {
        startedAt,
        stop: async () => { M().stopped++; return { data: 'x', mimeType: 'audio/webm', durationMs: Date.now() - startedAt, uri: 'blob:x' }; },
        cancel: () => { M().cancelled++; },
      };
    }`,
};
const stubUrl = (s) => 'data:text/javascript,' + encodeURIComponent(STUBS[s]);
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      const S = ${JSON.stringify(Object.fromEntries(Object.keys(STUBS).map((k) => [k, stubUrl(k)])))};
      export async function resolve(spec, ctx, next) { return S[spec] ? { url: S[spec], shortCircuit: true } : next(spec, ctx); }`),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let useVoiceRecorder;

function setup({ platform = 'web', supported = true, perm = 'granted', grant = true, startDelay = 50 } = {}) {
  globalThis.__platform = platform;
  globalThis.__log = [];
  globalThis.__mic = { supported, perm, grant, startDelay, started: 0, stopped: 0, cancelled: 0 };
  globalThis.__hooks = { state: {}, i: 0, effects: [], dirty: false };
  const sent = [];
  const infos = [];
  let api;
  const render = () => {
    const h = globalThis.__hooks;
    h.i = 0;
    h.effects = [];
    api = useVoiceRecorder({ onSend: (v) => sent.push(v), onInfo: (m) => infos.push(m) });
    h.effects.forEach((fn) => fn());
  };
  render();
  const ev = (x = 100) => ({ nativeEvent: { pageX: x } });
  const flush = async (ms = 0) => {
    await sleep(ms);
    render();
  };
  return {
    sent,
    infos,
    get state() {
      render();
      return api.state;
    },
    get api() {
      render();
      return api;
    },
    mic: globalThis.__mic,
    log: globalThis.__log,
    down: (x) => api.micProps.onResponderGrant(ev(x)),
    move: (x) => api.micProps.onResponderMove(ev(x)),
    up: () => api.micProps.onResponderRelease(),
    flush,
  };
}

const tests = {
  async 'appui long : enregistre puis envoie au relâchement'() {
    const t = setup();
    t.down();
    await t.flush(80);
    assert.equal(t.state.phase, 'recording');
    assert.equal(t.state.mode, 'hold');
    await t.flush(900);
    t.up();
    await t.flush(10);
    assert.equal(t.sent.length, 1);
    assert.equal(t.state.phase, 'idle');
    assert.equal(t.log.filter((l) => l === 'buzz').length, 2, 'vibration début + fin');
  },
  async 'appui long + glisser à gauche : annulé'() {
    const t = setup();
    t.down(300);
    await t.flush(500);
    t.move(150);
    await t.flush(150);
    assert.equal(t.state.cancelling, true);
    t.up();
    await t.flush(10);
    assert.equal(t.sent.length, 0);
    assert.equal(t.mic.cancelled, 1);
  },
  async 'tap : démarre, 2e tap arrête → écoute → Envoyer'() {
    const t = setup();
    t.down();
    await t.flush(100);
    t.up();
    await t.flush(800);
    assert.equal(t.state.phase, 'recording');
    assert.equal(t.state.mode, 'tap');
    t.down();
    t.up();
    await t.flush(10);
    assert.equal(t.state.phase, 'preview');
    assert.equal(t.state.voice.uri, 'blob:x');
    assert.equal(t.sent.length, 0);
    t.api.sendPreview();
    await t.flush();
    assert.equal(t.sent.length, 1);
    assert.equal(t.state.phase, 'idle');
  },
  async 'tap : écoute → Supprimer'() {
    const t = setup();
    t.down();
    await t.flush(60);
    t.up();
    await t.flush(800);
    t.down();
    t.up();
    await t.flush(10);
    t.api.discardPreview();
    await t.flush();
    assert.equal(t.state.phase, 'idle');
    assert.equal(t.sent.length, 0);
    assert.ok(t.log.includes('release'));
  },
  async 'tap : bouton Envoyer pendant l’enregistrement = envoi direct'() {
    const t = setup();
    t.down();
    t.up();
    await t.flush(900);
    t.api.stopAndSend();
    await t.flush(10);
    assert.equal(t.sent.length, 1);
  },
  async 'tap relâché avant que le micro ne démarre : continue en mode tap'() {
    const t = setup({ startDelay: 400 });
    t.down();
    await t.flush(50);
    t.up();
    await t.flush(1200);
    assert.equal(t.state.phase, 'recording');
    assert.equal(t.state.mode, 'tap');
    assert.equal(t.mic.started, 1);
  },
  async 'appui long relâché avant que le micro ne démarre : rien n’est envoyé'() {
    const t = setup({ startDelay: 700 });
    t.down();
    await t.flush(400);
    t.up();
    await t.flush(500);
    assert.equal(t.sent.length, 0);
    assert.equal(t.mic.cancelled, 1);
    assert.equal(t.state.phase, 'idle');
  },
  async 'appui long trop court : pas d’envoi, aide affichée'() {
    const t = setup({ startDelay: 0 });
    t.down();
    await t.flush(350);
    t.up();
    await t.flush(10);
    assert.equal(t.sent.length, 0);
    assert.match(t.infos.at(-1), /Trop court/);
  },
  async '2 min max : arrêt automatique'() {
    const realNow = Date.now;
    const t = setup({ startDelay: 0 });
    t.down();
    await t.flush(20);
    t.up(); // tap
    const base = realNow();
    Date.now = () => base + 121_000;
    await t.flush(150);
    Date.now = realNow;
    assert.equal(t.state.phase, 'preview');
  },
  async '1er usage : phrase claire, demande du micro, pas d’enregistrement surprise'() {
    const t = setup({ perm: 'prompt', grant: true });
    t.down();
    await t.flush(20);
    t.up();
    await t.flush(20);
    assert.deepEqual(t.infos.slice(0, 1), ['PROMPT']);
    assert.match(t.infos.at(-1), /Micro autorisé/);
    assert.equal(t.mic.started, 0);
    t.down();
    t.up();
    await t.flush(100);
    assert.equal(t.state.mode, 'tap');
  },
  async 'micro refusé : explication pour l’autoriser'() {
    const t = setup({ perm: 'denied' });
    t.down();
    t.up();
    await t.flush(20);
    assert.equal(t.infos.at(-1), 'DENIED');
    assert.equal(t.mic.started, 0);
  },
  async 'APK sans module audio : message « prochaine version »'() {
    const t = setup({ platform: 'android', supported: false });
    t.down();
    t.up();
    await t.flush(10);
    assert.deepEqual(t.log, ['alert:UNSUPPORTED']);
  },
};

({ useVoiceRecorder } = await import('../../src/lib/use-voice-recorder.ts'));
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    failed++;
    console.log('✗', name, '\n ', e.message);
  }
}
console.log(failed ? `${failed} échec(s)` : 'Tout est bon');
process.exit(failed ? 1 : 0);
