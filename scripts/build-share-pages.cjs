// Pages publiques de partage sur passeryder.fr (servies par Caddy, voir PLAY_STORE.md § 1.2) :
//   site/i/  → /i/CODE  invitation d'un membre (pseudo + photo, Google Play, version web)
//   site/c/  → /c/SLUG  page publique d'un club
//   site/telecharger/ → /telecharger  page de téléchargement (Android : test fermé en 3 étapes ou
//                        Google Play selon app_settings.distribution_mode ; iPhone : version web ;
//                        ordinateur : QR code). Visuels : branding/telecharger.mjs
//   site/s/  → /s/ID    récap de sortie + image story 1080×1920 ou carrée 1080×1080 (canvas),
//                        « Partager l'image » (Web Share) ou « Télécharger ». JAMAIS de vitesse.
// Les données viennent de fonctions Supabase publiques (invite_info, club_public, get_outing,
// app_settings : distribution_mode, testers_group_url, testing_optin_url, play_store_url,
// google_review = bandeau « validation Google en cours » sur /telecharger, /i et /c) avec la clé PUBLISHABLE uniquement.
// Usage : node scripts/build-share-pages.cjs, puis republier le site.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^EXPO_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]),
);
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !KEY) throw new Error('.env incomplet');
if (!KEY.startsWith('sb_publishable_')) throw new Error('Seule une clé publishable peut aller sur le site');

const head = (title, description, { index = false, image = 'https://passeryder.fr/icon.png', css = '' } = {}) => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
${index ? '' : '  <meta name="robots" content="noindex">\n'}  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:site_name" content="PasseRyder">
  <link rel="icon" href="/favicon.png">
  <link rel="stylesheet" href="/style.css">
  <style>
    .share-page { text-align: center; }
    .hero .avatar { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; background: var(--border); }
    .share-page .points { text-align: left; max-width: 34em; margin: 20px auto; }
    .share-page .code { font-size: 28px; font-weight: 900; letter-spacing: 4px; color: var(--accent-dark); }
    .share-page .muted { color: var(--muted); }
    .formats { display: flex; justify-content: center; gap: 8px; margin: 16px 0; }
    .formats button { font: inherit; font-weight: 700; padding: 8px 16px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
    .formats button[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
    .hero #preview { width: auto; height: auto; max-width: 100%; max-height: 70vh; border-radius: 18px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
    .share-page h1 { overflow-wrap: anywhere; }
    .formats { flex-wrap: wrap; }
    .cta button.button { border: 0; font: inherit; font-weight: 700; cursor: pointer; }
    .review { max-width: 32em; margin: 16px auto; padding: 16px 18px; border-radius: 18px; background: #fef3c7; color: #78350f; border: 2px solid #f59e0b; text-align: center; }
    .review p { margin: 0 0 12px; font-size: 17px; line-height: 1.4; }
    .review .button { display: inline-block; font-size: 19px; padding: 14px 26px; }
    @media (prefers-color-scheme: dark) { .review { background: #422006; color: #fde68a; } }
    [hidden] { display: none !important; }
${css}  </style>
</head>
<body>
  <!-- Page générée par scripts/build-share-pages.cjs : ne pas modifier à la main -->
  <header class="top">
    <div class="wrap">
      <a class="brand" href="/"><img src="/icon.png" alt="">PasseRyder</a>
      <nav>
        <a href="https://app.passeryder.fr">App web</a>
        <a href="/guide">Guide</a>
      </nav>
    </div>
  </header>
`;

const foot = `
  <footer>
    <div class="wrap">
      <span>© 2026 DK Tech Lab</span>
      <a href="/guide">Guide</a>
      <a href="/conditions">Conditions d'utilisation</a>
      <a href="/confidentialite">Politique de confidentialité</a>
      <a href="/mentions-legales">Mentions légales</a>
      <a href="mailto:passeryder@gmail.com">passeryder@gmail.com</a>
    </div>
  </footer>
`;

const common = `
    // Clé publishable Supabase (publique, la même que dans l'app web)
    var SUPABASE_URL = '${SUPABASE_URL}';
    var SUPABASE_KEY = '${KEY}';
    // Tous les boutons « Télécharger » mènent à /telecharger (étapes du test fermé ou Google Play)
    var DOWNLOAD = 'https://passeryder.fr/telecharger';
    var android = /android/i.test(navigator.userAgent);
    function rpc(name, body) {
      return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    function photo(path) { return SUPABASE_URL + '/storage/v1/object/public/photos/' + path; }
    function lastSegment() { return decodeURIComponent(location.pathname.replace(/\\/+$/, '').split('/').pop() || ''); }
    function el(id) { return document.getElementById(id); }
    // Console › Fonctions › Distribution : « Validation Google en cours » (app_settings.google_review = 'on')
    function settings(keys) {
      return fetch(SUPABASE_URL + '/rest/v1/app_settings?select=key,value&key=in.(' + keys.join(',') + ')', { headers: { apikey: SUPABASE_KEY } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { var s = {}; rows.forEach(function (row) { s[row.key] = row.value; }); return s; })
        .catch(function () { return {}; });
    }
    function showReview(on, code) {
      Array.prototype.forEach.call(document.querySelectorAll('.review, .review-only'), function (n) { n.hidden = !on; });
      if (code) Array.prototype.forEach.call(document.querySelectorAll('.review a.button'), function (a) { a.href = 'https://app.passeryder.fr/sign-in?invite=' + code; });
    }
    function intentUrl(appPath, fallback) {
      return 'intent://' + appPath + '#Intent;scheme=passeryder;package=com.passeryder.app;S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
    }
`;

const PITCH = `
        <ul class="points">
          <li>🗺️ Tes potes en direct sur la carte (tu choisis qui te voit)</li>
          <li>🏍️ Balades en convoi : RDV, ouvreur, serre-file, regroupement</li>
          <li>🌀 « Fais-moi une boucle » : des routes sinueuses au départ de chez toi</li>
          <li>🆘 SOS, détection de chute et « Je rentre »</li>
          <li>⚠️ Dangers signalés par les motards, spots et événements</li>
        </ul>`;

const REVIEW = `
      <div class="review" hidden>
        <p>⏳ <strong>L’app Android est en cours de validation par Google (jusqu’à 7 jours).</strong><br>En attendant, utilise PasseRyder sur le web : ton compte restera le même quand l’app sera dispo.</p>
        <a class="button" href="https://app.passeryder.fr">Utiliser la version web</a>
      </div>`;

// ---------- /i/CODE ----------
const invite = `${head('Rejoins-moi sur PasseRyder', 'L’app des motards qui roulent ensemble : potes en direct, balades en convoi, boucles, SOS.')}
  <main class="wrap">
    <section class="hero share-page">
      <img class="avatar" id="avatar" src="/icon.png" alt="">
      <h1 id="title">Rejoins-moi sur PasseRyder</h1>
      <p class="lead">L’app des motards qui aiment rouler ensemble.</p>
      ${REVIEW}
      ${PITCH}
      <p id="code-box" hidden>Ton code d’invitation : <span class="code" id="code"></span><br>
        <span class="muted">Saisis-le à l’inscription : vous serez amis tout de suite.</span></p>
      <div class="cta">
        <a class="button" id="play" href="/telecharger">Télécharger l’app</a>
        <a class="button secondary" id="web" href="https://app.passeryder.fr/sign-in">Utiliser la version web</a>
      </div>
      <p class="note">Gratuit. Pas de publicité, données hébergées en Europe.</p>
    </section>
  </main>
${foot}
  <script>
${common}
    var code = lastSegment().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z0-9]{6,10}$/.test(code)) {
      el('play').href = '/telecharger?invite=' + code;
      el('web').href = 'https://app.passeryder.fr/sign-in?invite=' + code;
      el('code').textContent = code;
      el('code-box').hidden = false;
      settings(['google_review']).then(function (s) { showReview(s.google_review === 'on', code); });
      rpc('invite_info', { p_code: code }).then(function (i) {
        if (!i) return;
        el('title').textContent = '@' + i.username + ' t’invite sur PasseRyder';
        document.title = '@' + i.username + ' t’invite sur PasseRyder';
        if (i.avatar_path) el('avatar').src = photo(i.avatar_path);
      }).catch(function () {});
    } else settings(['google_review']).then(function (s) { showReview(s.google_review === 'on'); });
  </script>
</body>
</html>
`;

// ---------- /c/SLUG ----------
const club = `${head('Club PasseRyder', 'Rejoins ce club de motards sur PasseRyder : balades, événements et sorties ensemble.')}
  <main class="wrap">
    <section class="hero share-page">
      <img class="avatar" id="logo" src="/icon.png" alt="">
      <h1 id="name">Club PasseRyder</h1>
      <p class="lead" id="meta"></p>
      <p id="desc" class="muted" style="white-space: pre-line"></p>
      <p id="missing" hidden>Ce club n’existe plus ou n’est pas visible.</p>
      ${REVIEW}
      <div class="cta">
        <a class="button" id="open" href="#">Rejoindre dans l’app</a>
        <a class="button secondary" id="web" href="https://app.passeryder.fr">Voir dans la version web</a>
        <a class="button secondary" id="play" href="/telecharger">Télécharger l’app</a>
      </div>
      ${PITCH}
    </section>
  </main>
${foot}
  <script>
${common}
    var slug = lastSegment().toLowerCase();
    if (!android) el('open').hidden = true;
    // Pendant la validation Google, l'app n'est pas encore installable : la version web d'abord
    settings(['google_review']).then(function (s) {
      var on = s.google_review === 'on';
      showReview(on);
      if (on) { el('open').hidden = true; el('play').hidden = true; }
    });
    rpc('club_public', { p_slug: slug }).then(function (c) {
      if (!c) { el('missing').hidden = false; el('open').hidden = true; return; }
      el('name').textContent = c.name;
      document.title = c.name + ' · club PasseRyder';
      var meta = [c.city, c.members + ' membre' + (c.members > 1 ? 's' : ''), c.join_policy === 'open' ? 'club public' : 'adhésion sur demande'];
      el('meta').textContent = meta.filter(Boolean).join(' · ');
      el('desc').textContent = (c.description || '') + (c.founder ? '\\n\\nFondé par @' + c.founder : '');
      if (c.logo_path) el('logo').src = photo(c.logo_path);
      el('web').href = 'https://app.passeryder.fr/club/' + c.id;
      el('open').addEventListener('click', function (e) { e.preventDefault(); location.href = intentUrl('club/' + c.id, DOWNLOAD); });
    }).catch(function () { el('missing').hidden = false; });
  </script>
</body>
</html>
`;

// ---------- /s/ID ----------
const outing = `${head('Sortie à moto · PasseRyder', 'Une sortie à moto partagée avec PasseRyder.')}
  <main class="wrap">
    <section class="hero share-page">
      <h1 id="title">Sortie à moto</h1>
      <p class="lead" id="meta"></p>
      <p id="missing" hidden>Ce récap n’existe plus.</p>
      <div id="tools" hidden>
        <div class="formats">
          <button type="button" id="f-story" aria-pressed="true">Story (1080×1920)</button>
          <button type="button" id="f-square" aria-pressed="false">Carré (1080×1080)</button>
        </div>
        <img id="preview" alt="Image de la sortie">
        <div class="cta" style="margin-top: 16px">
          <button class="button" type="button" id="share" hidden>Partager l’image</button>
          <a class="button secondary" id="download" download="passeryder-sortie.png" href="#">Télécharger l’image</a>
        </div>
        <p class="note">Départ et arrivée masqués si l’auteur l’a choisi. Aucune vitesse n’est affichée.</p>
      </div>
      <div class="cta" style="margin-top: 24px">
        <a class="button secondary" id="play" href="/telecharger">Découvrir PasseRyder</a>
      </div>
    </section>
  </main>
${foot}
  <script>
${common}
    var id = lastSegment();
    var format = new URLSearchParams(location.search).get('format') === 'square' ? 'square' : 'story';
    var data = null;
    var logo = new Image();
    logo.src = '/icon.png';

    var ACCENT = '#0ea5e9', LIGHT = '#7dd3fc', WHITE = '#ffffff', MUTED = '#cbd5e1';
    function km(m) { return (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: m >= 100000 ? 0 : 1 }); }
    function duration(s) {
      var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
      return h > 0 ? h + ' h ' + String(m).padStart(2, '0') : m + ' min';
    }
    function kindLabel(k) { return k === 'ride' ? 'BALADE EN GROUPE' : k === 'loop' ? 'BOUCLE À MOTO' : 'SORTIE À MOTO'; }
    function dateLabel(iso) { return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function wrap(ctx, text, maxW, maxLines) {
      var words = text.split(' '), lines = [], line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
      });
      if (line) lines.push(line);
      if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
      return lines;
    }
    // Tracé projeté (Mercator) dans un cadre, avec halo bleu et trait blanc
    function drawTrack(ctx, track, x, y, w, h, hideEnds) {
      var pts = track.map(function (p) {
        var lat = p[0] * Math.PI / 180;
        return [p[1], Math.log(Math.tan(Math.PI / 4 + lat / 2)) * 180 / Math.PI];
      });
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      var sx = (maxX - minX) || 1e-6, sy = (maxY - minY) || 1e-6, s = Math.min(w / sx, h / sy);
      var ox = x + (w - sx * s) / 2, oy = y + (h - sy * s) / 2;
      var xy = pts.map(function (p) { return [ox + (p[0] - minX) * s, oy + (maxY - p[1]) * s]; });
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.save(); ctx.shadowColor = ACCENT; ctx.shadowBlur = 40; ctx.strokeStyle = ACCENT; ctx.lineWidth = 18;
      ctx.beginPath(); xy.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 7;
      ctx.beginPath(); xy.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      [xy[0], xy[xy.length - 1]].forEach(function (p, i) {
        ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, Math.PI * 2);
        if (hideEnds) { ctx.strokeStyle = WHITE; ctx.lineWidth = 5; ctx.stroke(); }
        else { ctx.fillStyle = i ? '#f97316' : '#22c55e'; ctx.fill(); ctx.strokeStyle = WHITE; ctx.lineWidth = 5; ctx.stroke(); }
      });
    }
    function stats(d) {
      var s = [{ v: km(d.distance_m), l: 'km' }, { v: duration(d.duration_s), l: 'durée' }];
      if (d.elevation_gain_m != null) s.push({ v: d.elevation_gain_m.toLocaleString('fr-FR') + ' m', l: 'dénivelé +' });
      if (d.participants) s.push({ v: String(d.participants), l: 'motards' });
      else if (d.points) s.push({ v: '+' + d.points, l: 'points gagnés' });
      return s.slice(0, 4);
    }
    function background(ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b1120'); g.addColorStop(0.55, '#0c2a45'); g.addColorStop(1, '#075985');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var r = ctx.createRadialGradient(w * 0.8, h * 0.15, 10, w * 0.8, h * 0.15, w * 0.9);
      r.addColorStop(0, 'rgba(14,165,233,0.35)'); r.addColorStop(1, 'rgba(14,165,233,0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, w, h);
    }
    function brand(ctx, x, y, size) {
      if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, x, y, size, size);
      ctx.fillStyle = WHITE; ctx.font = '900 ' + Math.round(size * 0.55) + 'px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText('PasseRyder', x + size + 20, y + size / 2);
    }
    function extras(d) {
      var parts = [];
      if (d.points && d.participants) parts.push('🛡️ +' + d.points + ' points');
      (d.badges || []).forEach(function (b) { parts.push('🏅 ' + b.replace(/^\\S+\\s/, '')); });
      return parts.join('   ·   ');
    }
    function render() {
      var d = data, story = format === 'story', W = 1080, H = story ? 1920 : 1080;
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var ctx = c.getContext('2d');
      background(ctx, W, H);
      ctx.textBaseline = 'alphabetic';
      if (story) {
        brand(ctx, 80, 80, 96);
        ctx.textAlign = 'left'; ctx.fillStyle = LIGHT; ctx.font = '800 34px system-ui, sans-serif';
        ctx.fillText(kindLabel(d.kind), 80, 290);
        ctx.fillStyle = WHITE; ctx.font = '900 68px system-ui, sans-serif';
        var lines = wrap(ctx, d.title, W - 160, 2);
        lines.forEach(function (l, i) { ctx.fillText(l, 80, 372 + i * 78); });
        ctx.fillStyle = MUTED; ctx.font = '500 34px system-ui, sans-serif';
        ctx.fillText(dateLabel(d.started_at) + ' · @' + d.username, 80, 372 + lines.length * 78 + 10);
        drawTrack(ctx, d.track, 110, 600, W - 220, 700, d.hide_ends);
        var s = stats(d), tw = (W - 160 - 30) / 2, th = 170;
        s.forEach(function (t, i) {
          var x = 80 + (i % 2) * (tw + 30), y = 1370 + Math.floor(i / 2) * (th + 30);
          ctx.fillStyle = 'rgba(255,255,255,0.09)'; roundRect(ctx, x, y, tw, th, 28); ctx.fill();
          ctx.textAlign = 'center'; ctx.fillStyle = WHITE; ctx.font = '900 70px system-ui, sans-serif'; ctx.fillText(t.v, x + tw / 2, y + 95);
          ctx.fillStyle = MUTED; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText(t.l, x + tw / 2, y + 140);
        });
        var ex = extras(d);
        if (ex) { ctx.textAlign = 'center'; ctx.fillStyle = WHITE; ctx.font = '700 32px system-ui, sans-serif'; ctx.fillText(ex, W / 2, 1790); }
        ctx.textAlign = 'center'; ctx.fillStyle = LIGHT; ctx.font = '900 44px system-ui, sans-serif'; ctx.fillText('passeryder.fr', W / 2, 1860);
      } else {
        brand(ctx, 60, 50, 72);
        ctx.textAlign = 'left'; ctx.fillStyle = LIGHT; ctx.font = '800 28px system-ui, sans-serif'; ctx.fillText(kindLabel(d.kind), 60, 185);
        ctx.fillStyle = WHITE; ctx.font = '900 52px system-ui, sans-serif';
        var l2 = wrap(ctx, d.title, W - 120, 1); ctx.fillText(l2[0], 60, 248);
        ctx.fillStyle = MUTED; ctx.font = '500 28px system-ui, sans-serif'; ctx.fillText(dateLabel(d.started_at) + ' · @' + d.username, 60, 292);
        drawTrack(ctx, d.track, 70, 340, 560, 620, d.hide_ends);
        var s2 = stats(d), y0 = 350;
        s2.forEach(function (t, i) {
          var y = y0 + i * 150;
          ctx.fillStyle = 'rgba(255,255,255,0.09)'; roundRect(ctx, 680, y, 340, 130, 24); ctx.fill();
          ctx.textAlign = 'center'; ctx.fillStyle = WHITE; ctx.font = '900 54px system-ui, sans-serif'; ctx.fillText(t.v, 850, y + 70);
          ctx.fillStyle = MUTED; ctx.font = '600 24px system-ui, sans-serif'; ctx.fillText(t.l, 850, y + 108);
        });
        ctx.textAlign = 'right'; ctx.fillStyle = LIGHT; ctx.font = '900 36px system-ui, sans-serif'; ctx.fillText('passeryder.fr', W - 60, H - 50);
      }
      var url = c.toDataURL('image/png');
      el('preview').src = url;
      el('download').href = url;
      el('download').download = 'passeryder-sortie-' + format + '.png';
      el('share').onclick = function () {
        c.toBlob(function (blob) {
          var file = new File([blob], 'passeryder-sortie.png', { type: 'image/png' });
          navigator.share({ files: [file], title: d.title, text: 'Ma sortie à moto avec PasseRyder · passeryder.fr' }).catch(function () {});
        }, 'image/png');
      };
      try {
        el('share').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }));
      } catch (e) { el('share').hidden = true; }
    }
    function setFormat(f) {
      format = f;
      el('f-story').setAttribute('aria-pressed', String(f === 'story'));
      el('f-square').setAttribute('aria-pressed', String(f === 'square'));
      if (data) render();
    }
    el('f-story').addEventListener('click', function () { setFormat('story'); });
    el('f-square').addEventListener('click', function () { setFormat('square'); });
    rpc('get_outing', { p_id: id }).then(function (d) {
      if (!d) { el('missing').hidden = false; return; }
      data = d;
      el('title').textContent = d.title;
      document.title = d.title + ' · PasseRyder';
      el('meta').textContent = km(d.distance_m) + ' km · ' + duration(d.duration_s) + ' · par @' + d.username;
      el('tools').hidden = false;
      setFormat(format);
      // Le logo peut arriver après le premier dessin
      if (!logo.complete) logo.onload = render;
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    }).catch(function () { el('missing').hidden = false; });
  </script>
</body>
</html>
`;

// ---------- /telecharger ----------
// Liens par défaut = réglages de la console au moment de l'écriture ; la page relit app_settings
// (Console › Fonctions › Distribution) : passer en « public » ne laisse que l'étape Google Play.
const GROUP_URL = 'https://groups.google.com/g/passeryder-testeurs';
const TESTING_URL = 'https://play.google.com/apps/testing/com.passeryder.app';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.passeryder.app';

const downloadCss = `
    .dl .hero { padding-bottom: 8px; }
    .dl .hero img.logo { width: 96px; height: 96px; border-radius: 22px; box-shadow: 0 12px 32px rgb(14 165 233 / 30%); }
    .dl .hero h1 { font-size: clamp(30px, 8vw, 42px); }
    .dl section.part { margin: 24px 0; }
    .dl h2 { font-size: 21px; margin: 0 0 12px; text-align: center; }
    .steps-dl { display: grid; gap: 12px; margin: 0 auto; max-width: 30em; }
    a.step { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 18px; background: var(--accent); color: #fff; text-decoration: none; box-shadow: 0 6px 18px rgb(14 165 233 / 25%); }
    a.step .num { flex: 0 0 44px; height: 44px; border-radius: 50%; background: #fff; color: #0369a1; display: grid; place-items: center; font-weight: 900; font-size: 22px; }
    a.step strong { display: block; font-size: 19px; line-height: 1.25; }
    a.step small { display: block; font-size: 14px; opacity: .9; }
    a.step.done { background: var(--surface); color: var(--text); border: 1px solid var(--border); box-shadow: none; }
    a.step.done .num { background: var(--accent); color: #fff; }
    .pending a.step { opacity: .55; box-shadow: none; }
    .dl .tip { text-align: center; color: var(--muted); font-size: 15px; margin: 12px auto 0; max-width: 32em; }
    .dl .card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px; max-width: 30em; margin: 0 auto; text-align: center; }
    .dl .card ol { text-align: left; margin: 12px 0 0; padding-left: 22px; }
    .dl .qr { width: 220px; height: 220px; border-radius: 14px; background: #fff; }
    .dl .code { font-size: 26px; font-weight: 900; letter-spacing: 4px; color: var(--accent-dark); }
    .dl .muted { color: var(--muted); }
    .dl .feats { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 10px; }
    .dl .feats li { display: flex; gap: 12px; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; font-size: 16px; line-height: 1.35; }
    .dl .feats .ico { font-size: 26px; flex: 0 0 auto; }
    .dl .shots { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 0 12px; justify-content: safe center; }
    .dl .shots img { flex: 0 0 auto; width: min(62vw, 220px); aspect-ratio: 9 / 16; height: auto; border-radius: 18px; border: 1px solid var(--border); scroll-snap-align: center; background: var(--border); }
    .dl .facts { text-align: center; font-weight: 700; margin: 20px 0 6px; }
    .dl .safety { text-align: center; color: var(--danger); font-weight: 700; margin: 0 0 8px; }
`;

const download = `${head('Télécharger PasseRyder', 'L’app des motards qui roulent ensemble : potes en direct, balades en convoi, boucles sinueuses, SOS. Gratuit, sans pub.', { index: true, image: 'https://passeryder.fr/telecharger/partage.png', css: downloadCss })}
  <main class="wrap dl">
    <section class="hero">
      <img class="logo" src="/icon.png" alt="Logo PasseRyder" width="96" height="96">
      <h1>PasseRyder</h1>
      <p class="lead">L’app des motards qui roulent ensemble</p>
      <p id="code-box" hidden>Ton code d’invitation : <span class="code" id="code"></span><br>
        <span class="muted">Saisis-le à l’inscription : vous serez amis tout de suite.</span></p>
    </section>

    <section class="part" id="desktop" hidden>
      <div class="card">
        <img class="qr" src="/telecharger/qr.png" alt="QR code vers passeryder.fr/telecharger" width="220" height="220">
        <p><strong>Scanne ce QR code avec ton téléphone</strong><br><span class="muted">ou ouvre passeryder.fr/telecharger dessus</span></p>
      </div>
    </section>

    <section class="part" id="android">
      <h2 id="android-title">Sur Android</h2>
      ${REVIEW}
      <p class="tip review-only" hidden><strong>Disponible dès la validation :</strong></p>
      <div class="steps-dl">
        <a class="step test-only" id="s1" href="${GROUP_URL}" target="_blank" rel="noopener">
          <span class="num">1</span><span><strong>Rejoins le groupe des testeurs</strong><small>Bouton « Rejoindre le groupe », puis reviens ici</small></span></a>
        <a class="step test-only" id="s2" href="${TESTING_URL}" target="_blank" rel="noopener">
          <span class="num">2</span><span><strong>Active le test</strong><small>Bouton « Devenir testeur »</small></span></a>
        <a class="step" id="s3" href="${PLAY_URL}" target="_blank" rel="noopener">
          <span class="num" id="n3">3</span><span><strong>Installe PasseRyder</strong><small>Sur Google Play, bouton « Installer »</small></span></a>
      </div>
      <p class="tip test-only">Utilise le même compte Google que ton Play Store. L’app est en test : si Google Play ne la trouve pas tout de suite, attends quelques minutes après l’étape 2.</p>
    </section>

    <section class="part" id="ios">
      <h2>Sur iPhone</h2>
      <div class="card">
        <p style="margin-top: 0">Version iPhone bientôt disponible. En attendant, utilise PasseRyder sur le web.</p>
        <a class="button" id="web" href="https://app.passeryder.fr">Ouvrir app.passeryder.fr</a>
        <ol>
          <li>Ouvre app.passeryder.fr dans <strong>Safari</strong>.</li>
          <li>Touche <strong>Partager</strong> (le carré avec une flèche vers le haut).</li>
          <li>Choisis <strong>« Sur l’écran d’accueil »</strong>, puis <strong>Ajouter</strong>.</li>
        </ol>
      </div>
    </section>

    <section class="part">
      <h2>Ce que fait PasseRyder</h2>
      <ul class="feats">
        <li><span class="ico">🗺️</span>Carte en direct avec tes potes (tu choisis qui te voit)</li>
        <li><span class="ico">🏍️</span>Balades et convoi avec ouvreur et serre-file</li>
        <li><span class="ico">🌀</span>Boucles sinueuses et itinéraire Plaisir</li>
        <li><span class="ico">🆘</span>SOS, détection de chute et « Je rentre »</li>
        <li><span class="ico">☕</span>Spots, événements et clubs</li>
        <li><span class="ico">🏅</span>Points de bon comportement</li>
      </ul>
    </section>

    <section class="part">
      <div class="shots">
        <img src="/telecharger/capture-1-carte.jpg" alt="La carte en direct" width="540" height="960" loading="lazy">
        <img src="/telecharger/capture-2-sorties.jpg" alt="Les sorties : balades, événements, lieux" width="540" height="960" loading="lazy">
        <img src="/telecharger/capture-3-balade-carte.jpg" alt="Une balade sur la carte" width="540" height="960" loading="lazy">
      </div>
      <p class="facts">Gratuit · Sans pub · Données hébergées en Europe</p>
      <p class="safety">Ne manipule pas ton téléphone en roulant.</p>
    </section>
  </main>
${foot}
  <script>
${common}
    var ua = navigator.userAgent;
    var device = android ? 'android'
      : (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) ? 'ios' : 'desktop';
    el('desktop').hidden = device !== 'desktop';
    el('android').hidden = device === 'ios';
    el('ios').hidden = device === 'android';
    // Sur le téléphone, une seule section : le titre « Sur Android » est inutile
    if (device === 'android') el('android-title').hidden = true;

    var code = (new URLSearchParams(location.search).get('invite') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z0-9]{6,10}$/.test(code)) {
      el('code').textContent = code;
      el('code-box').hidden = false;
      el('web').href = 'https://app.passeryder.fr/sign-in?invite=' + code;
    }
    var validCode = el('code-box').hidden ? '' : code;

    // Étapes faites (mémorisées sur cet appareil) : le bouton suivant reste mis en avant
    function remember(k) { try { localStorage.setItem(k, '1'); } catch (e) {} }
    function remembered(k) { try { return !!localStorage.getItem(k); } catch (e) { return false; } }
    ['s1', 's2'].forEach(function (id) {
      if (remembered('dl.' + id)) el(id).classList.add('done');
      el(id).addEventListener('click', function () { remember('dl.' + id); el(id).classList.add('done'); });
    });

    // Réglages de la console : mode de distribution et liens
    settings(['distribution_mode', 'testers_group_url', 'testing_optin_url', 'play_store_url', 'google_review'])
      .then(function (s) {
        var review = s.google_review === 'on';
        showReview(review, validCode);
        el('android').classList.toggle('pending', review);
        if (s.testers_group_url) el('s1').href = s.testers_group_url;
        if (s.testing_optin_url) el('s2').href = s.testing_optin_url;
        if (s.play_store_url) el('s3').href = s.play_store_url;
        if (s.distribution_mode === 'public') {
          Array.prototype.forEach.call(document.querySelectorAll('.test-only'), function (n) { n.hidden = true; });
          el('n3').textContent = '↓';
        }
      });
  </script>
</body>
</html>
`;

for (const [dir, html] of [
  ['i', invite],
  ['c', club],
  ['s', outing],
  ['telecharger', download],
]) {
  fs.mkdirSync(path.join(ROOT, 'site', dir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'site', dir, 'index.html'), html);
}
console.log('site/i, site/c, site/s, site/telecharger générés');
