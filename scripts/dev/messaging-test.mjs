// Usage (bash) : charger .env.supabase, puis node scripts/dev/messaging-test.mjs
// Joue la migration messagerie v2 + les scénarios de messaging-test.sql dans une transaction
// TOUJOURS annulée (erreur « RAPPORT » volontaire) : rien n'est gardé en base.
import './prod-guard.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = import.meta.dirname;
const migration = readFileSync(join(dir, '..', '..', 'supabase', 'migrations', '20261024000000_messaging_v2.sql'), 'utf8');
const query = readFileSync(join(dir, 'messaging-test.sql'), 'utf8').replace('-- @@MIGRATION@@', () => migration);
const r = await fetch('https://api.supabase.com/v1/projects/yfewldnhnnrzzscmfjsd/database/query', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await r.text();
const m = text.match(/RAPPORT([\s\S]*?)(?:\n\s*CONTEXT|"\}|$)/);
console.log(m ? m[1].replace(/\n/g, '\n').replace(/\\"/g, '"') : `Pas de rapport (${r.status}) : ${text.slice(0, 1500)}`);
