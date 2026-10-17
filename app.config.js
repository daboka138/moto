// Complète app.json. google-services.json (Firebase, notifications push Android) : fourni au
// serveur de build par la variable d'environnement EAS de type fichier GOOGLE_SERVICES_JSON
// (preview + production). Pas de repli sur un fichier local : il est ignoré par Git, donc
// jamais envoyé au serveur (et l'EAS CLI afficherait un avertissement trompeur).
//
// « Nouveautés » : 1re ligne de nouveautes.txt, lue au moment de `eas update` et rangée dans
// extra.whatsNew du manifeste : l'app l'affiche dans le bandeau « Mise à jour prête ».
const fs = require('fs');
const path = require('path');

function whatsNew() {
  try {
    return fs.readFileSync(path.join(__dirname, 'nouveautes.txt'), 'utf8').split('\n')[0].trim().slice(0, 200);
  } catch {
    return '';
  }
}

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    extra: { ...config.extra, whatsNew: whatsNew() },
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
