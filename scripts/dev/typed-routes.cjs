// Régénère .expo/types/router.d.ts sans lancer Metro (nouvel écran → à lancer avant tsc)
// node scripts/dev/typed-routes.cjs
const path = require('node:path');
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(__dirname, '../../src/app');
const m = require('../../node_modules/expo/node_modules/@expo/cli/node_modules/@expo/router-server/build/typed-routes/index.js');
m.regenerateDeclarations(path.resolve(__dirname, '../../.expo/types'), {});
setTimeout(() => console.log('.expo/types/router.d.ts régénéré'), 1500);
