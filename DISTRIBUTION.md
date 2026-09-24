# Distribution Android aux testeurs (EAS Build + EAS Update)

App : **MotoPotes** — identifiant `com.dkelec.moto`.
Profil de build : `preview` (APK installable, canal de mises à jour `preview`, environnement EAS `preview`).

Toutes les commandes se lancent **dans un PowerShell séparé**, dans `C:\projets\moto`
(elles sont interactives). Aucune n'a besoin du serveur Expo.

---

## 1. Préparation (une seule fois)

### 1.1 Installer EAS CLI et se connecter
```powershell
npm install -g eas-cli
eas login
eas whoami
```
Pas encore de compte ? Crée-le sur https://expo.dev/signup.

### 1.2 Créer le projet EAS
```powershell
eas init
```
Ajoute `extra.eas.projectId` (et `owner`) dans `app.json`.

### 1.3 Configurer les mises à jour à distance
```powershell
eas update:configure
```
Ajoute `updates.url` (`https://u.expo.dev/<projectId>`) dans `app.json`.
La `runtimeVersion` est déjà réglée sur la version de l'app (`policy: appVersion`).

### 1.4 Variables Supabase pour les builds
Le fichier `.env` n'est **pas** envoyé aux serveurs EAS. Copie les deux valeurs de ton `.env` :
```powershell
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://yfewldnhnnrzzscmfjsd.supabase.co" --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "COLLE_ICI_LA_CLE_PUBLISHABLE" --environment preview --visibility plaintext
eas env:list --environment preview
```
La clé *publishable* est faite pour être dans l'app. Ne mets **jamais** ici le token Supabase ni le mot de passe de la base.

### 1.5 Commit
`eas init` et `eas update:configure` ont modifié `app.json` : fais un commit.

---

## 2. Construire l'APK

```powershell
eas build -p android --profile preview
```
- Première fois : réponds **Oui** pour générer la clé de signature Android (gardée par EAS).
- Durée : 10 à 20 min. Le numéro de build (versionCode) augmente tout seul.
- À la fin : un lien et un QR code vers la page de l'APK (aussi dans expo.dev > projet > Builds).

## 3. Installer chez les testeurs

1. Envoie-leur le lien (ou le QR code) de la page du build.
2. Sur leur téléphone Android : ouvrir le lien → **Install** → télécharger l'APK.
3. Autoriser l'installation d'applis de **sources inconnues** pour le navigateur quand Android le demande.
4. Ouvrir MotoPotes, accepter la localisation, créer son compte.

Le mode démo est **désactivé** par défaut ; il s'active dans Paramètres > Démonstration.
Un nouvel APK s'installe par-dessus l'ancien (mêmes identifiant et signature) : pas besoin de désinstaller.

---

## 4. Mettre à jour à distance (sans nouvel APK)

Pour toute modification de **code JavaScript / TypeScript, textes, styles, images** :
```powershell
eas update --channel preview --environment preview --message "Ce qui change"
```
- Durée : 1 à 2 min.
- Les testeurs la reçoivent **au prochain lancement** de l'app (téléchargée au lancement, appliquée au lancement suivant),
  ou **tout de suite** avec Paramètres > À propos > **Rechercher une mise à jour**.
- Paramètres > À propos affiche la version, le canal et la date de la mise à jour installée.

### Annuler une mise à jour ratée
```powershell
eas update:list --branch preview
eas update:republish --group <id-du-groupe-précédent>
```
(ou `eas update:rollback`, qui propose les choix de façon interactive)

---

## 5. Quand refaire un APK au lieu d'une mise à jour

Une mise à jour à distance ne peut **pas** changer la partie native. Il faut un nouvel APK si :
- un paquet avec du code natif est ajouté (`npx expo install ...`) ;
- `app.json` change côté natif : permissions, icône, nom, identifiant, plugins, splash ;
- le SDK Expo est mis à jour.

Procédure :
1. Augmenter `version` dans `app.json` (ex. `1.0.0` → `1.0.1`).
   Les mises à jour ne vont qu'aux APK de la **même** version : les anciens APK n'en recevront plus.
2. `eas build -p android --profile preview`
3. Envoyer le nouveau lien aux testeurs.

---

## Aide-mémoire

| Action | Commande |
|---|---|
| Qui suis-je ? | `eas whoami` |
| Nouvel APK | `eas build -p android --profile preview` |
| Liste des builds | `eas build:list --platform android` |
| Mise à jour à distance | `eas update --channel preview --environment preview --message "..."` |
| Liste des mises à jour | `eas update:list --branch preview` |
| Variables d'environnement | `eas env:list --environment preview` |

## iPhone

Pas possible gratuitement : l'Expo Go de l'App Store s'arrête au SDK 54 et le projet est en SDK 57.
Il faut un compte Apple Developer (99 $/an), puis un build iOS distribué par TestFlight
(`eas build -p ios --profile preview` + `eas submit -p ios`).
