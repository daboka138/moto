// GUIDE D'UTILISATION PASSERYDER : source unique du contenu.
// Utilisé par l'app Android, la version web (écrans Aide, présentation, astuces) et le site
// passeryder.fr/guide (généré par `npm run guide:build`, puis republier le site).
//
// Ajouter une fonction : ajouter une fiche dans FICHES (thème, étapes, astuces, limites).
// Règles : tutoiement, phrases courtes, emojis sobres, jamais de police / radar / contrôle.
// Chemins dans l'app avec « › » : « Profil › ⚙️ Paramètres › Sécurité ».
// Ce fichier ne doit rien importer (il est aussi lu directement par Node pour le site).

export type ThemeId = 'demarrer' | 'carte' | 'ensemble' | 'communaute' | 'securite' | 'vie-privee' | 'compte';

export type Theme = { id: ThemeId; titre: string; emoji: string; intro: string };

export type Fiche = {
  id: string;
  theme: ThemeId;
  emoji: string;
  titre: string;
  /** À quoi ça sert, en une phrase */
  but: string;
  /** Comment faire, étapes numérotées */
  etapes: string[];
  astuces?: string[];
  /** Limites connues */
  limites?: string[];
  /** Réservé à l'app Android (indiqué sur le web et sur le site) */
  android?: boolean;
  /** Ce qu'on peut quand même faire sur la version web, si `android` */
  web?: string;
  /** Mots en plus pour la recherche */
  motsCles?: string[];
};

export type Question = { id: string; q: string; r: string[]; fiches?: string[] };

export type Diapo = { emoji: string; titre: string; texte: string; points: string[] };

export type AstuceId = 'carte' | 'balade' | 'convoi' | 'je-rentre' | 'boucle' | 'spots';
export type Astuce = { titre: string; texte: string; fiche: string };

export const SUPPORT_EMAIL = 'passeryder@gmail.com';

export const THEMES: Theme[] = [
  { id: 'demarrer', emoji: '🚀', titre: 'Démarrer', intro: 'Ton compte, ton profil, tes amis et le tour des onglets.' },
  { id: 'carte', emoji: '🗺️', titre: 'Carte', intro: 'Tes amis en direct, l’itinéraire, la navigation et les dangers.' },
  { id: 'ensemble', emoji: '🏍️', titre: 'Rouler ensemble', intro: 'Balades, convoi, boucles et motards à rencontrer.' },
  { id: 'communaute', emoji: '🤝', titre: 'Communauté', intro: 'Mur, stories, messages, spots et événements.' },
  { id: 'securite', emoji: '🆘', titre: 'Sécurité', intro: 'SOS, détection de chute, « Je rentre » et contacts d’urgence.' },
  { id: 'vie-privee', emoji: '🔒', titre: 'Vie privée', intro: 'Qui voit ta position, mode fantôme, blocage et tes données.' },
  { id: 'compte', emoji: '⚙️', titre: 'Compte', intro: 'Profil, garage, réglages, mises à jour et suppression du compte.' },
];

export const FICHES: Fiche[] = [
  // ---------------------------------------------------------------- Démarrer
  {
    id: 'premiers-pas',
    theme: 'demarrer',
    emoji: '👋',
    titre: 'Créer ton compte',
    but: 'Ouvrir ton compte PasseRyder et créer ton profil de motard.',
    etapes: [
      'Ouvre l’app et crée ton compte avec ton email et un mot de passe.',
      'Accepte les conditions d’utilisation.',
      'Choisis ton pseudo, ta photo et ta ville : c’est ce que les autres verront.',
      'Ajoute ta moto (facultatif, mais utile pour les balades et les itinéraires).',
    ],
    astuces: [
      'Ton prénom et ton nom restent privés : seul ton pseudo est visible.',
      'Tu peux tout modifier plus tard dans Profil › Modifier mon profil.',
      'Mot de passe oublié ? Lien « Mot de passe oublié ? » sur l’écran de connexion.',
    ],
    motsCles: ['mot de passe', 'connexion', 'inscription', 'email', 'confirmation'],
  },
  {
    id: 'onglets',
    theme: 'demarrer',
    emoji: '🧭',
    titre: 'Le tour des onglets',
    but: 'Savoir où trouver chaque chose en un coup d’œil.',
    etapes: [
      'Carte : tes amis en direct, la recherche d’adresse, la navigation et les dangers.',
      'Mur : les photos et les balades de tes amis, les stories, la recherche et « Rouler ensemble ».',
      'Sorties : les balades, les événements et les lieux motards, plus « Fais-moi une boucle ».',
      'Notifs : tout ce qui te concerne (demandes d’ami, invitations, J’aime, commentaires…).',
      'Messages : tes discussions privées et celles des balades.',
      'Profil : ton profil, tes motos, tes photos, tes amis, ton garage, tes trajets et les Paramètres (⚙️).',
    ],
    astuces: ['Le bouton « ? » en haut du Profil ouvre cette aide à tout moment.'],
  },
  {
    id: 'amis',
    theme: 'demarrer',
    emoji: '👥',
    titre: 'Ajouter des amis',
    but: 'Retrouver tes potes motards pour les voir sur la carte et rouler ensemble.',
    etapes: [
      'Va dans Profil › Amis.',
      'Tape le pseudo de ton pote dans « Rechercher un motard ».',
      'Appuie sur « Ajouter » : il reçoit une demande.',
      'Les demandes que tu reçois sont dans « Demandes reçues » et dans l’onglet Notifs : « Accepter » ou « Refuser ».',
    ],
    astuces: [
      'Depuis le profil d’un motard, tu peux aussi « Ajouter en ami » ou lui envoyer un « Message ».',
      'Pour retirer un ami, ouvre son profil et appuie sur « Amis ✓ ».',
    ],
    motsCles: ['demande', 'pote', 'pseudo'],
  },
  {
    id: 'recherche',
    theme: 'demarrer',
    emoji: '🔎',
    titre: 'Rechercher',
    but: 'Trouver un motard, une balade, un lieu ou un événement par son nom.',
    etapes: [
      'Dans le Mur, appuie sur la barre « Rechercher un motard, une balade, un lieu… ».',
      'Tape au moins 2 lettres : les résultats arrivent pendant la frappe.',
      'Passe d’un onglet à l’autre : Motards, Balades, Lieux, Événements.',
    ],
    astuces: [
      'Barre vide : tes recherches récentes et les « Motards près de toi » (s’ils ont choisi d’apparaître).',
      'Majuscules et accents ne comptent pas.',
    ],
    limites: ['Les motards se cherchent par pseudo uniquement, jamais par nom.'],
  },
  {
    id: 'notifications',
    theme: 'demarrer',
    emoji: '🔔',
    titre: 'Notifications',
    but: 'Ne rien rater : demandes d’ami, invitations, messages, J’aime, rappels.',
    etapes: [
      'L’onglet Notifs liste tout, classé par Aujourd’hui, Cette semaine et Plus ancien.',
      'Réponds directement aux demandes et invitations avec « Accepter » ou « Refuser ».',
      'Glisse une notification sur le côté pour la supprimer, ou « Tout marquer comme lu ».',
      'Choisis ce que tu reçois sur ton téléphone dans Profil › ⚙️ Paramètres › Notifications.',
    ],
    astuces: ['Les alertes SOS et « Je rentre » de tes proches arrivent toujours, elles ne se coupent pas.'],
    limites: ['Les notifications push arrivent sur l’app Android, pas dans le navigateur.'],
    motsCles: ['push', 'cloche', 'pastille'],
  },
  {
    id: 'app-web',
    theme: 'demarrer',
    emoji: '💻',
    titre: 'App Android et version web',
    but: 'Savoir ce que tu peux faire sur app.passeryder.fr et ce qui est réservé au téléphone.',
    etapes: [
      'Sur ordinateur ou iPhone, ouvre app.passeryder.fr et connecte-toi avec le même compte.',
      'Tu y retrouves la carte (consultation), le Mur, les Sorties, les Messages, les Notifs et ton Profil.',
      'Pour le GPS en direct, la navigation, la voix et la sécurité, installe l’app Android : passeryder.fr/telecharger (étapes pour Android, iPhone et ordinateur).',
    ],
    astuces: ['La version web s’installe sur l’écran d’accueil comme une app (menu du navigateur › Installer).'],
    limites: [
      'Réservé à l’app Android : ta position en direct, la navigation et la voix, le SOS, la détection de chute, « Je rentre », les contacts d’urgence, Mes trajets et le démarrage d’une balade.',
      'Sur le web, ta position n’est jamais partagée.',
      'iPhone : l’app arrive bientôt, la version web marche déjà.',
    ],
    motsCles: ['ordinateur', 'iphone', 'navigateur', 'pwa'],
  },

  // ---------------------------------------------------------------- Carte
  {
    id: 'carte-amis',
    theme: 'carte',
    emoji: '📍',
    titre: 'Tes amis en direct',
    but: 'Voir où roulent tes amis, leur vitesse et leur moto.',
    etapes: [
      'Ouvre l’onglet Carte : ta position est la flèche bleue.',
      'Les pastilles avec une photo sont les motards qui partagent leur position avec toi.',
      'Touche une pastille pour voir le pseudo, la moto, la vitesse et la distance, puis « Voir le profil ».',
    ],
    astuces: [
      'Tu as déplacé ou tourné la carte ? « Recentrer » la remet sur toi.',
      'Tourne la carte avec deux doigts ; touche la boussole pour remettre le nord en haut.',
    ],
    limites: [
      'Ta position est partagée seulement quand l’app est ouverte (pas en arrière-plan).',
      'Tu ne vois que les amis qui t’autorisent à les voir.',
    ],
    android: true,
    web: 'Sur le web, tu vois tes amis en direct, mais ta propre position n’est jamais partagée.',
    motsCles: ['position', 'live', 'localisation'],
  },
  {
    id: 'itineraire',
    theme: 'carte',
    emoji: '🧭',
    titre: 'Aller quelque part',
    but: 'Calculer un itinéraire moto et choisir le plus agréable.',
    etapes: [
      'Sur la Carte, tape une adresse, une ville ou un lieu dans la barre de recherche. Ou fais un appui long sur la carte › « Aller ici ».',
      'Choisis parmi 2 ou 3 itinéraires : Rapide, Plaisir (sinueux, petites routes, sans autoroute) ou Éviter autoroutes. Sous chaque choix : le temps en plus et les virages en plus par rapport au plus rapide (« +18 min · 3× plus de virages »).',
      'Dans « Options », coche si besoin Sans péage ou Sans non-goudronné.',
      'Appuie sur « Démarrer ».',
    ],
    astuces: [
      'Les options sont préremplies selon ta moto principale.',
      'La météo sur le trajet s’affiche dans l’aperçu : pluie, vent, froid.',
      'Si ton autonomie est trop juste pour le trajet (Garage renseigné), l’app te prévient avant de partir.',
      'Plaisir choisit le plus sinueux parmi plusieurs tracés (même score que « Fais-moi une boucle »), sans dépasser 1,5 fois la durée du plus court d’entre eux.',
    ],
    limites: ['En 50 cm³, l’itinéraire évite toujours autoroutes et voies rapides.'],
    android: true,
    web: 'Sur le web, « Aller ici » ouvre l’itinéraire dans l’app Android.',
    motsCles: ['gps', 'navigation', 'autoroute', 'péage', 'route', 'adresse'],
  },
  {
    id: 'navigation',
    theme: 'carte',
    emoji: '🛣️',
    titre: 'Pendant la navigation',
    but: 'Être guidé à la voix, garder les yeux sur la route.',
    etapes: [
      'Une fois démarrée, la carte tourne dans ton sens de route et la prochaine direction s’affiche en haut.',
      'Le bouton haut-parleur coupe ou réactive la voix.',
      'Fais glisser le panneau du bas pour voir les étapes, ajouter un arrêt ou partager ton trajet.',
      'Appuie sur « Arrêter » pour finir. Un résumé s’affiche (distance, durée, vitesse moyenne et max).',
    ],
    astuces: [
      'L’écran reste allumé pendant la navigation.',
      'Hors itinéraire ? Le trajet est recalculé tout seul.',
      'Si l’app se ferme, ta navigation reprend à la réouverture (moins de 6 h).',
      'Pluie annoncée plus loin ? La voix te prévient (« Pluie prévue dans ~40 km »).',
    ],
    limites: [
      'Saisie de texte bloquée au-dessus de 10 km/h : c’est pour ta sécurité.',
      'L’app doit rester ouverte (pas de guidage en arrière-plan).',
    ],
    android: true,
    motsCles: ['guidage', 'voix', 'muet', 'arrêter', 'résumé'],
  },
  {
    id: 'arrets',
    theme: 'carte',
    emoji: '⛽',
    titre: 'Arrêts sur le trajet',
    but: 'Ajouter une pause essence, café ou resto sans quitter la navigation.',
    etapes: [
      'Dans l’aperçu ou pendant la navigation, ouvre le panneau du bas.',
      'Appuie sur « Ajouter un arrêt (essence, café…) ».',
      'Choisis Station essence, Café ou Resto « sur mon trajet », ou tape une adresse.',
      'L’arrêt s’insère dans l’ordre du trajet.',
    ],
    astuces: ['La recherche sur ton trajet regarde les 50 prochains km, à moins d’1 km de ta route.'],
    android: true,
    motsCles: ['essence', 'station', 'café', 'resto', 'pause', 'étape'],
  },
  {
    id: 'favoris',
    theme: 'carte',
    emoji: '⭐',
    titre: 'Maison, Travail et favoris',
    but: 'Lancer un trajet habituel en un geste.',
    etapes: [
      'Sous la barre de recherche de la Carte, appuie sur « Ajouter Maison » ou « Ajouter Travail ».',
      'Pour un autre lieu : choisis-le, puis « ⭐ Ajouter aux favoris » dans l’aperçu.',
      'Tes 3 dernières destinations s’affichent aussi en raccourcis.',
    ],
    limites: ['Les favoris sont gardés sur ton téléphone uniquement.'],
    android: true,
    motsCles: ['maison', 'travail', 'récents', 'raccourci'],
  },
  {
    id: 'vitesse',
    theme: 'carte',
    emoji: '⏱️',
    titre: 'Compteur et limitation',
    but: 'Voir ta vitesse et la limitation de la route.',
    etapes: [
      'Le compteur en haut à gauche de la Carte affiche ta vitesse GPS.',
      'Pendant la navigation, le panneau de limitation s’affiche à côté.',
      'Au-dessus de la limite, le compteur passe en rouge avec un petit bip.',
      'Règle-le dans Profil › ⚙️ Paramètres › Voix et alertes (Limitation de vitesse, Alerte de dépassement).',
    ],
    limites: [
      'Limitations issues d’OpenStreetMap : pas toujours connues ni à jour. Les panneaux font foi.',
    ],
    android: true,
    motsCles: ['compteur', 'km/h', 'bip', 'dépassement'],
  },
  {
    id: 'voix',
    theme: 'carte',
    emoji: '🔊',
    titre: 'Voix et alertes',
    but: 'Choisir ce que la voix t’annonce et comment.',
    etapes: [
      'Va dans Profil › ⚙️ Paramètres › Voix et alertes.',
      'Active ou coupe le guidage vocal GPS et les alertes vocales des dangers.',
      'Choisis les types de dangers annoncés, le débit et le volume.',
      'Alertes moto, désactivables une par une : virages serrés, coucher du soleil et nuit, météo sur le trajet.',
      'Rappel de pause : désactivé, 1 h, 1 h 30 ou 2 h de route.',
      'Appuie sur « Tester la voix ».',
    ],
    astuces: ['Le volume dépend aussi du volume média du téléphone (et de ton intercom).'],
    android: true,
    motsCles: ['son', 'volume', 'intercom', 'débit', 'muet'],
  },
  {
    id: 'alertes-moto',
    theme: 'carte',
    emoji: '🏍️',
    titre: 'Alertes moto et rappel de pause',
    but: 'Être prévenu à la voix des virages serrés, de la nuit, de la météo, du carburant et du besoin de faire une pause.',
    etapes: [
      'Virage serré : annoncé environ 200 m avant (« Virage serré à gauche dans 200 mètres », ou « Série de virages serrés »), d’après la forme de l’itinéraire ; les carrefours restent annoncés par le guidage.',
      'Coucher du soleil : rappel 30 min avant, et au départ si la nuit tombe avant ton arrivée.',
      'Météo et dangers signalés sur ta route : annoncés comme avant.',
      'Carburant : alerte si l’autonomie ne suffit pas pour finir le trajet ou passe sous 50 km, avec une station (spots « station » de la communauté ou OpenStreetMap) à ajouter en étape d’un geste.',
      'Pause : après le temps choisi (1 h, 1 h 30, 2 h), annonce courte et café ou point de vue proposé à moins de 10 min sur ta route.',
    ],
    astuces: [
      'En roulant, rien à valider : seulement la voix et un bandeau. Les boutons (ajouter l’étape) servent à l’arrêt.',
      'Un arrêt de 10 min remet le compteur de pause à zéro.',
      'Chaque alerte se coupe dans Paramètres › Voix et alertes.',
    ],
    limites: [
      'Virages calculés sur l’itinéraire, pas sur la route réelle : reste attentif, surtout hors du tracé.',
      'Écran éteint ou app en arrière-plan : pas d’alerte (prévu pour une prochaine version).',
    ],
    android: true,
    motsCles: ['virage', 'épingle', 'lacets', 'nuit', 'coucher du soleil', 'pause', 'fatigue', 'essence', 'réservoir'],
  },
  {
    id: 'dangers',
    theme: 'carte',
    emoji: '⚠️',
    titre: 'Signaler un danger',
    but: 'Prévenir les autres motards d’un danger sur la route, et être prévenu.',
    etapes: [
      'Appuie sur le bouton « + » de la Carte › « ⚠️ Signaler un danger » (en navigation, il ouvre directement les dangers).',
      'Choisis le type : accident, gravillons, huile, travaux, objet, animal, bouchon, véhicule arrêté ou autre danger.',
      'Le signalement apparaît sur la carte pour tout le monde.',
      'En passant devant un signalement, réponds « Toujours là » ou « Plus là ».',
    ],
    astuces: [
      'Sur ta route, la voix t’annonce un danger vers 600 m, puis te le rappelle à 200 m.',
      'Pour signaler ailleurs qu’à ta position : appui long sur la carte › « Signaler à cet endroit ».',
      'Un signalement expire tout seul (sa durée dépend du type).',
    ],
    limites: ['Uniquement des dangers de la route. Le reste est refusé.'],
    android: true,
    web: 'Sur le web, tu vois les signalements sur la carte.',
    motsCles: ['gravillons', 'huile', 'accident', 'travaux', 'animal', 'bouchon', 'signalement'],
  },
  {
    id: 'calques',
    theme: 'carte',
    emoji: '🗂️',
    titre: 'Ce qui s’affiche sur la carte',
    but: 'Afficher ou masquer dangers, balades, événements et spots.',
    etapes: [
      'À droite de la Carte : ⚠️ affiche ou masque les signalements.',
      '🚩 affiche ou masque les balades et les événements.',
      '☕ ouvre les filtres des spots (café, point de vue, belle route, station, garage, parking).',
      'Style de carte (Classique, Sombre, Automatique) : Profil › ⚙️ Paramètres › Style de carte.',
    ],
    astuces: [
      'Touche une épingle (balade, spot, événement, danger) pour voir sa fiche.',
      'Les alertes vocales de danger restent actives même si les signalements sont masqués.',
    ],
    motsCles: ['calque', 'filtre', 'sombre', 'style', 'épingle'],
  },
  {
    id: 'partage-trajet',
    theme: 'carte',
    emoji: '📡',
    titre: 'Partager mon trajet',
    but: 'Permettre à un ami de suivre ton trajet et ton heure d’arrivée.',
    etapes: [
      'Pendant la navigation, ouvre le panneau du bas › « Partager mon trajet ».',
      'Choisis un ou plusieurs amis.',
      'Ils reçoivent une fiche dans Messages avec ta position et ton heure d’arrivée, mises à jour toutes les 30 s.',
    ],
    astuces: ['Le partage s’arrête tout seul à l’arrivée ou quand tu arrêtes la navigation.'],
    limites: ['Sans nouvelles pendant 30 min, le partage s’arrête.'],
    android: true,
    motsCles: ['eta', 'suivre', 'arrivée'],
  },
  {
    id: 'mes-trajets',
    theme: 'carte',
    emoji: '🗒️',
    titre: 'Mes trajets',
    but: 'Retrouver l’historique de tes navigations et les exporter.',
    etapes: [
      'Va dans Profil › Mes trajets.',
      'Chaque trajet garde sa distance, sa durée, ses vitesses et sa trace.',
      'Appuie sur « … » › « Exporter en GPX » ou « Supprimer ce trajet ».',
    ],
    limites: [
      'Gardés sur ton téléphone uniquement : désinstaller l’app les efface.',
      'Seuls les trajets faits avec la navigation sont enregistrés.',
    ],
    android: true,
    motsCles: ['historique', 'gpx', 'stats'],
  },

  // ---------------------------------------------------------------- Rouler ensemble
  {
    id: 'balade-creer',
    theme: 'ensemble',
    emoji: '🗓️',
    titre: 'Créer une balade',
    but: 'Organiser une sortie avec un tracé, un RDV et inviter des motards.',
    etapes: [
      'Onglet Sorties › Balades › « + », ou appui long sur la carte › « Départ » / « Arrivée » / « Point de RDV ».',
      'Donne un titre, une date et une heure.',
      'Itinéraire : choisis le départ (A), l’arrivée (B) et des étapes si tu veux. Le tracé se calcule tout seul.',
      'Regroupement : le point de RDV (par défaut, le départ). Touche-le pour une adresse, un favori ou un spot, ou prends un des « Spots proches pour le RDV » (cafés, points de vue, stations, parkings).',
      'Motos et rythme : motos acceptées, niveau (Tranquille, Dynamique, Sportif), rythme, type de route.',
      'Visibilité : publique, amis ou privée, et un nombre max de participants si besoin.',
      'Appuie sur « Créer la balade », puis « Inviter des amis ».',
    ],
    astuces: [
      'Tu as un tracé GPX ? « Importer un tracé GPX » remplit l’itinéraire.',
      'Ouverte aux 50 cm³ : le tracé est calculé sans autoroute ni voie rapide.',
      'Une discussion de groupe est créée avec chaque balade.',
      'En panne d’idées ? La carte « 💡 Besoin d’idées ? » propose des articles de partenaires sur ta région.',
    ],
    limites: ['La balade est supprimée 1 h après la fin.'],
    motsCles: ['sortie', 'organiser', 'rdv', 'inviter', 'tracé'],
  },
  {
    id: 'balade-rejoindre',
    theme: 'ensemble',
    emoji: '✋',
    titre: 'Participer à une balade',
    but: 'Rejoindre une sortie et discuter avec le groupe.',
    etapes: [
      'Trouve une balade dans Sorties › Balades, sur le Mur ou sur la Carte (🚩).',
      'Ouvre-la : tracé, RDV, niveau, motos acceptées, météo au départ et à l’arrivée.',
      'Appuie sur « Je participe ».',
      'Discute avec le groupe dans « 💬 Discussion de la balade ».',
    ],
    astuces: [
      'Filtre les balades « Pour ma moto » et par date (7 jours, 30 jours).',
      'Un empêchement ? « Je me désiste ».',
      'Tu peux aimer et commenter une balade.',
    ],
    motsCles: ['inscription', 'invitation', 'discussion', 'désister'],
  },
  {
    id: 'balade-jour-j',
    theme: 'ensemble',
    emoji: '🏁',
    titre: 'Le jour de la balade',
    but: 'Démarrer la balade pour que tout le groupe se voie sur la carte.',
    etapes: [
      'L’organisateur appuie sur « Démarrer la balade » (à partir de 2 h avant le RDV).',
      'Tous les participants se voient alors sur la carte, même ceux en mode fantôme.',
      '« Voir les participants sur la carte » centre la carte sur le groupe.',
      'À l’arrivée, l’organisateur appuie sur « Terminer la balade ».',
    ],
    astuces: ['La détection de chute (si activée) marche aussi pendant une balade en cours.'],
    limites: ['Démarrage possible de 2 h avant à 12 h après l’heure du RDV.'],
    android: true,
    web: 'Sur le web, tu peux suivre la balade, mais pas la démarrer.',
    motsCles: ['démarrer', 'terminer', 'live'],
  },
  {
    id: 'convoi',
    theme: 'ensemble',
    emoji: '🚩',
    titre: 'Le convoi',
    but: 'Rouler en groupe sans perdre personne.',
    etapes: [
      'Sur la fiche de la balade, ouvre « ✅ Qui est au RDV ? ».',
      'Au RDV, appuie sur « Je suis au RDV » (ou ça se fait tout seul à moins de 150 m).',
      'L’organisateur désigne un 🚩 Ouvreur et un 🧹 Serre-file, et règle l’écart d’alerte.',
      'En route, le panneau Convoi sur la carte montre qui est où.',
      'Arrêt prévu ? « Je fais une pause (15 min) » : le groupe ne s’inquiète pas.',
      'Pour regrouper tout le monde : « Regroupement ici » (ou appui long sur la carte › « Point de regroupement »). Tout le groupe reçoit l’itinéraire.',
    ],
    astuces: [
      'Un motard est signalé décroché s’il est trop loin du plus proche (2 km par défaut), arrêté plus de 2 min, ou sans réseau plus de 3 min.',
      'L’organisateur, l’ouvreur et le serre-file sont prévenus à la voix et par notification.',
    ],
    limites: ['Le suivi nécessite que chacun ait l’app ouverte.'],
    android: true,
    motsCles: ['ouvreur', 'serre-file', 'groupe', 'check-in', 'pause', 'regroupement', 'décroché'],
  },
  {
    id: 'boucle',
    theme: 'ensemble',
    emoji: '🌀',
    titre: 'Fais-moi une boucle',
    but: 'Partir d’un lieu (chez toi, un café motard…) et y revenir par une jolie boucle, sans rien préparer.',
    etapes: [
      'Sorties › Balades › « Fais-moi une boucle », ou bouton « + » de la Carte.',
      'Départ : « 📍 Ma position » par défaut. Touche-le pour chercher une adresse, prendre Maison / Travail / un favori, un spot PasseRyder, ou appuyer sur la carte. Les « Départs populaires » (cafés et points de vue les mieux notés à moins de 20 km) se choisissent en un appui.',
      'Choisis une durée (30 min à 3 h) ou une distance.',
      'Choisis les virages : Tranquille, Sinueux ou Très sinueux.',
      'Laisse « Éviter les autoroutes » coché (conseillé).',
      'Compare les 2 ou 3 boucles proposées (note de sinuosité sur 10).',
      'Appuie sur « Partir », « Créer une balade (inviter des amis) » ou « Enregistrer comme belle route ».',
    ],
    astuces: [
      'Pas satisfait ? Relance : les boucles changent à chaque fois.',
      'La boucle part et revient au lieu de départ. « Créer une balade » en fait le point de RDV.',
      'Position refusée ou indisponible : le choix du départ s’ouvre tout seul.',
      '« 💡 Besoin d’idées ? » : des articles de partenaires sur les belles routes de ta région.',
    ],
    limites: ['La durée est une estimation selon la sinuosité.'],
    web: 'Sur le web, tu peux calculer une boucle et créer une balade ; « Partir » ouvre l’app Android.',
    motsCles: ['loop', 'virages', 'sinueux', 'balade rapide', 'départ', 'lieu de départ', 'rendez-vous', 'idées'],
  },
  {
    id: 'gpx',
    theme: 'ensemble',
    emoji: '📂',
    titre: 'Fichiers GPX',
    but: 'Importer ou exporter un tracé GPX.',
    etapes: [
      'Importer : Sorties › icône GPX, choisis le fichier, puis « Créer une balade » ou « Naviguer ».',
      'Ou, en créant une balade : « Importer un tracé GPX ».',
      'Exporter une balade : sur sa fiche › « Exporter le tracé (GPX) ».',
      'Exporter un trajet : Profil › Mes trajets › « … » › « Exporter en GPX ».',
    ],
    limites: ['En navigation, un GPX est suivi via quelques points de passage : le tracé peut différer légèrement.'],
    motsCles: ['import', 'export', 'tracé', 'fichier'],
  },
  {
    id: 'trouver-motards',
    theme: 'ensemble',
    emoji: '🤝',
    titre: 'Trouver des motards',
    but: 'Rencontrer des motards près de chez toi pour rouler ensemble.',
    etapes: [
      'Dans le Mur, appuie sur « Rouler ensemble ».',
      'Si besoin, appuie sur « Apparaître » pour être visible toi aussi.',
      'Filtre par distance, moto, permis, style, rythme et disponibilités.',
      'Appuie sur « Ajouter en ami » ou ouvre le profil pour envoyer un message.',
    ],
    astuces: ['Complète ton profil (style, rythme, dispos, moto principale) pour de meilleures suggestions.'],
    limites: [
      'Ta position exacte n’est jamais montrée : seulement une distance approximative (zone de ~5 km).',
      'En mode fantôme, tu n’apparais pas.',
    ],
    motsCles: ['rencontre', 'suggestions', 'proximité', 'découverte'],
  },

  // ---------------------------------------------------------------- Communauté
  {
    id: 'mur',
    theme: 'communaute',
    emoji: '📰',
    titre: 'Le Mur',
    but: 'Suivre l’actu de tes amis : photos et balades.',
    etapes: [
      'Ouvre l’onglet Mur.',
      'En haut : les stories de tes amis. En dessous : leurs photos et les balades qu’ils organisent ou rejoignent.',
      'Touche une photo pour l’agrandir, l’aimer ou la commenter.',
      'Sur une balade, « Je participe » t’inscrit directement.',
    ],
    motsCles: ['fil', 'actualité'],
  },
  {
    id: 'photos',
    theme: 'communaute',
    emoji: '📸',
    titre: 'Tes photos',
    but: 'Montrer tes sorties et ta moto sur ton profil.',
    etapes: [
      'Va dans Profil › Photos › « Ajouter ».',
      'Choisis une photo et ajoute une légende si tu veux.',
      'Tes amis la voient sur leur Mur et peuvent l’aimer et la commenter.',
    ],
    astuces: ['Tu peux supprimer les commentaires sous tes photos.'],
    motsCles: ['mur', 'album', 'commentaire', 'like', 'j’aime', 'couverture'],
  },
  {
    id: 'stories',
    theme: 'communaute',
    emoji: '⏳',
    titre: 'Stories',
    but: 'Partager un moment de ta sortie pendant 24 h.',
    etapes: [
      'En haut du Mur, appuie sur « + » (ta bulle).',
      'Prends une photo ou une vidéo (30 s max) ou choisis-la dans la galerie.',
      'Ajoute un texte si tu veux, puis choisis qui peut la voir : 👥 Mes amis ou 🌍 Tout le monde.',
      'Appuie sur « Publier ma story ».',
    ],
    astuces: [
      'Sur ta story, « Vue par » montre qui l’a vue et aimée.',
      'Répondre à une story envoie un message privé.',
    ],
    limites: ['Une story disparaît toute seule au bout de 24 h.'],
    motsCles: ['vidéo', '24 h', 'éphémère'],
  },
  {
    id: 'messages',
    theme: 'communaute',
    emoji: '💬',
    titre: 'Messages',
    but: 'Discuter en privé ou avec le groupe d’une balade.',
    etapes: [
      'Onglet Messages › « Nouveau message », puis choisis un ami.',
      'Écris ton message ou ajoute une photo.',
      'Les discussions des balades auxquelles tu participes apparaissent aussi ici.',
    ],
    astuces: ['« Vu » s’affiche quand ton message a été lu.'],
    limites: ['Saisie désactivée en navigation au-dessus de 10 km/h.'],
    motsCles: ['chat', 'discussion', 'photo'],
  },
  {
    id: 'spots',
    theme: 'communaute',
    emoji: '☕',
    titre: 'Spots motards',
    but: 'Partager et noter les bons coins : cafés, points de vue, belles routes…',
    etapes: [
      'Bouton « + » de la Carte › « 📍 Ajouter un spot motard », ou appui long sur la carte › « Lieu motard ».',
      'Choisis la catégorie : café / resto motard, point de vue, belle route, station essence, garage / concession, parking moto.',
      'Donne un nom, une description, une photo si tu veux, et ta note.',
      'Appuie sur « Ajouter le spot ».',
    ],
    astuces: [
      'Retrouve les spots dans Sorties › Lieux, ou sur la carte avec le filtre ☕.',
      'Sur la fiche d’un spot : « Y aller », avis et photos des autres membres.',
    ],
    limites: ['Un spot signalé 3 fois est masqué en attendant la modération.'],
    motsCles: ['lieu', 'café', 'point de vue', 'parking', 'avis', 'note', 'belle route'],
  },
  {
    id: 'evenements',
    theme: 'communaute',
    emoji: '📅',
    titre: 'Événements',
    but: 'Annoncer ou trouver un rasso, une sortie club, une expo ou une sortie piste.',
    etapes: [
      'Sorties › Événements pour voir ce qui se passe « Près de moi » (25 à 200 km, ou partout).',
      'Pour en créer un : bouton « + » de la Carte › « 📅 Créer un événement ».',
      'Choisis le type, le titre, le lieu, les dates, une affiche et le nombre de places.',
      'Sur un événement : « J’y vais » ou « Intéressé », « Inviter des amis », « Partager le lien ».',
    ],
    astuces: ['Rappel par notification la veille de l’événement.'],
    limites: ['Un événement est supprimé après sa fin.'],
    motsCles: ['rasso', 'rassemblement', 'salon', 'expo', 'piste', 'concert'],
  },
  {
    id: 'badges',
    theme: 'communaute',
    emoji: '🏅',
    titre: 'Badges et défis',
    but: 'Garder une trace de tes kilomètres, cols et balades.',
    etapes: [
      'Ouvre ton Profil : la carte Badges résume tes stats.',
      'Touche-la pour voir tous les badges, les défis du mois et tes cols.',
    ],
    astuces: ['Les cols franchis pendant une navigation sont détectés automatiquement.'],
    limites: ['Seuls les trajets faits avec la navigation de l’app comptent.'],
    motsCles: ['cols', 'stats', 'kilomètres', 'défi'],
  },
  {
    id: 'points',
    theme: 'communaute',
    emoji: '🛡️',
    titre: 'Points de bon comportement',
    but: 'Gagner des points, des niveaux et des badges en roulant proprement et en aidant les autres.',
    etapes: [
      'Profil › ⚙️ Paramètres › Points de bon comportement › active « Gagner des points » (désactivé par défaut).',
      'Ouvre « Mes points » : niveau, défi du mois, badges, classement et historique.',
      'Km propres : 1 point / 10 km roulés en navigation sans dépasser la limitation connue.',
      'Trajet sans téléphone : 5 points si tu ne touches pas l’écran en roulant (5 km minimum).',
      'Danger signalé puis confirmé par un autre motard : 10 points ; confirmer le danger d’un autre : 2 points.',
      'Balade terminée avec au moins 2 participants présents : 20 points ; ouvreur et serre-file : 15 points ; point de regroupement rejoint : 5 points.',
      'Spot ajouté et bien noté par les autres (2 avis, 4 ★ de moyenne) : 15 points.',
      'Niveaux : 🔰 Apprenti, 🏍️ Motard (150), 🧭 Road Captain (750), 👑 Légende (3 000).',
    ],
    astuces: [
      'Ton score est privé : dans « Mes points › Confidentialité », choisis s’il apparaît sur ton profil et dans le classement entre amis ou de ton département.',
      'Le défi du mois rapporte un bonus une fois réussi.',
      '« Effacer mon historique » supprime tous tes points ; « Désactiver » arrête les gains.',
    ],
    limites: [
      'Jamais de points liés à la vitesse ou au chrono.',
      'Plafond de 100 points par jour (40 pour les km).',
      'Km propres et trajets sans téléphone : seulement pendant une navigation dans l’app Android.',
    ],
    motsCles: ['score', 'niveau', 'classement', 'récompense', 'road captain', 'légende', 'défi du mois'],
  },
  {
    id: 'inviter',
    theme: 'communaute',
    emoji: '📨',
    titre: 'Inviter des potes',
    but: 'Faire venir tes potes sur PasseRyder avec ton lien, ton code ou ton QR code.',
    etapes: [
      'Profil › « Inviter des potes » (aussi dans Amis, et sur la carte tant que tu n’as pas d’amis).',
      '« Partager mon lien d’invitation » : message prêt avec ton lien passeryder.fr/i/… et ton code.',
      'En vrai (au café, au rasso) : fais scanner ton QR code.',
      'Ton pote s’inscrit avec ton code (déjà rempli s’il passe par la version web) : vous devenez amis tout de suite.',
    ],
    astuces: [
      'Ton filleul peut te retirer de ses amis depuis ton profil s’il le souhaite.',
      'Points de bon comportement (si activés) : +30 quand ton filleul a terminé son profil et fait une 1re action (rejoindre une balade, ajouter un ami, signaler un danger). Badges Recruteur (3) et Ambassadeur (10).',
    ],
    limites: [
      'Un seul parrain par compte, à l’inscription.',
      'Points crédités 7 jours après l’inscription du filleul, 10 filleuls récompensés par mois au plus.',
    ],
    motsCles: ['parrainage', 'parrain', 'filleul', 'code', 'qr code', 'lien'],
  },
  {
    id: 'ta-sortie',
    theme: 'ensemble',
    emoji: '🏁',
    titre: 'Ta sortie : le récap à partager',
    but: 'Garder et partager le résumé d’une balade, d’une navigation ou d’une boucle : tracé, km, durée, dénivelé.',
    etapes: [
      'À la fin d’une navigation ou d’une boucle de plus de 5 km, l’écran « Ta sortie » s’ouvre tout seul.',
      'Balade : l’organisateur y arrive en appuyant sur « Terminer la balade » ; les participants, avec « 🏁 Ta sortie » sur la fiche de la balade.',
      'Sorties passées : Profil › Mes trajets › touche un trajet.',
      '« Partager ma sortie » envoie un lien passeryder.fr/s/… ; « Image story » ou « Image carrée » ouvre l’image sur passeryder.fr : « Partager l’image » ou « Télécharger ».',
    ],
    astuces: [
      '« Masquer le départ et l’arrivée » est activé par défaut : les 500 premiers et derniers mètres ne sont pas partagés (ton domicile reste secret).',
    ],
    limites: [
      'Jamais de vitesse maximale ni moyenne sur l’image : on ne valorise pas la vitesse.',
      'Qui a le lien peut voir le récap (tracé, km, durée, ton pseudo).',
      'La balade disparaît de la carte 1 heure après sa fin, mais son récap reste 7 jours : Profil › Mes trajets › « Balades des 7 derniers jours » (et le lien partagé marche 7 jours).',
    ],
    motsCles: ['récap', 'strava', 'story', 'instagram', 'image', 'partager', 'dénivelé'],
  },
  {
    id: 'clubs',
    theme: 'communaute',
    emoji: '🚩',
    titre: 'Clubs',
    but: 'Réunir ton groupe de motards : membres, mur, balades et événements du club.',
    etapes: [
      'Sorties › Clubs : tes clubs, puis ceux près de toi ; recherche par nom ou ville.',
      '« Créer » : nom, logo, description, ville, public (tout le monde peut rejoindre) ou sur demande.',
      'Page du club : « Rejoindre » (ou « Demander à rejoindre »), Mur, Balades et événements, Membres.',
      'Admins : « Créer une sortie » au nom du club (balade ou événement) : tous les membres sont invités automatiquement.',
      'Admins : accepter ou refuser les demandes, retirer un membre ; le fondateur nomme les admins.',
      'Menu ⋯ › « Partager le club » : lien passeryder.fr/c/… à envoyer.',
    ],
    astuces: ['Les demandes d’adhésion arrivent aussi dans l’onglet Notifs, avec Accepter / Refuser.'],
    limites: [
      'Le mur du club est réservé à ses membres.',
      'Le fondateur ne peut pas quitter son club : il le supprime (les balades et événements restent).',
      'Un club signalé 3 fois est masqué en attendant la modération.',
    ],
    motsCles: ['club', 'groupe', 'asso', 'association', 'membres', 'moto club'],
  },

  // ---------------------------------------------------------------- Sécurité
  {
    id: 'sos',
    theme: 'securite',
    emoji: '🆘',
    titre: 'Bouton SOS',
    but: 'Alerter tes contacts d’urgence avec ta position en un geste.',
    etapes: [
      'Sur la Carte, garde le bouton SOS appuyé 2 secondes.',
      'L’alerte part tout de suite à tes contacts d’urgence avec ta position (SMS et/ou notification).',
      'Un bouton « Appeler le 112 » s’affiche.',
    ],
    astuces: [
      'Pendant une balade en cours, tout le groupe est aussi prévenu.',
      'Ajoute d’abord tes contacts d’urgence, sinon personne n’est prévenu.',
    ],
    limites: ['Ne remplace pas les secours : en cas d’urgence, appelle le 112.'],
    android: true,
    motsCles: ['urgence', 'alerte', '112', 'accident'],
  },
  {
    id: 'chute',
    theme: 'securite',
    emoji: '💥',
    titre: 'Détection de chute',
    but: 'Alerter tes proches si tu chutes et ne réponds pas.',
    etapes: [
      'Active-la dans Profil › ⚙️ Paramètres › Sécurité › Détection de chute.',
      'Choisis la sensibilité : Sensible, Normal ou Peu sensible.',
      'Après un choc fort suivi d’immobilité, l’écran « Tout va bien ? » s’affiche avec une alarme.',
      'Appuie sur « Je vais bien ». Sans réponse sous 30 s, tes contacts d’urgence sont alertés avec ta position.',
    ],
    astuces: ['Trop d’alertes sur route dégradée ? Passe en « Peu sensible ».'],
    limites: [
      'Fonctionne seulement pendant une navigation ou une balade en cours, app ouverte.',
      'Une chute peut ne pas être détectée : ce n’est pas un dispositif médical.',
    ],
    android: true,
    motsCles: ['accident', 'choc', 'capteur'],
  },
  {
    id: 'je-rentre',
    theme: 'securite',
    emoji: '🏠',
    titre: 'Je rentre',
    but: 'Prévenir tes proches automatiquement si tu n’es pas arrivé à l’heure prévue.',
    etapes: [
      'Sur la Carte, appuie sur la maison 🏠 (ou Profil › ⚙️ Paramètres › Sécurité › Je rentre).',
      'Choisis ta destination et ton heure d’arrivée.',
      'Coche qui prévenir (et ajoute un numéro juste pour ce trajet si besoin).',
      'Appuie sur « Démarrer « Je rentre » ». Tes contacts reçoivent un SMS de départ.',
      'À l’arrivée, c’est fini tout seul (ou « Je suis arrivé(e) »).',
    ],
    astuces: [
      'Un rappel arrive 10 min avant l’heure prévue : « Prolonger » si tu es en retard.',
      'Sans arrivée 15 min après l’heure prévue, tes contacts sont alertés avec ta dernière position.',
    ],
    limites: [
      'Ta position est envoyée seulement quand l’app est ouverte : l’alerte donne la dernière position connue.',
    ],
    android: true,
    motsCles: ['retour', 'retard', 'arrivée', 'maison'],
  },
  {
    id: 'contacts-urgence',
    theme: 'securite',
    emoji: '🩹',
    titre: 'Contacts d’urgence',
    but: 'Choisir qui est prévenu en cas de SOS, de chute ou de retard.',
    etapes: [
      'Va dans Profil › ⚙️ Paramètres › Sécurité › Contacts d’urgence.',
      'Appuie sur « + Ajouter » : choisis dans tes contacts, saisis un numéro, ou choisis un ami PasseRyder.',
      'Appuie sur l’icône SMS d’un numéro pour envoyer un SMS de test.',
    ],
    astuces: [
      'Un ami PasseRyder est alerté dans l’app (notification + message) ; un numéro reçoit un SMS.',
      'Préviens tes contacts qu’ils sont sur ta liste.',
    ],
    limites: [
      '5 contacts maximum, portables français (06 / 07).',
      'Les numéros restent sur ton téléphone ; ils ne passent par nos serveurs qu’au moment d’envoyer un SMS.',
      'Le SMS de test utilise un crédit.',
    ],
    android: true,
    motsCles: ['sms', 'numéro', 'proches', 'famille'],
  },
  {
    id: 'sms',
    theme: 'securite',
    emoji: '✉️',
    titre: 'Les SMS d’alerte',
    but: 'Comprendre comment partent les SMS de sécurité.',
    etapes: [
      'En cas de SOS, de chute ou de « Je rentre », l’app envoie le SMS automatiquement (expéditeur « PasseRyder »).',
      'Si l’envoi automatique échoue, ton appli SMS s’ouvre avec le message prérempli : appuie sur Envoyer.',
    ],
    limites: ['10 SMS maximum par 24 h et par compte.', 'Il faut du réseau pour envoyer l’alerte.'],
    android: true,
    motsCles: ['texto', 'quota', 'envoi'],
  },
  {
    id: 'conduite',
    theme: 'securite',
    emoji: '🛑',
    titre: 'Pas d’écran en roulant',
    but: 'Garder les mains sur le guidon.',
    etapes: [
      'En navigation au-dessus de 10 km/h, la saisie de texte est bloquée.',
      'Les notifications de message restent affichées : réponds à l’arrêt.',
      'Sur la carte, l’appui long est désactivé pendant la navigation.',
    ],
    astuces: ['Utilise la voix et un intercom pour être guidé sans regarder l’écran.'],
    android: true,
    motsCles: ['distraction', 'saisie', 'bloqué'],
  },

  // ---------------------------------------------------------------- Vie privée
  {
    id: 'qui-voit',
    theme: 'vie-privee',
    emoji: '👁️',
    titre: 'Qui voit ma position',
    but: 'Choisir précisément qui peut te voir sur la carte.',
    etapes: [
      'Va dans Profil › ⚙️ Paramètres › Confidentialité › Qui voit ma position.',
      'Choisis : Visible par tous, Amis uniquement, Amis sélectionnés, ou Fantôme.',
      '« Amis sélectionnés » : coche les amis qui peuvent te voir.',
      '« Exceptions » : ajoute des amis à qui tu restes masqué.',
      'Appuie sur « Enregistrer ».',
    ],
    astuces: ['Ces règles sont appliquées par le serveur, pas seulement par l’app.'],
    limites: ['Pendant une balade en cours, les participants se voient toujours entre eux.'],
    motsCles: ['confidentialité', 'visibilité', 'position', 'amis'],
  },
  {
    id: 'fantome',
    theme: 'vie-privee',
    emoji: '👻',
    titre: 'Mode fantôme',
    but: 'Disparaître de la carte en un geste.',
    etapes: [
      'Sur la Carte, appuie sur le fantôme 👻 (sous le compteur).',
      'Le bandeau « Mode fantôme · tu es masqué » confirme que personne ne te voit.',
      'Appuie de nouveau pour réapparaître.',
    ],
    astuces: ['En fantôme, tu continues de voir tes amis.'],
    limites: ['Pendant une balade en cours, les participants te voient quand même.'],
    android: true,
    motsCles: ['invisible', 'masqué', 'cacher'],
  },
  {
    id: 'apparaitre',
    theme: 'vie-privee',
    emoji: '🫥',
    titre: 'Apparaître dans la recherche',
    but: 'Choisir si les autres motards peuvent te trouver près de chez eux.',
    etapes: [
      'Va dans Profil › ⚙️ Paramètres › Confidentialité.',
      'Active ou coupe « Apparaître dans « Trouver des motards » ».',
    ],
    limites: ['Jamais de position exacte : une distance approximative (zone de ~5 km).'],
    motsCles: ['découverte', 'opt-in'],
  },
  {
    id: 'bloquer',
    theme: 'vie-privee',
    emoji: '🚫',
    titre: 'Bloquer et signaler',
    but: 'Te protéger d’un membre ou d’un contenu gênant.',
    etapes: [
      'Ouvre le profil du motard › menu « … » › « Bloquer » ou « Signaler ce motard ».',
      'Sur une story, un spot, un avis ou un événement : menu « … » › « Signaler ». Sur une photo : le bouton de signalement de la visionneuse. Sur un message reçu : appui long.',
      'Pour débloquer : ouvre son profil › « Débloquer ».',
    ],
    astuces: [
      'Bloquer coupe tout dans les deux sens : messages, position, stories, recherche et amitié.',
      'Chaque signalement est lu par l’équipe de modération.',
    ],
    motsCles: ['harcèlement', 'modération', 'signalement', 'abus'],
  },
  {
    id: 'donnees',
    theme: 'vie-privee',
    emoji: '🗄️',
    titre: 'Tes données',
    but: 'Savoir ce qui est visible et ce qui reste privé.',
    etapes: [
      'Public pour les membres : ton pseudo, ta photo, ta bio, tes motos, tes photos et tes stats.',
      'Privé : ton prénom et ton nom (visibles par toi seul).',
      'Sur ton téléphone uniquement : Mes trajets, favoris, numéros des contacts d’urgence, réglages.',
      'Détails complets : Profil › ⚙️ Paramètres › Politique de confidentialité.',
    ],
    astuces: ['Pour exercer tes droits (accès, rectification…), écris au support.'],
    motsCles: ['rgpd', 'confidentialité', 'vie privée', 'données personnelles'],
  },

  // ---------------------------------------------------------------- Compte
  {
    id: 'profil',
    theme: 'compte',
    emoji: '🪪',
    titre: 'Profil et motos',
    but: 'Présenter qui tu es et ce que tu roules.',
    etapes: [
      'Profil › Modifier mon profil.',
      'Mets à jour ton pseudo, ta photo, ta bio, ton style, ton rythme et tes disponibilités.',
      'Dans « Mes motos » : « + Ajouter une moto » (marque, modèle, année, cylindrée, photo).',
      'Choisis ta moto principale : elle règle les itinéraires et les balades proposées.',
    ],
    astuces: ['La catégorie de ta moto (50, 125, A2, gros cube, trail) se déduit de la cylindrée.'],
    motsCles: ['pseudo', 'photo', 'bio', 'moto principale', 'cylindrée'],
  },
  {
    id: 'garage',
    theme: 'compte',
    emoji: '🔧',
    titre: 'Garage et entretien',
    but: 'Suivre le kilométrage, le plein et les entretiens de ta moto.',
    etapes: [
      'Profil › Garage et entretien › choisis ta moto.',
      'Compteur et carburant : kilométrage actuel, réservoir et consommation, ou directement l’autonomie d’un plein en km.',
      'Au départ d’une navigation (à l’arrêt) : « Plein fait ? » ou niveau approximatif (3/4, 1/2, 1/4).',
      '« + Noter un entretien » : vidange, pneus, chaîne, révision… avec date, km et coût.',
      'Rappels d’entretien : tous les X km et/ou X mois.',
      '« ⛽ J’ai fait le plein » remet l’autonomie à zéro.',
    ],
    astuces: [
      'Les km de chaque navigation s’ajoutent au compteur de ta moto principale.',
      'Notification 500 km ou 15 jours avant l’échéance, puis le jour J.',
    ],
    limites: ['Le carnet est privé : toi seul le vois.'],
    motsCles: ['vidange', 'pneus', 'chaîne', 'révision', 'carburant', 'autonomie', 'plein'],
  },
  {
    id: 'reglages',
    theme: 'compte',
    emoji: '🎨',
    titre: 'Apparence et réglages',
    but: 'Adapter l’app à tes goûts.',
    etapes: [
      'Profil › ⚙️ Paramètres.',
      'Apparence : Clair, Sombre ou Automatique.',
      'Style de carte : Classique, Sombre, ou Automatique (sombre du coucher au lever du soleil).',
      'Notifications : choisis ce que tu reçois (messages, balades, amis, dangers, entretien).',
    ],
    motsCles: ['thème', 'sombre', 'clair', 'paramètres'],
  },
  {
    id: 'mise-a-jour',
    theme: 'compte',
    emoji: '🔄',
    titre: 'Mettre à jour l’app',
    but: 'Avoir la dernière version.',
    etapes: [
      'L’app vérifie toute seule au lancement et s’installe au lancement suivant.',
      'Pour forcer : Profil › ⚙️ Paramètres › À propos › « Rechercher une mise à jour ».',
      'Certaines nouveautés demandent une mise à jour depuis Google Play.',
    ],
    android: true,
    motsCles: ['version', 'nouveautés'],
  },
  {
    id: 'aide-revoir',
    theme: 'compte',
    emoji: '💡',
    titre: 'Présentation et astuces',
    but: 'Revoir la présentation de l’app ou les bulles d’astuces.',
    etapes: [
      'Profil › ⚙️ Paramètres › Aide.',
      '« Revoir la présentation » relance les écrans de bienvenue.',
      '« Réafficher les astuces » refait apparaître les bulles sur les écrans clés.',
    ],
    motsCles: ['tutoriel', 'bienvenue', 'onboarding'],
  },
  {
    id: 'supprimer-compte',
    theme: 'compte',
    emoji: '🗑️',
    titre: 'Supprimer mon compte',
    but: 'Effacer ton compte et toutes tes données.',
    etapes: [
      'Profil › ⚙️ Paramètres › Compte › « Supprimer mon compte ».',
      'Lis ce qui sera effacé, écris le mot demandé pour confirmer.',
      'Appuie sur « Supprimer définitivement mon compte ».',
    ],
    astuces: ['Sans accès à l’app : passeryder.fr/supprimer-mon-compte.'],
    limites: ['C’est définitif : rien ne peut être récupéré.'],
    motsCles: ['désinscription', 'effacer', 'rgpd', 'fermer'],
  },
  {
    id: 'support',
    theme: 'compte',
    emoji: '✉️',
    titre: 'Contacter le support',
    but: 'Poser une question ou signaler un bug.',
    etapes: [
      'Ouvre l’Aide › « Contacter le support ».',
      'Ton appli mail s’ouvre avec la version de l’app et le modèle de ton téléphone déjà notés.',
      'Décris ton souci (ce que tu faisais, ce qui s’est passé) et envoie.',
    ],
    astuces: ['Une capture d’écran aide beaucoup.'],
    limites: ['Ta position n’est jamais ajoutée au message.'],
    motsCles: ['bug', 'problème', 'contact', 'mail', 'question'],
  },
];

export const FAQ: Question[] = [
  {
    id: 'mot-de-passe',
    q: 'J’ai oublié mon mot de passe',
    r: [
      'Sur l’écran de connexion, appuie sur « Mot de passe oublié ? » et indique ton email.',
      'Ouvre l’email reçu et appuie sur « Choisir un nouveau mot de passe » (lien valable 1 heure).',
      'Choisis ton nouveau mot de passe (8 caractères minimum) : tu es connecté directement.',
      'Sur Android, le lien te propose de continuer dans l’app ; sinon, ça marche aussi dans le navigateur.',
      'Rien reçu ? Regarde dans les spams, ou écris au support.',
    ],
    fiches: ['premiers-pas'],
  },
  {
    id: 'amis-invisibles',
    q: 'Je ne vois pas mes amis sur la carte',
    r: [
      'Vérifie que vous êtes bien amis (Profil › Amis).',
      'Ton ami doit avoir l’app Android ouverte : la position n’est pas partagée en arrière-plan.',
      'Il est peut-être en mode fantôme, ou il a choisi qui le voit (Amis sélectionnés, exceptions).',
      'Vérifie que le calque n’est pas filtré et que tu as du réseau.',
    ],
    fiches: ['carte-amis', 'qui-voit', 'fantome'],
  },
  {
    id: 'pas-de-notifs',
    q: 'Je ne reçois pas les notifications',
    r: [
      'Profil › ⚙️ Paramètres › Notifications : si « Notifications désactivées : activer » s’affiche, appuie dessus.',
      'Vérifie que le type voulu (Messages, Balades…) est activé.',
      'Dans les réglages Android, autorise les notifications de PasseRyder et désactive l’optimisation de batterie pour l’app.',
      'Sur le web, il n’y a pas de notifications : elles arrivent sur l’app Android.',
    ],
    fiches: ['notifications'],
  },
  {
    id: 'sms-parti',
    q: 'Le SMS d’alerte n’est pas parti',
    r: [
      'Il faut du réseau au moment de l’alerte.',
      'Limite : 10 SMS par 24 h et par compte.',
      'Seuls les portables français (06 / 07) sont acceptés : vérifie le numéro dans tes contacts d’urgence.',
      'Si l’envoi automatique échoue, l’app ouvre ton appli SMS avec le message prérempli : appuie sur Envoyer.',
      'Fais un « SMS de test » depuis Contacts d’urgence pour vérifier.',
    ],
    fiches: ['sms', 'contacts-urgence'],
  },
  {
    id: 'supprimer',
    q: 'Comment supprimer mon compte ?',
    r: [
      'Profil › ⚙️ Paramètres › Compte › « Supprimer mon compte ».',
      'Sans accès à l’app : passeryder.fr/supprimer-mon-compte.',
      'Tout est effacé : profil, photos, messages, balades, stories. C’est définitif.',
    ],
    fiches: ['supprimer-compte'],
  },
  {
    id: 'mes-donnees',
    q: 'Que faites-vous de mes données ?',
    r: [
      'Ta position n’est partagée qu’avec les personnes que tu autorises, et seulement app ouverte.',
      'Ton nom reste privé ; seul ton pseudo est public.',
      'Tes trajets, favoris et numéros d’urgence restent sur ton téléphone.',
      'Aucune donnée n’est vendue. Détails : passeryder.fr/confidentialite.',
    ],
    fiches: ['donnees', 'qui-voit'],
  },
  {
    id: 'pas-de-voix',
    q: 'La voix ne parle pas',
    r: [
      'Vérifie le bouton haut-parleur en navigation (voix coupée ?).',
      'Profil › ⚙️ Paramètres › Voix et alertes : guidage vocal activé, puis « Tester la voix ».',
      'Monte le volume média du téléphone (pas seulement la sonnerie).',
    ],
    fiches: ['voix'],
  },
  {
    id: 'position',
    q: 'Ma position ne s’affiche pas',
    r: [
      'Autorise la localisation pour PasseRyder dans les réglages Android (« Ouvrir les réglages » sur la carte).',
      'Active le GPS du téléphone et attends quelques secondes à l’extérieur.',
      'Sur le web, ta position n’est pas utilisée : passe par l’app Android.',
    ],
    fiches: ['carte-amis'],
  },
];

/** Écrans de bienvenue (premier lancement, puis Paramètres › Aide › Revoir la présentation) */
export const BIENVENUE: Diapo[] = [
  {
    emoji: '🗺️',
    titre: 'Tes potes en direct',
    texte: 'La carte te montre où roulent tes amis, et te guide à la voix jusqu’à ta destination.',
    points: ['Ajoute tes amis dans Profil › Amis', 'Signale les dangers avec le bouton +'],
  },
  {
    emoji: '🏍️',
    titre: 'Rouler ensemble',
    texte: 'Organise des balades, roule en convoi sans perdre personne, ou laisse l’app te tracer une boucle.',
    points: ['Onglet Sorties › Balades', 'Ouvreur, serre-file et point de regroupement', '« Fais-moi une boucle » en 2 gestes'],
  },
  {
    emoji: '🤝',
    titre: 'La communauté',
    texte: 'Photos, stories, messages, spots motards et événements près de chez toi.',
    points: ['Le Mur pour l’actu de tes amis', 'Sorties › Lieux et Événements'],
  },
  {
    emoji: '🆘',
    titre: 'Ta sécurité',
    texte: 'Un SOS en 2 secondes, la détection de chute et « Je rentre » pour rassurer tes proches.',
    points: ['Bouton SOS : appui long 2 s', 'Chute : alerte si tu ne réponds pas', 'Je rentre : alerte si tu n’arrives pas'],
  },
  {
    emoji: '👻',
    titre: 'Ta vie privée',
    texte: 'Tu choisis qui te voit. Un appui sur le fantôme et tu disparais de la carte.',
    points: ['Seul ton pseudo est public', 'Position partagée seulement app ouverte'],
  },
];

/** Dernier écran de la présentation : pourquoi on demande les autorisations */
export const PERMISSIONS = {
  titre: 'C’est presque prêt',
  texte: 'Deux autorisations rendent l’app vraiment utile. Tu peux les changer à tout moment.',
  position: 'Position : pour te montrer sur la carte, te guider et alerter tes proches en cas de pépin.',
  notifications: 'Notifications : pour les messages, les invitations, les dangers proches et les alertes de tes proches.',
  contacts: 'Ajoute 1 à 5 contacts d’urgence : ils seront prévenus en cas de SOS, de chute ou de retard.',
};

/** Bulles affichées une seule fois, la première fois qu'on ouvre l'écran */
export const ASTUCES: Record<AstuceId, Astuce> = {
  carte: {
    titre: 'Bienvenue sur la carte',
    texte:
      'Appui long sur la carte pour poser un point (Aller ici, balade, signaler). Le + ajoute un danger, un spot ou une boucle. 👻 te rend invisible.',
    fiche: 'carte-amis',
  },
  balade: {
    titre: 'Créer une balade',
    texte: 'Choisis le départ et l’arrivée : le tracé se calcule tout seul. Tu peux aussi importer un GPX. Invite tes amis une fois créée.',
    fiche: 'balade-creer',
  },
  convoi: {
    titre: 'Le convoi',
    texte:
      'Pointe ta présence au RDV. L’organisateur choisit un ouvreur 🚩 et un serre-file 🧹 : ils seront prévenus si quelqu’un décroche.',
    fiche: 'convoi',
  },
  'je-rentre': {
    titre: 'Je rentre',
    texte: 'Indique où tu vas et à quelle heure. Si tu n’es pas arrivé 15 min après, tes contacts reçoivent ta dernière position.',
    fiche: 'je-rentre',
  },
  boucle: {
    titre: 'Fais-moi une boucle',
    texte: 'Choisis le départ (ta position, une adresse ou un spot), une durée et le niveau de virages : l’app te propose 2 ou 3 boucles qui y reviennent.',
    fiche: 'boucle',
  },
  spots: {
    titre: 'Ajouter un spot',
    texte: 'Partage un bon coin avec la communauté : catégorie, nom, photo et ta note. Les autres pourront donner leur avis.',
    fiche: 'spots',
  },
};

// ---------------------------------------------------------------- Outils

export const themeInfo = (id: ThemeId) => THEMES.find((t) => t.id === id)!;
export const ficheById = (id: string) => FICHES.find((f) => f.id === id);
export const fichesOfTheme = (id: ThemeId) => FICHES.filter((f) => f.theme === id);

/** Minuscules, sans accents (recherche) */
export function fold(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ');
}

/** Recherche dans les fiches et la FAQ : tous les mots doivent être présents */
export function searchGuide(query: string): { fiches: Fiche[]; faq: Question[] } {
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return { fiches: [], faq: [] };
  const match = (text: string) => {
    const t = fold(text);
    return words.every((w) => t.includes(w));
  };
  const ficheText = (f: Fiche) =>
    [f.titre, f.but, ...f.etapes, ...(f.astuces ?? []), ...(f.limites ?? []), ...(f.motsCles ?? []), themeInfo(f.theme).titre].join(' ');
  // Titre trouvé d'abord
  const fiches = FICHES.filter((f) => match(ficheText(f))).sort(
    (a, b) => Number(match(b.titre)) - Number(match(a.titre)),
  );
  const faq = FAQ.filter((q) => match([q.q, ...q.r].join(' ')));
  return { fiches, faq };
}
