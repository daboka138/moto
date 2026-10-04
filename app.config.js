// Complète app.json. google-services.json (Firebase, notifications push Android) : fourni au
// serveur de build par la variable d'environnement EAS de type fichier GOOGLE_SERVICES_JSON
// (preview + production). Pas de repli sur un fichier local : il est ignoré par Git, donc
// jamais envoyé au serveur (et l'EAS CLI afficherait un avertissement trompeur).
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
