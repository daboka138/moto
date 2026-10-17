# Publication sur Google Play — PasseRyder

Développeur : **DK Tech Lab** (compte Play Console : dktechlabweb@gmail.com)
Contact de l'app : **passeryder@gmail.com** — site : **https://passeryder.fr**
Identifiant : `com.passeryder.app` — étapes : test interne → test fermé → production.

Fichiers prêts dans le dépôt :
- `store/icon-512.png` (icône 512 × 512) et `store/feature-graphic-1024x500.png` (bannière)
- `site/` : site passeryder.fr (accueil, `/conditions`, `/confidentialite`, `/mentions-legales`, `/supprimer-mon-compte`), en ligne sur le VPS
- `eas.json` : profil `production` (AAB, canal `production`) + `submit.production` (piste `internal`, version brouillon)

---

## 1. Site passeryder.fr — ✅ en ligne depuis le 26/09/2026

- VPS Debian + Caddy 2.11 : `187.6.165.249` (le même que comptaeasy.fr), accès `ssh root@187.6.165.249` par clé
- DNS OVH : A `@` et `www` → `187.6.165.249` (pas d'AAAA). Certificats HTTPS automatiques (Caddy / Let's Encrypt)
- Fichiers : `/var/www/passeryder` (propriétaire `caddy`), copie du dossier `site/` du dépôt
- URL : https://passeryder.fr, https://passeryder.fr/conditions, https://passeryder.fr/confidentialite, https://passeryder.fr/mentions-legales, https://passeryder.fr/supprimer-mon-compte
  (`/confidentialite` redirige vers `/confidentialite/`, `www.passeryder.fr` redirige vers `passeryder.fr`)

### 1.1 Republier le site après une modification
Depuis Git Bash, dans `C:projetsmoto` :
```bash
tar -C site -cf - . | ssh root@187.6.165.249 'tar -C /var/www/passeryder --no-same-owner -xf - && chown -R caddy:caddy /var/www/passeryder'
```
Pas besoin de recharger Caddy pour un simple changement de fichiers.

### 1.2 Bloc Caddy en place
Pages de partage (générées par `node scripts/build-share-pages.cjs`, clé publishable seulement) : réécriture `@share` ajoutée le 15/10/2026 (sauvegarde `/etc/caddy/Caddyfile.bak-note12`).
À la fin de `/etc/caddy/Caddyfile`, après le bloc comptaeasy.fr (inchangé) ; sauvegarde de l'ancienne version : `/etc/caddy/Caddyfile.bak-*`.
```caddy
passeryder.fr {
    root * /var/www/passeryder
    encode zstd gzip
    # Pages de partage : /i/CODE (invitation), /c/SLUG (club), /s/ID (sortie) → site/i, site/c, site/s
    @share path_regexp share ^/(i|c|s)/[A-Za-z0-9-]+/?$
    rewrite @share /{re.share.1}/index.html
    file_server
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}

www.passeryder.fr {
    redir https://passeryder.fr{uri} permanent
}
```
Après toute modification du Caddyfile, toujours valider avant de recharger (un Caddyfile invalide n'est pas chargé, mais autant le savoir tout de suite) :
```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
```

### 1.4 Version web (PWA) : app.passeryder.fr
- DNS OVH (zone **passeryder.fr**) : enregistrement **A** `app` → `187.6.165.249` (TTL par défaut, pas d'AAAA). Caddy obtient le certificat HTTPS tout seul dès que le DNS répond
- Fichiers : `/var/www/passeryder-app` (export web de l'app, propriétaire `caddy`) ; la version précédente reste dans `/var/www/passeryder-app.old` (retour arrière : inverser les deux dossiers)
- Construire puis publier, depuis Git Bash dans `C:\projets\moto` (`web:build` écrit aussi `dist/version.json` : les onglets ouverts proposent « Recharger ») :
```bash
npm run web:build
tar -C dist -cf - . | ssh root@187.6.165.249 'set -e; rm -rf /var/www/passeryder-app.new; mkdir -p /var/www/passeryder-app.new; tar -C /var/www/passeryder-app.new --no-same-owner -xf -; chown -R caddy:caddy /var/www/passeryder-app.new; rm -rf /var/www/passeryder-app.old; if [ -d /var/www/passeryder-app ]; then mv /var/www/passeryder-app /var/www/passeryder-app.old; fi; mv /var/www/passeryder-app.new /var/www/passeryder-app'
```
- Bloc Caddy (à la fin du Caddyfile) :
```caddy
app.passeryder.fr {
    root * /var/www/passeryder-app
    encode zstd gzip
    @static path /_expo/* /assets/*
    header @static Cache-Control "public, max-age=31536000, immutable"
    @dynamic not path /_expo/* /assets/*
    header @dynamic Cache-Control "no-cache"
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(self), camera=(self), microphone=(self)"
        -Server
    }
    try_files {path} /index.html
    file_server
}
```
- Supabase › Authentication › URL Configuration : ajouter `https://app.passeryder.fr` aux Redirect URLs (liens des emails)
- MapTiler : si la clé est limitée à certains domaines, ajouter `app.passeryder.fr`

### 1.3 À faire : passeryder.com
Le DNS de passeryder.com ne pointe pas encore vers le VPS, il n'est donc pas dans le Caddyfile.
1. OVH › **passeryder.com** › Zone DNS : A `@` → `187.6.165.249`, CNAME `www` → `passeryder.com.` ; supprimer les A / AAAA / CNAME par défaut d'OVH sur `@` et `www`.
2. Quand `nslookup passeryder.com` renvoie `187.6.165.249`, remplacer sur le VPS la ligne `www.passeryder.fr {`
   par `www.passeryder.fr, passeryder.com, www.passeryder.com {`, puis valider et recharger (commande ci-dessus).

---

## 2. Préparer EAS pour la production (une seule fois)

### 2.1 Variables Supabase de l'environnement `production`
Le profil `production` utilise l'environnement EAS `production` (pas `preview`) :
```powershell
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://yfewldnhnnrzzscmfjsd.supabase.co" --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "COLLE_ICI_LA_CLE_PUBLISHABLE" --environment production --visibility plaintext
eas env:list --environment production
```

### 2.2 Compte de service Google (pour `eas submit`)
1. https://console.cloud.google.com › crée un projet « PasseRyder » › **API et services › Bibliothèque** › active **Google Play Android Developer API**.
2. **IAM et administration › Comptes de service** › Créer (nom : `eas-submit`) › onglet **Clés** › Ajouter une clé › JSON.
3. Enregistre le fichier sous `C:\projets\moto\google-service-account.json` (déjà ignoré par Git : **ne jamais le commiter ni l'envoyer**).
4. Play Console › **Utilisateurs et autorisations** › Inviter un utilisateur › l'email du compte de service (`eas-submit@….iam.gserviceaccount.com`)
   › Autorisations de l'application PasseRyder : **Publier sur les canaux de test**, **Publier en production…**, **Gérer les versions**.

---

## 3. Commandes à lancer (PowerShell, dans `C:\projets\moto`)

### 3.0 Version 1.2.0 : étapes exactes
Nouveautés natives depuis l'APK 1.1.0 : nouvelle icône adaptative + monochrome, nouveau splash, expo-contacts
(« Choisir dans mes contacts »). `runtimeVersion` suit la version (`policy: appVersion`) : le build 1.2.0 ne reçoit
**que** les mises à jour publiées pour 1.2.0, jamais celles de la 1.1.0 (et inversement).
1. Vérifier les variables de l'environnement EAS `production` : `eas env:list --environment production` (§ 2.1).
2. Lancer le build (AAB signé, versionCode incrémenté par EAS ; ne pas toucher au keystore, EAS le garde) :
   ```powershell
   eas build --platform android --profile production
   ```
3. Build terminé : expo.dev › projet moto › Builds › le build 1.2.0 › **Download** (fichier `.aab`).
4. Play Console › PasseRyder › Tester et publier › **Tests internes** › **Créer une version** › importer le `.aab`
   (première version : accepter la **signature d'application par Google Play**).
5. Notes de version (fr-FR), par exemple : « Nouvelle icône, guide d'utilisation, mot de passe oublié, contact d'urgence choisi dans le répertoire. »
6. **Enregistrer** › **Examiner la version** › **Lancer le déploiement en test interne**.
7. Testeurs (§ 4.8) : installer depuis le lien d'inscription, puis vérifier : icône ronde + monochrome (thème Android 13+),
   splash bleu, Paramètres › Contacts d'urgence › « + Ajouter » › **Choisir dans mes contacts** présent.
8. Ensuite, les corrections JavaScript passent par `eas update --channel production --environment production --platform android`.


```powershell
# AAB de production (10 à 20 min) — versionCode incrémenté automatiquement par EAS
eas build -p android --profile production
```
**Première version : envoi à la main** (Google refuse l'envoi par API tant qu'aucune version n'a été importée) :
télécharge le `.aab` depuis la page du build (expo.dev › Builds), puis Play Console › Tester et publier › **Tests internes** › Créer une version › importer le `.aab`.
Accepte la **signature d'application par Google Play** quand elle est proposée.

Versions suivantes :
```powershell
eas build -p android --profile production --auto-submit   # build + envoi en test interne (brouillon)
# ou, pour envoyer un build déjà fait :
eas submit -p android --profile production --latest
```
La version arrive en **brouillon** dans Tests internes : ouvre-la dans la Play Console et clique sur « Publier ».
(Une fois l'app publiée au moins une fois, tu peux passer `releaseStatus` à `completed` dans `eas.json`.)

Mise à jour JavaScript seule (sans nouvelle version Play Store) :
```powershell
eas update --channel production --environment production --platform android --message "Ce qui change"
```
`--platform android` : la version web n'est pas distribuée par EAS Update, elle est déployée sur le VPS (§ 1.4).
Avant chaque `eas update` (et chaque `npm run web:build`) : écrire la nouveauté sur la 1re ligne de `nouveautes.txt`
(200 caractères max). Elle s'affiche dans le bandeau « ✅ Mise à jour prête » de l'app (« Nouveautés : … ») et dans
« Nouvelle version disponible » du web. Ligne vide = pas de « Nouveautés ».
Changement natif (module natif, permissions, icône, nom, SDK) : augmenter `version` dans `app.json` puis nouveau build.

### Passage test interne → fermé → production
- **Tests internes** : jusqu'à 100 testeurs (liste d'emails), dispo en quelques minutes, sans examen.
- **Test fermé** : Tester et publier › Tests fermés › Créer une version (ou « Promouvoir » la version interne). Examen Google.
- **Production** : ⚠️ si le compte DK Tech Lab est un compte **personnel** créé après novembre 2023, Google exige
  un test fermé avec **au moins 12 testeurs inscrits pendant 14 jours d'affilée** avant de pouvoir demander l'accès à la production.
  (Compte **organisation** : pas cette obligation.)

---

## 4. Play Console : tout ce qu'il faut remplir

### 4.1 Créer l'application
| Champ | Réponse |
|---|---|
| Nom de l'application | PasseRyder |
| Langue par défaut | Français (France) – fr-FR |
| Application ou jeu | Application |
| Gratuite ou payante | Gratuite (définitif : une app gratuite ne peut plus devenir payante ; l'abonnement premium restera possible) |
| Déclarations | cocher Règles du programme pour les développeurs + lois américaines sur l'exportation |

### 4.2 Fiche principale du Play Store (Développer la présence › Fiche principale)
**Nom** (30 max) : `PasseRyder`

**Description courte** (80 max) :
```
Tes potes en direct, balades en convoi, boucles, SOS et dangers sur la route.
```

**Description complète** (4000 max) :
```
PasseRyder, c'est l'app des motards qui aiment rouler ensemble.

🗺️ CARTE EN DIRECT
Vois où roulent tes potes en temps réel, avec leur vitesse et leur moto. Tu choisis qui te voit : tout le monde, tes amis, seulement certains, ou personne avec le mode fantôme.

🏍️ BALADES ET CONVOI
Planifie une sortie : tracé, point et heure de rendez-vous, niveau, type de route, motos acceptées. Invite tes amis et discute dans le groupe de la balade. Le jour J, pointe ta présence au RDV, désigne un ouvreur et un serre-file : l'app prévient si quelqu'un décroche, fait une pause ou perd le réseau, et envoie un point de regroupement à tout le groupe.

🌀 FAIS-MOI UNE BOUCLE
Choisis une durée et le niveau de virages (tranquille, sinueux, très sinueux) : l'app te propose 2 ou 3 boucles au départ de chez toi, avec une note de sinuosité. Pars tout de suite ou crée une balade en un geste. Import et export GPX.

🧭 NAVIGATION PENSÉE POUR LA MOTO
Itinéraires Rapide, Sans autoroute ou Petites routes, guidage vocal, limitation de vitesse, arrêts essence et café sur ton trajet. Adapté à ta moto (jamais d'autoroute en 50 cm³). Pour ta sécurité, la saisie de texte est bloquée quand tu roules.

🌦️ MÉTÉO SUR LE TRAJET
Pluie, vent ou froid à l'heure où tu passeras : prévenu avant de partir et pendant la route.

🆘 SÉCURITÉ
Bouton SOS (appui long 2 secondes), détection de chute qui alerte tes proches si tu ne réponds pas, et « Je rentre » : si tu n'es pas arrivé à l'heure prévue, tes contacts d'urgence reçoivent ta dernière position par SMS.

⚠️ DANGERS SUR LA ROUTE
Accident, gravillons, huile, travaux, objet, animal, bouchon, véhicule arrêté : signale-les en un geste et sois prévenu à la voix à l'approche. Les autres motards confirment ou retirent le signalement.

☕ SPOTS ET ÉVÉNEMENTS
Cafés motards, points de vue, belles routes, stations, garages et parkings moto notés par la communauté. Rassos, sorties club, expos et sorties piste près de chez toi, avec rappel la veille.

🤝 TROUVER DES MOTARDS
Trouve des motards près de chez toi, par catégorie de moto (50, 125, A2, gros cube, trail), rythme et disponibilités. Ta position exacte n'est jamais montrée, seulement une distance approximative.

📸 STORIES ET MESSAGES
Partage tes sorties en stories photo ou vidéo qui disparaissent après 24 h, et discute en privé avec tes amis.

👤 TON PROFIL ET TON GARAGE
Tes motos, ton style, ton mur de photos, tes badges et tes cols. Carnet d'entretien avec rappels (vidange, pneus, chaîne). Seul ton pseudo est public : ton nom reste privé.

🔒 RESPECT DE TA VIE PRIVÉE
Pas de publicité, pas de revente de données, données hébergées en Europe. Blocage et signalement des membres, suppression de ton compte et de toutes tes données à tout moment depuis l'app.

PasseRyder ne signale jamais les contrôles de police ni les radars : uniquement les dangers sur la route.
Ne manipule pas ton téléphone en roulant.
```

| Élément graphique | Fichier / consigne |
|---|---|
| Icône de l'application (512 × 512, PNG 32 bits) | `store/icon-512.png` |
| Image de présentation (1024 × 500) | `store/feature-graphic-1024x500.png` |
| Captures d'écran téléphone | 2 minimum, 4 à 8 conseillées, PNG ou JPEG, côtés entre 320 et 3840 px, grand côté ≤ 2 × petit côté. Une capture brute en 1080 × 2400 est **refusée** (rapport 2,2) : recadrer en **1080 × 1920** (9:16). Voir ci-dessous |
| Captures tablette 7" / 10" | Facultatives (à passer) |
| Vidéo YouTube | Facultative |

**Captures à faire** (il n'y a plus de mode démo : utilise 2 ou 3 comptes de test amis entre eux, avec des pseudos,
photos et motos crédibles, sans vraie donnée personnelle visible ; recadrer en 1080 × 1920) :
1. La carte avec des potes en direct
2. Une balade (tracé + RDV) ou le convoi « Qui est au RDV ? »
3. « Fais-moi une boucle » (2-3 boucles proposées)
4. La navigation (guidage, limitation, météo)
5. La sécurité : SOS / « Je rentre »
6. Spots et événements (onglet Sorties)
7. Un profil motard (motos + mur + badges)

### 4.3 Catégorie et coordonnées (Paramètres de la fiche)
| Champ | Réponse |
|---|---|
| Type | Application |
| Catégorie | Social (alternative : Cartes et navigation) |
| Tags | Réseau social, Cartes, Navigation (au choix dans la liste) |
| Adresse email | passeryder@gmail.com |
| Site web | https://passeryder.fr |
| Téléphone | laisser vide (facultatif) |

### 4.4 Contenu de l'application (Règles › Contenu de l'application)
| Section | Réponse |
|---|---|
| Règles de confidentialité | `https://passeryder.fr/confidentialite` |
| Accès à l'application | « Tout ou partie des fonctionnalités sont soumises à des restrictions » → fournir un **compte de test** : email `passeryder+review@gmail.com`, mot de passe au choix (crée-le d'abord dans l'app et complète le profil). Instructions : « Se connecter avec l'email et le mot de passe fournis. Autoriser la localisation pour la carte et la navigation. Ce compte est ami avec un second compte de test : carte en direct, messages et balades visibles. » (créer aussi ce second compte, ami du premier) |
| Annonces | Non, mon application ne contient pas d'annonces |
| Classification du contenu | voir 4.5 |
| Public cible | Tranches d'âge : **16-17 ans** et **18 ans et plus** (cohérent avec la politique : 16 ans minimum). Pas d'enfants → pas le programme Familles. « L'app pourrait-elle attirer les enfants ? » : Non |
| Applications d'actualités | Non |
| Suppression des données (dans Sécurité des données) | URL : `https://passeryder.fr/supprimer-mon-compte` |
| Application gouvernementale | Non |
| Fonctionnalités financières | Aucune |
| Applications de santé | Non |
| Identifiant publicitaire | Non, n'utilise pas l'identifiant publicitaire |

### 4.5 Classification du contenu (questionnaire IARC)
- Email : passeryder@gmail.com — Catégorie : **Réseaux sociaux / communication** (ou « Toutes les autres applications » si absent)
- Violence, peur, sexualité, langage grossier, drogues/alcool/tabac, jeux d'argent (simulés ou réels) : **Non** partout
- Les utilisateurs peuvent-ils interagir ou échanger du contenu entre eux ? **Oui** (chat, photos, stories)
- L'app partage-t-elle la position physique de l'utilisateur avec d'autres utilisateurs ? **Oui**
- Achats de biens numériques : **Non**
- L'app est-elle un navigateur web ou un moteur de recherche ? **Non**
- Contenu principalement consacré à des actualités/éducation : **Non**

La classification (PEGI…) est calculée automatiquement à partir des réponses, avec les mentions « Interaction des utilisateurs » et « Partage de la position ».

### 4.6 Sécurité des données (Data safety)
**Questions générales**
| Question | Réponse |
|---|---|
| L'app collecte ou partage-t-elle des types de données requis ? | Oui |
| Toutes les données collectées sont-elles chiffrées en transit ? | Oui |
| Proposez-vous un moyen de demander la suppression des données ? | Oui (dans l'app + URL `https://passeryder.fr/supprimer-mon-compte`) |
| Création de compte | Oui, nom d'utilisateur (email) + mot de passe |

**Types de données** — pour chacun : *Collectées* = Oui, *Traitées de manière éphémère* = Non.

| Catégorie › Type | Partagées ? | Obligatoire / facultatif | Finalités |
|---|---|---|---|
| Position › **Position exacte** | **Oui** (coordonnées envoyées aux services d'itinéraire et de recherche d'adresse OpenStreetMap / IGN) | Facultatif (l'utilisateur peut refuser la permission) | Fonctionnement de l'application |
| Position › **Position approximative** | Non | Facultatif (« Trouver des motards ») | Fonctionnement de l'application |
| Informations personnelles › **Nom** | Non | Obligatoire | Fonctionnement de l'application, Gestion du compte |
| Informations personnelles › **Adresse e-mail** | Non | Obligatoire | Gestion du compte |
| Informations personnelles › **ID utilisateur** | Non | Obligatoire | Fonctionnement de l'application, Gestion du compte |
| Informations personnelles › **Autres informations** (pseudo, bio, ville, année de permis, motos) | Non | Obligatoire | Fonctionnement de l'application, Personnalisation |
| Photos et vidéos › **Photos** | Non | Facultatif | Fonctionnement de l'application |
| Photos et vidéos › **Vidéos** | Non | Facultatif | Fonctionnement de l'application |
| Fichiers audio › **Autres fichiers audio** (son des vidéos de stories) | Non | Facultatif | Fonctionnement de l'application |
| Messages › **Autres messages dans l'application** | Non | Facultatif | Fonctionnement de l'application |
| Activité dans les applications › **Autre contenu généré par l'utilisateur** (balades, signalements routiers, stories, amis) | Non | Facultatif | Fonctionnement de l'application |
| Identifiants de l'appareil ou autres › **ID d'appareil ou autres ID** (identifiant d'installation envoyé par le service de mises à jour Expo, jeton de notification push Expo / Firebase) | Non | Obligatoire | Fonctionnement de l'application |

Depuis la version 1.1.0 (sécurité et notifications), vérifier aussi :
- Position › Position exacte : inchangé (finalité Fonctionnement de l'application). La position d'un SOS va aux contacts d'urgence, qui sont des utilisateurs de l'app : ce n'est pas un « partage avec un tiers » au sens Play.
- L'accéléromètre est analysé sur place (rien à cocher).

Depuis les SMS automatiques (Brevo) : cocher **Contacts › Contacts** (numéros des contacts d'urgence saisis à la main) :
Collectés = Oui, **Partagés = Oui** (Brevo, prestataire d'envoi des SMS d'alerte), Traités de manière éphémère = Non
(gardés le temps d'un « Je rentre »), Facultatif, finalité Fonctionnement de l'application. Position exacte : partagée
aussi avec Brevo (lien de position dans le SMS), déjà « Partagée = Oui ».

Depuis les invitations, clubs et récaps partagés (note 12) : rien de nouveau à cocher. Clubs, mur des clubs, récaps de
sortie (tracé simplifié, départ et arrivée coupés par défaut) = **Autre contenu généré par l'utilisateur** ; le tracé
partagé relève aussi de **Position exacte** (déjà déclarée, finalité Fonctionnement de l'application). Pas de partage avec un tiers.

Depuis les points de bon comportement (opt-in, désactivés par défaut) : déjà couverts par **Activité dans les
applications › Autre contenu généré par l'utilisateur** (ajouter « points de bon comportement » à la description,
Facultatif, Fonctionnement de l'application). Ni position ni vitesse ne sont envoyées pour les points ; pas de partage.

Depuis la note 19 (parkings moto, recherche de lieux, passagers, suggestions d'amis, groupe de la commu) :
- Suggestions d'amis, places passager, groupe public de la communauté : **Autre contenu généré par l'utilisateur** et
  **Autres messages dans l'application**, déjà déclarés. Rien de nouveau.
- Recherche de lieux (Photon / komoot) et parkings / lieux proches (Overpass) : texte recherché et position **arrondie**
  (~1 km pour la recherche, ~100 m pour « autour de moi »). Déjà couvert par **Position exacte › Partagée = Oui**
  (services de recherche OpenStreetMap). Ajouter « Photon (komoot) » à la liste des services si la Play Console la demande.
- **Messages vocaux** : l'enregistrement n'existe que sur la version web tant que le build 1.3.0 n'est pas sorti (l'APK
  1.2.0 ne fait que les écouter). Au plus tard à la soumission du build 1.3.0 (le faire dès maintenant ne gêne pas),
  cocher **Fichiers audio › Enregistrements vocaux ou sonores** : Collectées = **Oui**, Partagées = **Non**,
  Traitées de manière éphémère = **Non**, **Facultatif** (l'utilisateur choisit d'envoyer un vocal), finalité
  **Fonctionnement de l'application**. Garder « Autres fichiers audio » (son des stories vidéo).

**Ne pas cocher** : Informations financières, Santé et remise en forme, Agenda, Historique de navigation web,
Informations et performances de l'application (pas d'outil de plantage/analyse), Historique des recherches dans l'app
(il reste sur le téléphone), Achats, Fichiers et documents.

### 4.7 Autorisations sensibles
**Version 1.2.0** (manifeste final contrôlé avec `npx expo config --type introspect` et les manifestes des modules) :

| Permission | Pourquoi | Déclaration Play |
|---|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Carte, navigation, SOS (app ouverte uniquement) | Non (pas d'arrière-plan) |
| `CAMERA`, `RECORD_AUDIO` | Photos, stories vidéo (avec le son) | Non |
| `READ_CONTACTS` | « Choisir dans mes contacts » (contacts d'urgence) | Non ; « Contacts » déjà dans la Sécurité des données |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE` | Notifications push | Non |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Réseau, mises à jour | Non |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` | Ajoutées par expo-image-picker / expo-file-system (anciens Android) | Non |
| `SYSTEM_ALERT_WINDOW` | Ajoutée par le modèle Expo (menu de développement) | Non |
| Retirées (`blockedPermissions` d'app.json) : `WRITE_CONTACTS`, `ACTIVITY_RECOGNITION` | — | — |

Historique :
L'app n'utilise **pas** la localisation en arrière-plan ni `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` (le sélecteur de photos système suffit) :
aucune déclaration spéciale n'est normalement demandée. Si la Play Console en réclame une après l'import du `.aab`, suivre son message.

Version 1.1.0 : `POST_NOTIFICATIONS` (demandée au lancement, Android 13+), `VIBRATE`, `RECEIVE_BOOT_COMPLETED`,
`WAKE_LOCK` : permissions normales, aucune déclaration. Prochain APK : `READ_CONTACTS` (expo-contacts, choisir un contact d'urgence ; `WRITE_CONTACTS` bloquée dans app.json) :
permission normale-dangereuse, pas de déclaration spéciale ; « Contacts » est déjà déclaré dans la Sécurité des données.
**Pas** de `SEND_SMS` (SMS automatiques envoyés par le serveur via Brevo ; en
secours, SMS prérempli envoyé par l'utilisateur), **pas** de `ACTIVITY_RECOGNITION` (bloquée dans app.json), **pas** de localisation en arrière-plan ni de
service de premier plan : SOS, chute et « Je rentre » fonctionnent app ouverte, le serveur prend le relais pour « Je rentre ».

### 4.8 Tests internes
Tester et publier › Tests internes › **Testeurs** : créer une liste d'emails (comptes Google des testeurs), copier le **lien d'inscription**
et l'envoyer. Les testeurs ouvrent le lien, acceptent, puis installent PasseRyder depuis le Play Store.

---

## 5. À faire avant la production

### 5.1 Emails d'authentification : SMTP Brevo + confirmation d'email
**Déjà prêt (code)** : « Mot de passe oublié ? » et « Renvoyer l'email de confirmation » sur l'écran de connexion,
écran `/auth-callback` (app via `passeryder://auth-callback…` et web via `https://app.passeryder.fr/auth-callback…`),
pages `passeryder.fr/email-confirme` et `passeryder.fr/lien-expire`, modèles français dans `supabase/templates/`
(générés par `scripts/auth-emails.mjs`). Les liens des emails utilisent `{{ .TokenHash }}` vers nos pages (pas
`{{ .ConfirmationURL }}`) : ils marchent quel que soit l'appareil qui a fait la demande, et ne sont consommés que par nos pages.

1. **Modèles + URL** (une fois) : `node scripts/auth-emails.mjs --push` après avoir chargé `.env.supabase`
   (règle Site URL = `https://passeryder.fr`, Redirect URLs = `https://app.passeryder.fr/**`, `https://passeryder.fr/**`, `passeryder://**`,
   sujets et contenus des 4 modèles ; ne touche ni au SMTP, ni à « Confirm email », ni aux limites).
2. **Brevo** › Expéditeurs, domaines › domaine **passeryder.fr** authentifié (DKIM + DMARC chez OVH).
3. Brevo › **SMTP et API** › clé SMTP (secrète, jamais dans Git).
4. Supabase › Authentication › Emails › **SMTP Settings** › Enable custom SMTP :
   Sender email `noreply@passeryder.fr`, Sender name `PasseRyder`, Host `smtp-relay.brevo.com`, Port `587`,
   Username = identifiant SMTP Brevo, Password = clé SMTP.
5. Supabase › Authentication › **Rate Limits** › « Rate limit for sending emails » : 30 / heure (2 par défaut).
6. **Tester** (mot de passe oublié, avec « Confirm email » encore désactivé) : réception, pas en spam, lien dans l'app et dans un navigateur.
7. Seulement si tout marche : Authentication › Sign In / Providers › Email › **activer « Confirm email »**
   (les comptes existants restent confirmés), puis tester une inscription complète.

### 5.2 Déjà fait
- ✅ **Conditions d'utilisation** (exigées par Google pour le contenu publié par les membres) : page `/conditions`, case obligatoire
  à l'inscription, date d'acceptation enregistrée dans `terms_acceptances`. Les comptes existants doivent les accepter à la prochaine ouverture.
- ✅ **Mentions légales** : page `/mentions-legales` (éditeur EI, SIRET, adresse, hébergeurs Hostinger et Supabase, crédits).

## 6. Plus tard : encaisser Premium sur Android (rien n'est actif aujourd'hui)
Déjà prêt (sans paiement) : table `app_features` (gratuit / premium / désactivé, console › Fonctions), plan du membre
(`user_entitlements` : premium à vie ou jusqu'à une date, offert depuis console › Inscrits › ★), `canUse('clé')` dans l'app,
écran « PasseRyder Premium » caché (fonction `premium_offer` désactivée). Bêta : tout est gratuit.

Ce qu'il faudra pour vendre :
- **Google Play Billing obligatoire** pour vendre des fonctions numériques dans une app installée depuis Google Play
  (abonnement ou achat dans l'app). Interdit de renvoyer vers un paiement externe (Stripe, PayPal…) pour ces fonctions
  dans l'app Android, sauf programmes spéciaux (choix de facturation alternatif, conditions et frais propres à l'EEE).
- **Commission Google** : 15 % sur les abonnements (dès la 1re année) et 15 % sur le 1er million de $ de chiffre par an pour
  les achats ponctuels (programme 15 %), 30 % au-delà. TVA collectée et reversée par Google en France.
- **Module natif = nouveau build** (pas d'eas update) : `react-native-iap` ou RevenueCat (`react-native-purchases`),
  nouvelle `version` dans app.json, AAB, test interne. Play Console : compte marchand (profil de paiement, IBAN),
  produits « Abonnements » (ex. mensuel + annuel), testeurs de licence.
- **Côté serveur** : vérifier chaque achat (jeton d'achat Google ou webhook RevenueCat) dans une Edge Function, puis
  écrire `user_entitlements.premium_until` (jamais l'app directement) ; gérer renouvellement, annulation, remboursement.
- Mettre à jour : CGU (conditions de vente, résiliation), politique de confidentialité, Sécurité des données
  (« Achats » : historique d'achats), fiche Play (« Contient des achats intégrés »).

**Recommandation la plus simple** : **RevenueCat** (gratuit jusqu’à 2 500 $ de revenus mensuels, tarif à revérifier le moment venu) avec son SDK Expo
(`react-native-purchases`, config plugin, compatible EAS Build). Il gère Google Play Billing, les renouvellements et
envoie un webhook → Edge Function `revenuecat-webhook` qui met à jour `premium_until`. Un seul abonnement « Premium »
(mensuel + annuel), la sécurité (SOS, chute, « Je rentre », dangers) toujours gratuite.
Sur le web (app.passeryder.fr), un paiement Stripe serait possible plus tard, mais pas nécessaire au départ.

## 7. Build 1.3.0 : ce qui demande un nouveau build natif (rien n'est commencé)
La note 13 (itinéraire Plaisir, autonomie, rappel de pause, virages serrés, coucher du soleil, simulation de trajet)
passe entièrement par `eas update`. Ce qui suit demande un build, par ordre de priorité :

| Fonction | Ce qu'il faut | Effort estimé | Recommandation |
|---|---|---|---|
| **Navigation écran éteint / app en arrière-plan** (guidage vocal, alertes, « Je rentre ») | `expo-task-manager` (nouveau module natif) + `Location.startLocationUpdatesAsync` avec `foregroundService` (notification permanente « Navigation en cours »), plugin expo-location `isAndroidBackgroundLocationEnabled` / `isAndroidForegroundServiceEnabled`, permissions `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE_LOCATION`. Play Console : déclaration « Localisation en arrière-plan » **et** « Types de service de premier plan » avec **vidéo** de démonstration, politique de confidentialité et Sécurité des données mises à jour. Le guidage, les alertes et la mesure du trajet passent dans la tâche de fond. | 4 à 6 jours de dev + 1 à 3 semaines de revue Google | **À faire en premier** (c'est le vrai manque d'un GPS moto). Seulement pendant une navigation lancée par le motard, jamais en permanence ; tester l'autonomie de la batterie. |
| **Cartes hors ligne** (zones sans réseau en montagne) | Le plus solide : MapLibre (`@maplibre/maplibre-react-native`, module natif) avec téléchargement de zones, à la place de Leaflet dans une WebView : réécriture de la carte (≈ 2 500 lignes : marqueurs, tracés, rotation, flèche). Variante sans build : MapLibre GL JS + fichier PMTiles auto-hébergé sur le VPS, dans la WebView actuelle (gros chantier aussi). Respecter les conditions des tuiles (OpenStreetMap interdit le téléchargement en masse ; MapTiler selon l'offre). Le calcul d'itinéraire reste en ligne (Valhalla / OSRM). | 2 à 3 semaines | Après la navigation écran éteint. Commencer par « garder la zone du trajet » (tuiles du tracé mises en cache au départ), plus simple qu'une vraie carte hors ligne. |
| **Messages vocaux : enregistrement dans l'app Android** (note 19 ; déjà fait : enregistrement sur le web, écoute partout, serveur prêt) | `npx expo install expo-audio`, plugin `["expo-audio", { "microphonePermission": "PasseRyder utilise le micro pour tes messages vocaux et le son de tes stories vidéo." }]` dans app.json (mettre le même texte dans `microphonePermission` d'expo-image-picker). `RECORD_AUDIO` est **déjà** dans `android.permissions` (stories vidéo) : rien de neuf à déclarer côté Play, pas de déclaration spéciale. Code : remplacer le contenu de `src/lib/voice-recorder.ts` (instructions en tête du fichier : `useAudioRecorder` / `RecordingPresets.LOW_QUALITY`, AAC .m4a mono ~32 kb/s, `requestRecordingPermissionsAsync`, fichier lu en ArrayBuffer pour `sendVoiceMessage`, type `audio/mp4`). Le reste (bouton micro maintenu, glisser pour annuler, 2 min, envoi, lecture) est déjà dans `components/voice-message.tsx`. Sécurité des données : « Enregistrements vocaux ou sonores » (voir § 4.6). | 1 jour | **À faire avec la navigation écran éteint** (même build). |
| **Android Auto** | Module natif maison (Car App Library, catégorie Navigation) via un config plugin, écrans dédiés limités par Google, validation spécifique de Google pour les apps de navigation. | 4 à 6 semaines | **Pas maintenant** : peu de motos ont un écran Android Auto, le guidage passe par l'intercom. À revoir s'il y a de la demande. |

Rappel : pas de localisation en arrière-plan ni de service de premier plan sans cette déclaration Google (voir CLAUDE.md).
