# Publication sur Google Play — PasseRyder

Développeur : **DK Tech Lab** (compte Play Console : dktechlabweb@gmail.com)
Contact de l'app : **passeryder@gmail.com** — site : **https://passeryder.fr**
Identifiant : `com.passeryder.app` — étapes : test interne → test fermé → production.

Fichiers prêts dans le dépôt :
- `store/icon-512.png` (icône 512 × 512) et `store/feature-graphic-1024x500.png` (bannière)
- `site/` : site passeryder.fr (accueil, `/conditions`, `/confidentialite`, `/supprimer-mon-compte`), en ligne sur le VPS
- `eas.json` : profil `production` (AAB, canal `production`) + `submit.production` (piste `internal`, version brouillon)

---

## 1. Site passeryder.fr — ✅ en ligne depuis le 26/09/2026

- VPS Debian + Caddy 2.11 : `187.6.165.249` (le même que comptaeasy.fr), accès `ssh root@187.6.165.249` par clé
- DNS OVH : A `@` et `www` → `187.6.165.249` (pas d'AAAA). Certificats HTTPS automatiques (Caddy / Let's Encrypt)
- Fichiers : `/var/www/passeryder` (propriétaire `caddy`), copie du dossier `site/` du dépôt
- URL : https://passeryder.fr, https://passeryder.fr/conditions, https://passeryder.fr/confidentialite, https://passeryder.fr/supprimer-mon-compte
  (`/confidentialite` redirige vers `/confidentialite/`, `www.passeryder.fr` redirige vers `passeryder.fr`)

### 1.1 Republier le site après une modification
Depuis Git Bash, dans `C:projetsmoto` :
```bash
tar -C site -cf - . | ssh root@187.6.165.249 'tar -C /var/www/passeryder --no-same-owner -xf - && chown -R caddy:caddy /var/www/passeryder'
```
Pas besoin de recharger Caddy pour un simple changement de fichiers.

### 1.2 Bloc Caddy en place
À la fin de `/etc/caddy/Caddyfile`, après le bloc comptaeasy.fr (inchangé) ; sauvegarde de l'ancienne version : `/etc/caddy/Caddyfile.bak-*`.
```caddy
passeryder.fr {
    root * /var/www/passeryder
    encode zstd gzip
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
eas update --channel production --environment production --message "Ce qui change"
```
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
Tes potes motards en direct, balades, dangers sur la route, stories et messages.
```

**Description complète** (4000 max) :
```
PasseRyder, c'est l'app des motards qui aiment rouler ensemble.

🗺️ CARTE EN DIRECT
Vois où roulent tes potes en temps réel, avec leur vitesse et leur moto. Tu choisis qui te voit : tout le monde, tes amis, seulement certains, ou personne avec le mode fantôme.

🏍️ BALADES
Planifie une sortie : tracé, point et heure de rendez-vous, niveau, type de route, catégories de motos acceptées. Invite tes amis, discute dans le groupe de la balade et retrouvez-vous sur la carte le jour J.

⚠️ DANGERS SUR LA ROUTE
Accident, gravillons, huile, travaux, objet, animal, bouchon, véhicule arrêté : signale-les en un geste et sois prévenu à la voix à l'approche. Les autres motards confirment ou retirent le signalement.

🧭 NAVIGATION PENSÉE POUR LA MOTO
Itinéraires avec ou sans autoroutes, adaptés à ta moto (jamais d'autoroute en 50 cm³). Pour ta sécurité, la saisie de texte est bloquée quand tu roules.

🤝 TROUVER DES MOTARDS
Trouve des motards près de chez toi, par catégorie de moto (50, 125, A2, gros cube, trail), rythme et disponibilités. Ta position exacte n'est jamais montrée, seulement une distance approximative.

📸 STORIES ET MESSAGES
Partage tes sorties en stories photo ou vidéo qui disparaissent après 24 h, et discute en privé avec tes amis.

👤 TON PROFIL MOTARD
Tes motos, ton style, ton année de permis, ton mur de photos. Seul ton pseudo est public : ton nom reste privé.

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

**Captures à faire** (sur ton téléphone, mode démo activé dans Paramètres pour avoir du monde sur la carte, sans vraie donnée personnelle visible) :
1. La carte avec des motards en direct
2. Une balade (détail : tracé + RDV)
3. La navigation avec un signalement de danger
4. « Trouver des motards »
5. Un profil motard (motos + mur)
6. Les stories / la messagerie

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
| Accès à l'application | « Tout ou partie des fonctionnalités sont soumises à des restrictions » → fournir un **compte de test** : email `passeryder+review@gmail.com`, mot de passe au choix (crée-le d'abord dans l'app et complète le profil). Instructions : « Se connecter avec l'email et le mot de passe fournis. Activer le mode démo dans Profil › Paramètres › Démonstration pour voir des motards sur la carte. » |
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
| Identifiants de l'appareil ou autres › **ID d'appareil ou autres ID** (identifiant d'installation envoyé par le service de mises à jour Expo) | Non | Obligatoire | Fonctionnement de l'application |

**Ne pas cocher** : Informations financières, Santé et remise en forme, Contacts, Agenda, Historique de navigation web,
Informations et performances de l'application (pas d'outil de plantage/analyse), Historique des recherches dans l'app
(il reste sur le téléphone), Achats, Enregistrements vocaux, Fichiers et documents.

### 4.7 Autorisations sensibles
L'app n'utilise **pas** la localisation en arrière-plan ni `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` (le sélecteur de photos système suffit) :
aucune déclaration spéciale n'est normalement demandée. Si la Play Console en réclame une après l'import du `.aab`, suivre son message.

### 4.8 Tests internes
Tester et publier › Tests internes › **Testeurs** : créer une liste d'emails (comptes Google des testeurs), copier le **lien d'inscription**
et l'envoyer. Les testeurs ouvrent le lien, acceptent, puis installent PasseRyder depuis le Play Store.

---

## 5. Avant la production (points restants côté app)
- ✅ **Conditions d'utilisation** (exigées par Google pour le contenu publié par les membres) : page `/conditions`, case obligatoire
  à l'inscription, date d'acceptation enregistrée dans `terms_acceptances`. Les comptes existants doivent les accepter à la prochaine ouverture.
- **Mentions légales** du site (obligatoires en France pour un éditeur professionnel) : adresse de DK Tech Lab, SIRET, hébergeur du VPS.
- **Emails d'authentification** : la confirmation d'email est désactivée et aucun SMTP n'est configuré dans Supabase
  → pas de « mot de passe oublié » possible. Configurer un SMTP (ex. Brevo) avant l'ouverture au public.
