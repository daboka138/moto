// Pages d'arrivée des emails d'authentification sur passeryder.fr :
//   site/email-confirme/  (lien de confirmation d'inscription ou de changement d'email)
//   site/lien-expire/     (lien expiré ou déjà utilisé, avec « Renvoyer l'email de confirmation »)
// Usage : node scripts/build-auth-pages.cjs (lit l'URL et la clé PUBLISHABLE de Supabase dans .env),
// puis republier le site. Jamais de clé secrète ici : la page est publique.
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

const head = (title) => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title} — PasseRyder</title>
  <link rel="icon" href="/favicon.png">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <!-- Page générée par scripts/build-auth-pages.cjs : ne pas modifier à la main -->
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
      <a href="mailto:passeryder@gmail.com">passeryder@gmail.com</a>
    </div>
  </footer>
`;

const common = `
    // Clé publishable Supabase (publique, la même que dans l'app web)
    var SUPABASE_URL = '${SUPABASE_URL}';
    var SUPABASE_KEY = '${KEY}';
    var PLAY = 'https://play.google.com/store/apps/details?id=com.passeryder.app';
    var android = /android/i.test(navigator.userAgent);
    // Android : ouvre l'app (sinon Google Play) ; ailleurs : la version web
    function openApp() {
      if (android) {
        location.href = 'intent://#Intent;scheme=passeryder;package=com.passeryder.app;S.browser_fallback_url=' + encodeURIComponent(PLAY) + ';end';
      } else {
        location.href = 'https://app.passeryder.fr/';
      }
    }
    function auth(endpoint, body) {
      return fetch(SUPABASE_URL + '/auth/v1/' + endpoint, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
    // Android : app + version web ; ailleurs : version web + Google Play
    if (!android) {
      document.getElementById('open-app').textContent = 'Ouvrir la version web';
      var alt = document.getElementById('alt');
      alt.textContent = 'Télécharger sur Google Play';
      alt.href = PLAY;
    }
    document.getElementById('open-app').addEventListener('click', function (e) { e.preventDefault(); openApp(); });
`;

const confirmed = `${head('Email confirmé')}
  <main class="wrap">
    <section class="hero auth-page">
      <div id="loading">
        <h1>⏳</h1>
        <p class="lead">Confirmation de ton adresse…</p>
      </div>
      <div id="ok" hidden>
        <h1>✅ Email confirmé</h1>
        <p class="lead" id="ok-text">C'est tout bon ! Retourne dans l'app PasseRyder et connecte-toi.</p>
      </div>
      <div id="half" hidden>
        <h1>📬 Encore une étape</h1>
        <p class="lead">Première confirmation reçue. Clique aussi sur le lien envoyé à ton autre adresse email pour terminer le changement.</p>
      </div>
      <div class="cta">
        <a class="button" href="#" id="open-app">Ouvrir l'app</a>
        <a class="button secondary" href="https://app.passeryder.fr" id="alt">Ouvrir la version web</a>
      </div>
    </section>
  </main>
${foot}
  <script>
${common}
    var p = new URLSearchParams(location.search);
    var tokenHash = p.get('token_hash');
    var type = p.get('type') === 'email_change' ? 'email_change' : 'email';
    function show(id) {
      ['loading', 'ok', 'half'].forEach(function (x) { document.getElementById(x).hidden = x !== id; });
    }
    if (type === 'email_change') {
      document.getElementById('ok-text').textContent = 'Ta nouvelle adresse email est enregistrée : utilise-la pour te connecter.';
    }
    // Le lien est à usage unique : on le retire de la barre d'adresse
    history.replaceState(null, '', location.pathname);
    if (!tokenHash) {
      show('ok');
    } else {
      // La session renvoyée par Supabase n'est pas gardée : la connexion se fait dans l'app
      auth('verify', { type: type, token_hash: tokenHash })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error('lien refusé');
          show(type === 'email_change' && !res.j.access_token ? 'half' : 'ok');
        })
        .catch(function () { location.replace('/lien-expire?type=' + type); });
    }
  </script>
</body>
</html>
`;

const expired = `${head('Lien expiré')}
  <main class="wrap">
    <section class="hero auth-page">
      <h1>⌛ Lien expiré</h1>
      <p class="lead">Ce lien a expiré (il est valable 1 heure) ou a déjà été utilisé.</p>

      <div class="box" id="email">
        <p>Tu as déjà confirmé ton adresse ? Connecte-toi simplement. Sinon, reçois un nouvel email :</p>
        <form id="resend">
          <input class="guide-search" type="email" id="address" required placeholder="toi@exemple.fr" autocomplete="email" aria-label="Ton email">
          <button class="button" type="submit" id="send">Renvoyer l'email de confirmation</button>
        </form>
        <p class="meta" id="sent" hidden>Si ton adresse attend une confirmation, un nouvel email arrive dans quelques minutes. Pense à regarder dans les spams.</p>
      </div>
      <div class="box" id="recovery" hidden>
        <p>Redemande un lien depuis l'écran de connexion de l'app : <strong>« Mot de passe oublié ? »</strong>.</p>
      </div>
      <div class="box" id="email_change" hidden>
        <p>Refais le changement d'adresse email depuis l'app, puis clique sur le nouveau lien dans l'heure.</p>
      </div>

      <div class="cta">
        <a class="button secondary" href="#" id="open-app">Ouvrir l'app</a>
        <a class="button secondary" href="https://app.passeryder.fr" id="alt">Ouvrir la version web</a>
      </div>
    </section>
  </main>
${foot}
  <script>
${common}
    var type = new URLSearchParams(location.search).get('type');
    if (type === 'recovery' || type === 'email_change') {
      document.getElementById('email').hidden = true;
      document.getElementById(type).hidden = false;
    }
    document.getElementById('resend').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('send');
      btn.disabled = true;
      // Même réponse que le compte existe ou non ; seule la limite d'envoi est signalée
      auth('resend', { type: 'signup', email: document.getElementById('address').value.trim() })
        .then(function (r) {
          if (r.status === 429) {
            alert('Trop de demandes. Réessaie dans quelques minutes.');
            btn.disabled = false;
            return;
          }
          document.getElementById('resend').hidden = true;
          document.getElementById('sent').hidden = false;
        })
        .catch(function () {
          alert('Envoi impossible. Vérifie ta connexion et réessaie.');
          btn.disabled = false;
        });
    });
  </script>
</body>
</html>
`;

for (const [dir, html] of [['email-confirme', confirmed], ['lien-expire', expired]]) {
  fs.mkdirSync(path.join(ROOT, 'site', dir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'site', dir, 'index.html'), html);
}
console.log('site/email-confirme et site/lien-expire générés');
