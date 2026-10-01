const fs = require('fs');

// Complète app.json. google-services.json (Firebase, notifications push Android) :
// - build EAS : variable d'environnement EAS de type fichier GOOGLE_SERVICES_JSON
// - sinon : fichier google-services.json à la racine, s'il existe (ignoré par Git)
module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
