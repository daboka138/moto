// Usage (bash) : charger .env.supabase, puis node scripts/dev/welcome-test.mjs
// Joue la migration « message de bienvenue » + les scénarios de welcome-test.sql dans une transaction
// TOUJOURS annulée (erreur « RAPPORT » volontaire) : rien n'est gardé en base.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = import.meta.dirname;
// Migrations déjà appliquées : seule la dernière (create or replace) est rejouée
const migration = ['20261026000100_welcome_unread.sql']
  .map((f) => readFileSync(join(dir, '..', '..', 'supabase', 'migrations', f), 'utf8'))
  .join('\n');
const query = readFileSync(join(dir, 'welcome-test.sql'), 'utf8').replace('-- @@MIGRATION@@', () => migration);
const r = await fetch('https://api.supabase.com/v1/projects/yfewldnhnnrzzscmfjsd/database/query', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await r.text();
const m = text.match(/RAPPORT([\s\S]*?)(?:\n\s*CONTEXT|"\}|$)/);
console.log(m ? m[1].replace(/\n/g, '\n').replace(/\\"/g, '"') : `Pas de rapport (${r.status}) : ${text.slice(0, 1500)}`);
