@AGENTS.md

# Projet MOTO (nom provisoire) — App communautaire pour motards
Développeur : Dimitri (DK Elec). Communication en français, réponses courtes et directes.

## Vision
Mélange Life360 + Waze + appli de rencontre (pour rouler, pas pour l'amour) pour motards :
- Carte en direct avec la position des amis / du groupe
- Enregistrement automatique des trajets, vitesse en temps réel, stats
- Planification de balades, trajets et points de rencontre
- Suggestions de motards à proximité pour rouler ensemble
- Sécurité : SOS, détection de chute, alerte distraction

## Stack
- App mobile : Expo (React Native) + TypeScript, expo-router, expo-location + expo-task-manager (géoloc arrière-plan), react-native-maps, expo-sensors (détection chute), expo-notifications
- Backend : Supabase (auth par numéro de téléphone OTP SMS, Postgres + PostGIS, Realtime pour positions live, Row Level Security partout)
- Build : EAS Build (APK Android d'abord)
- VPS Debian + Caddy : site vitrine / admin plus tard

## Données V1
- profiles (PUBLIC, lisible par tous les membres) : id, pseudo, avatar_path, cover_path, bio, riding_styles, license_year, city, interests (fait)
- profile_private : prénom + nom, lisibles UNIQUEMENT par leur propriétaire (RLS). Ne jamais les afficher ni les remettre dans profiles : partout dans l'app, seul le pseudo est visible
- wall_photos : mur de photos (fichiers dans photos/<user_id>/), + profile_stats() pour les compteurs (fait)
- motorcycles : owner_id, marque, modèle, année, cylindrée, couleur, photo_path — plusieurs par profil (fait)
- Storage : bucket public `photos`, écriture limitée à `photos/<user_id>/...`
- SQL dans `supabase/migrations/`, collé à la main dans le SQL Editor Supabase
- friendships : demandes (pending) et amitiés (accepted), une ligne par paire (fait)
- location_privacy (+ _rules allow/block) : everyone / friends / selected / ghost (fait)
- group_rides / group_ride_participants = balades planifiées (fait) : tracé, RDV, niveau, visibilité public/friends/private, max participants. Entre started_at et ended_at, les participants "joined" se voient toujours (même en fantôme) ; démarrage autorisé seulement de RDV-2 h à RDV+12 h
- live_positions : lecture UNIQUEMENT via RLS + `can_view_location()` — toute règle de visibilité se code là, jamais seulement dans l'app
- road_reports / road_report_votes : signalements style Waze (fait). Types autorisés uniquement : accident, gravel, oil, roadworks, object, animal, traffic_jam, stopped_vehicle, danger. JAMAIS radar/police/contrôle (refusé côté serveur). Expiration par type + votes « toujours là / plus là »
- Navigation : OSRM (itinéraire normal) ; Valhalla FOSSGIS profil moto pour « éviter autoroutes » (les OSRM publics ne le permettent pas). Recherche : Géoplateforme (ex api-adresse) + Nominatim sur demande seulement (pas d'autocomplétion, 1 req/s)
- Sécurité : saisie de texte bloquée en navigation > 10 km/h (DrivingLockProvider, appliqué dans Field et dans la saisie des messages ; les notifications de message restent affichées)
- Catégories de moto (fait) : motorcycles.category (cyclo / 125 / a2 / big / trail, déduite de la cylindrée, modifiable) + is_main (une seule, via set_main_motorcycle). profiles.pace / availability. group_rides.categories / pace / surface
- 50 cm³ : JAMAIS d'autoroute ni de voie rapide → Valhalla motor_scooter (45 km/h), jamais de repli OSRM. Options d'itinéraire préremplies selon la moto principale (lib/moto.ts)
- Recherche de motards (fait) : opt-in (rider_discovery, zone arrondie ~5 km, lisible par son seul propriétaire), find_riders() renvoie une distance en km, exclut fantômes et « block »
- Stories 24 h (fait) : stories (photo, ou vidéo ≤ 30 s, texte ≤ 200, visibilité friends/everyone), story_views. expires_at forcé côté serveur (now + 24 h), stories expirées jamais renvoyées (RLS). Fichiers dans le bucket PRIVÉ `stories` (URL signées), nettoyés par l'Edge Function `cleanup-stories` lancée par pg_cron toutes les 30 min
- Messages (fait) : conversations (direct / ride, une par balade, membres synchronisés avec les inscrits), conversation_members (last_read_at = « vu »), messages (texte ≤ 2000 et/ou photo dans le bucket PRIVÉ `chat`). Lecture réservée aux membres (RLS), temps réel via Supabase Realtime, liste via my_conversations()
- Modération (obligatoire stores) : user_blocks (bloquer coupe messages, position, stories, recherche, amitié — tout côté serveur) et content_reports (message / story / user). Menus à plus de 3 choix : showActionSheet (Android n'affiche que 3 boutons dans Alert)
- circles / circle_members : groupes façon Life360
- trips / trip_points : trajets enregistrés
- sos_events : alertes SOS

## Thème et couleurs
- TOUTES les couleurs sont dans `src/constants/theme.tsx` (palettes claire + sombre, panneaux de signalement). Jamais de couleur en dur ailleurs
- Couleur principale : bleu ciel (ACCENT), identique en clair et en sombre
- Dans un composant : `const Colors = useColors()` et `const styles = useStyles()` avec `const useStyles = makeStyles((Colors) => ({...}))`
- Thème Clair / Sombre / Automatique dans Paramètres, mémorisé. La carte NE suit PAS le thème : réglage séparé « Style de carte » (Classique OSM par défaut / Sombre CARTO Dark Matter / Automatique = sombre du coucher au lever du soleil, lib/sun.ts), mémorisé

## Supabase CLI (migrations)
- CLI installée en devDependency : `npx supabase ...`. Projet lié : ref `yfewldnhnnrzzscmfjsd`
- Secrets dans `.env.supabase` (ignoré par Git, créé par Dimitri) : SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD. Ne JAMAIS les afficher, les copier dans le code ou les commiter
- Charger avant chaque commande (bash) : `set -a; . <(sed 's/$//' .env.supabase); set +a`
- Nouvelle migration : fichier `supabase/migrations/<AAAAMMJJhhmmss>_nom.sql`, tester en local (PGlite), puis `npx supabase db push`
- Les 5 premières migrations ont été collées à la main dans le SQL Editor : marquées « applied » avec `supabase migration repair`

## Distribution testeurs (EAS)
- App « MotoPotes », identifiant Android/iOS `com.dkelec.moto`. Icônes provisoires dans assets/images (moto blanche sur bleu ciel)
- eas.json : profil `preview` = APK installable (distribution internal, canal `preview`, environnement EAS `preview`), versionCode géré par EAS (appVersionSource remote + autoIncrement)
- EAS Update : expo-updates, runtimeVersion = version de l'app (policy appVersion). Changement JS seul → `eas update` ; nouveau module natif ou config native → augmenter `version` dans app.json et refaire un APK
- Le .env n'est PAS envoyé à EAS Build : les EXPO_PUBLIC_* sont dans les variables d'environnement EAS (environnement preview)
- Les commandes eas (login, init, build, update) sont interactives : c'est Dimitri qui les lance
- Mode démo désactivé par défaut hors __DEV__ (APK), activable dans Paramètres. Paramètres > À propos : version, canal, bouton « Rechercher une mise à jour »

## Feuille de route
1. V1 Socle : auth téléphone, profil + moto, cercles, carte live, trajets, vitesse temps réel, SOS manuel
2. V2 Balades : création, itinéraire, point de rencontre, invitations, chat
3. V3 Rencontres : suggestions de motards (zone, style, cylindrée), match pour rouler
4. V4 Sécurité : détection chute auto, excès de vitesse (OSM maxspeed), alerte distraction, zones de danger
5. V5 Monétisation : abonnement premium

## Règles
- RGPD : consentement géoloc, mode fantôme, suppression compte et données
- Légal France : jamais signaler police/radars, uniquement "zones de danger"
- Batterie : fréquence géoloc adaptative
- Secrets dans .env (non commité)
- Petites étapes testables, commit Git après chaque étape qui marche, puis `git push` (remote `origin` = GitHub privé daboka138/moto, branche `main`)
