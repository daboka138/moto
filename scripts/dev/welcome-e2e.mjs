// Usage (bash) : charger .env.supabase, puis node scripts/dev/welcome-e2e.mjs
// Bienvenue de bout en bout avec un compte JETABLE (supprimé à la fin, conversation comprise) :
// compte créé = rien ; profil créé (fin d'inscription) = conversation avec le créateur + message
// + notification ; vu par le membre comme une conversation normale (my_conversations).
// Pas de réponse envoyée ici (elle notifierait le vrai compte admin) : voir welcome-test.sql.
import './prod-guard.mjs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^EXPO_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]),
);
const sql = async (query) => {
  const r = await fetch('https://api.supabase.com/v1/projects/yfewldnhnnrzzscmfjsd/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};
const results = [];
const check = (ok, label) => {
  results.push(ok);
  console.log(ok ? '✓' : '✗', label);
};

const c = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const email = `passeryder+test-welcome-${Date.now()}@gmail.com`;
const password = `Test-${Math.random().toString(36).slice(2)}-9aA`;
const { data, error } = await c.auth.signUp({ email, password, options: { data: { terms_version: '2026-09-27' } } });
if (error) throw error;
const id = data.user.id;
try {
  await sql(`update auth.users set email_confirmed_at = now() where id = '${id}' and email like 'passeryder+test-welcome-%'`);
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;

  let convs = (await c.rpc('my_conversations')).data ?? [];
  check(convs.length === 0, 'compte créé, profil pas encore fait : aucune conversation');

  const username = `wel${Date.now().toString(36).slice(-6)}`;
  await c.from('profile_private').upsert({ user_id: id, first_name: 'Test', last_name: 'Bienvenue' });
  const p = await c.from('profiles').upsert({ id, username, avatar_path: `${id}/a.jpg` });
  check(!p.error, `profil créé ${p.error?.message ?? ''}`);

  const { data: creator } = await c.from('app_settings').select('value').eq('key', 'creator_user_id').single();
  convs = (await c.rpc('my_conversations')).data ?? [];
  const conv = convs.find((x) => x.kind === 'direct' && x.other_id === creator?.value);
  check(!!conv, `conversation avec le créateur (@${conv?.other_username ?? '?'}) dans ma liste`);
  check(conv?.unread === 1, `1 message non lu (${conv?.unread})`);
  const { data: msgs } = await c.from('messages').select('sender_id, body').eq('conversation_id', conv?.id);
  check(msgs?.length === 1 && msgs[0].sender_id === creator?.value, 'message envoyé par le créateur');
  check(msgs?.[0]?.body?.startsWith(`Salut ${username}, bienvenue sur PasseRyder`), 'pseudo remplacé dans le texte');
  const { data: notifs } = await c.from('notifications').select('type, actor_id, body').eq('user_id', id);
  check(notifs?.some((n) => n.type === 'message' && n.actor_id === creator?.value), `notification : ${notifs?.[0]?.body?.slice(0, 50)}…`);
  const { error: denied } = await c.rpc('admin_welcome');
  check(!!denied, 'console bienvenue refusée à un membre');
} finally {
  // Conversation de test supprimée (sinon elle resterait chez l'admin), puis le compte
  await sql(`delete from public.conversations c where c.kind = 'direct' and exists (
    select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = '${id}')`);
  await sql(`delete from auth.users where id = '${id}' and email like 'passeryder+test-welcome-%'`);
}
const ko = results.filter((r) => !r).length;
console.log(ko ? `\n${ko} échec(s)` : `\nTout est bon (${results.length} vérifications)`);
process.exit(ko ? 1 : 0);
