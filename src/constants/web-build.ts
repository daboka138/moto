// Identifiant de la version web. Réécrit par scripts/web-build.mjs le temps du build puis remis à 'dev'.
// (Un fichier plutôt qu'une variable EXPO_PUBLIC_ : Metro garde en cache la transformation d'un fichier
// inchangé, et l'ancienne valeur restait intégrée au bundle → bandeau « Nouvelle version » sans fin.)
export const WEB_BUILD: string = 'dev';
