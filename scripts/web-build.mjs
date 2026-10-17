// Build de la version web (npm run web:build) : expo export + dist/version.json.
// EXPO_PUBLIC_WEB_BUILD (identifiant de cette version) est inclus dans le code ; l'app web
// compare régulièrement /version.json à cet identifiant et propose « Recharger » s'il change.
// Message « Nouveautés » : 1re ligne de nouveautes.txt (comme pour eas update).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const build = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
let message = '';
try {
  message = readFileSync(join(root, 'nouveautes.txt'), 'utf8').split('\n')[0].trim().slice(0, 200);
} catch {
  // pas de nouveautés
}
const r = spawnSync('npx expo export --platform web', {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_WEB_BUILD: build },
});
if (r.status !== 0) process.exit(r.status ?? 1);
writeFileSync(join(root, 'dist', 'version.json'), JSON.stringify({ build, message }) + '\n');
console.log(`dist/version.json : ${build}`);
