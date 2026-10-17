// Build de la version web (npm run web:build) : expo export + dist/version.json.
// L'identifiant de cette version est écrit dans src/constants/web-build.ts le temps du build (contenu
// modifié = module retransformé par Metro, jamais une valeur en cache), puis le fichier est remis à 'dev'.
// L'app web compare régulièrement /version.json à cet identifiant et propose « Recharger » s'il change.
// Message « Nouveautés » : 1re ligne de nouveautes.txt (comme pour eas update).
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const build = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
let message = '';
try {
  message = readFileSync(join(root, 'nouveautes.txt'), 'utf8').split('\n')[0].trim().slice(0, 200);
} catch {
  // pas de nouveautés
}

const idFile = join(root, 'src', 'constants', 'web-build.ts');
const original = readFileSync(idFile, 'utf8');
const stamped = original.replace(/WEB_BUILD: string = '[^']*'/, `WEB_BUILD: string = '${build}'`);
if (stamped === original && !original.includes(`'${build}'`)) {
  console.error('src/constants/web-build.ts : ligne WEB_BUILD introuvable');
  process.exit(1);
}
writeFileSync(idFile, stamped);
let status = 1;
try {
  const r = spawnSync('npx expo export --platform web', { cwd: root, stdio: 'inherit', shell: true });
  status = r.status ?? 1;
} finally {
  writeFileSync(idFile, original);
}
if (status !== 0) process.exit(status);

// Vérification : l'identifiant doit être dans le bundle, sinon le bandeau ne partirait jamais
const jsDir = join(root, 'dist', '_expo', 'static', 'js', 'web');
const found = readdirSync(jsDir).some((f) => f.endsWith('.js') && readFileSync(join(jsDir, f), 'utf8').includes(build));
if (!found) {
  console.error(`Identifiant ${build} absent du bundle : build refusé (relancer avec npx expo export --clear)`);
  process.exit(1);
}
writeFileSync(join(root, 'dist', 'version.json'), JSON.stringify({ build, message }) + '\n');
console.log(`dist/version.json : ${build} (présent dans le bundle)`);
