// Génère site/guide/index.html depuis src/guide/contenu.ts (même contenu que l'Aide de l'app).
// Usage : npm run guide:build, puis republier le site (commande tar de PLAY_STORE.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FAQ, FICHES, SUPPORT_EMAIL, THEMES, fichesOfTheme } from '../src/guide/contenu.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'guide', 'index.html');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Texte échappé + liens vers passeryder.fr / app.passeryder.fr
const rich = (s) =>
  esc(s).replace(/\b((?:app\.)?passeryder\.fr(?:\/[\w-]+)?)/g, (m) => `<a href="https://${m}">${m}</a>`);
const fold = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');

const list = (items, tag = 'ul', cls = '') =>
  `<${tag}${cls ? ` class="${cls}"` : ''}>${items.map((i) => `<li>${rich(i)}</li>`).join('')}</${tag}>`;

function fiche(f) {
  const search = fold([f.titre, f.but, ...f.etapes, ...(f.astuces ?? []), ...(f.limites ?? []), ...(f.motsCles ?? [])].join(' '));
  return `
      <article class="fiche" id="${f.id}" data-search="${esc(search)}">
        <h3>${f.emoji} ${esc(f.titre)}${f.android ? ' <span class="tag">📱 App Android</span>' : ''}</h3>
        <p class="but">${rich(f.but)}</p>
        <h4>Comment faire</h4>
        ${list(f.etapes, 'ol', 'steps')}
        ${f.astuces?.length ? `<h4>💡 Astuces</h4>${list(f.astuces)}` : ''}
        ${f.limites?.length ? `<h4>⚠️ À savoir</h4>${list(f.limites)}` : ''}
        ${f.android && f.web ? `<p class="web-note">💻 ${rich(f.web)}</p>` : ''}
      </article>`;
}

const toc = THEMES.map(
  (t) =>
    `<li><a href="#theme-${t.id}">${t.emoji} ${esc(t.titre)}</a> : ${fichesOfTheme(t.id)
      .map((f) => `<a href="#${f.id}">${esc(f.titre)}</a>`)
      .join(' · ')}</li>`,
).join('\n          ');

const themes = THEMES.map(
  (t) => `
    <section class="theme" id="theme-${t.id}">
      <h2>${t.emoji} ${esc(t.titre)}</h2>
      <p class="meta">${esc(t.intro)}</p>
      ${fichesOfTheme(t.id).map(fiche).join('')}
    </section>`,
).join('');

const faq = FAQ.map(
  (q) => `
      <details class="faq" data-search="${esc(fold([q.q, ...q.r].join(' ')))}">
        <summary>${esc(q.q)}</summary>
        ${list(q.r)}
        ${(q.fiches ?? [])
          .map((id) => FICHES.find((f) => f.id === id))
          .filter(Boolean)
          .map((f) => `<a href="#${f.id}">${f.emoji} ${esc(f.titre)} ›</a>`)
          .join(' ')}
      </details>`,
).join('');

const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Aide PasseRyder')}&body=${encodeURIComponent(
  'Bonjour,\n\nMon souci (ce que je faisais, ce qui s’est passé) :\n\n\n—\nVersion de l’app :\nTéléphone :\n',
)}`;

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Guide d'utilisation — PasseRyder</title>
  <meta name="description" content="Guide d'utilisation de PasseRyder : carte en direct, navigation, balades, convoi, sécurité (SOS, chute, Je rentre), vie privée. Une fiche par fonction et une FAQ.">
  <link rel="icon" href="/favicon.png">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <!-- Page générée par scripts/build-guide.mjs depuis src/guide/contenu.ts : ne pas modifier à la main -->
  <header class="top">
    <div class="wrap">
      <a class="brand" href="/"><img src="/icon.png" alt="">PasseRyder</a>
      <nav>
        <a href="https://app.passeryder.fr">App web</a>
        <a href="/guide">Guide</a>
        <a href="/conditions">Conditions</a>
        <a href="/confidentialite">Confidentialité</a>
        <a href="/mentions-legales">Mentions légales</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <article class="guide">
      <h1>Guide d'utilisation</h1>
      <p class="meta">Tout PasseRyder en fiches courtes. Les fonctions marquées <span class="tag">📱 App Android</span> sont réservées à l'app Android ; le reste marche aussi sur <a href="https://app.passeryder.fr">app.passeryder.fr</a>.</p>

      <input class="guide-search" type="search" id="q" placeholder="Rechercher : convoi, SOS, GPX…" autocomplete="off" aria-label="Rechercher dans le guide">
      <p class="meta" id="empty" hidden>Rien trouvé. Essaie un autre mot, ou <a href="${esc(mail)}">écris-nous</a>.</p>

      <nav class="toc box" id="toc">
        <ul>
          ${toc}
          <li><a href="#faq">❓ Questions fréquentes</a></li>
        </ul>
      </nav>
${themes}
      <section class="theme" id="faq">
        <h2>❓ Questions fréquentes</h2>
${faq}
      </section>

      <div class="box support">
        <h2>✉️ Besoin d'aide ?</h2>
        <p>Écris-nous à <a href="${esc(mail)}">${SUPPORT_EMAIL}</a>. Dans l'app : Aide › « Contacter le support » ajoute toute seule la version de l'app et le modèle de ton téléphone.</p>
      </div>
    </article>
  </main>

  <footer>
    <div class="wrap">
      <span>© 2026 DK Tech Lab</span>
      <a href="/guide">Guide</a>
      <a href="/conditions">Conditions d'utilisation</a>
      <a href="/confidentialite">Politique de confidentialité</a>
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/supprimer-mon-compte">Supprimer mon compte</a>
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </div>
  </footer>

  <script>
    // Recherche : tous les mots doivent être présents (sans accents ni majuscules)
    (function () {
      var q = document.getElementById('q');
      var fold = function (s) { return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[’']/g, ' '); };
      q.addEventListener('input', function () {
        var words = fold(q.value).split(/\\s+/).filter(function (w) { return w.length > 1; });
        var any = false;
        document.querySelectorAll('[data-search]').forEach(function (el) {
          var hit = words.every(function (w) { return el.dataset.search.indexOf(w) >= 0; });
          el.hidden = !hit;
          if (hit) any = true;
          if (el.tagName === 'DETAILS') el.open = words.length > 0 && hit;
        });
        document.querySelectorAll('section.theme').forEach(function (s) {
          s.hidden = words.length > 0 && !s.querySelector('[data-search]:not([hidden])');
        });
        document.getElementById('toc').hidden = words.length > 0;
        document.getElementById('empty').hidden = words.length === 0 || any;
      });
    })();
  </script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`site/guide/index.html : ${FICHES.length} fiches, ${FAQ.length} questions`);
