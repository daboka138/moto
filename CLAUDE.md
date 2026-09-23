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
- circles / circle_members : groupes façon Life360
- trips / trip_points : trajets enregistrés
- sos_events : alertes SOS

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
- Petites étapes testables, commit Git après chaque étape qui marche
