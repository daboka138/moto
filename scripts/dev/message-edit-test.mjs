// Usage (bash) : charger .env.supabase, puis
//   node --import ./scripts/dev/register.mjs scripts/dev/message-edit-test.mjs
// « ✏️ Modifier » sur MES messages pendant 1 h, quel que soit le statut : envoyé, reçu (✓✓), vu
// (✓✓ bleu), en privé et en groupe. Règle pure (lib/message-rules.ts) sur les messages tels que
// l'app les reçoit (REST et temps réel) + edit_message accepté par le serveur. 2 comptes JETABLES.
import './prod-guard.mjs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canDeleteForAll, canEditMessage, timestampMs } from '@/lib/message-rules';

const results = [];
const check = (ok, label) => {
  results.push(ok);
  console.log(ok ? '✓' : '✗', label);
};

// ---------- Règle pure ----------
const T = Date.UTC(2026, 9, 17, 10, 0, 0, 329);
check(timestampMs('2026-10-17T10:00:00.329098+00:00') === T, 'date avec microsecondes');
check(timestampMs('2026-10-17 10:00:00.329+00') === T, 'date au format Postgres (espace, +00)');
check(timestampMs('2026-10-17T12:00:00.329+02:00') === T, 'fuseau +02:00');
check(timestampMs('2026-10-17T10:00:00.329Z') === T, 'fuseau Z');
check(timestampMs('2026-10-17T10:00:00.329') === T, 'sans fuseau = UTC');
const me = 'me';
const base = { senderId: me, body: 'salut', createdAt: '2026-10-17T10:00:00.329098+00:00', kind: 'user', tripShareId: null, deletedAt: null };
check(canEditMessage(base, me, T + 1000), 'mon message à 1 s : modifiable');
check(canEditMessage(base, me, T + 59 * 60_000), 'à 59 min : modifiable');
check(!canEditMessage(base, me, T + 61 * 60_000), 'à 61 min : plus modifiable');
check(canEditMessage(base, me, T - 5 * 60_000), 'horloge du téléphone en retard : modifiable');
check(!canEditMessage({ ...base, senderId: 'other' }, me, T + 1000), 'message d’un autre : non');
check(!canEditMessage({ ...base, body: null }, me, T + 1000), 'photo seule : non');
check(!canEditMessage({ ...base, deletedAt: base.createdAt }, me, T + 1000), 'message supprimé : non');
check(!canEditMessage({ ...base, tripShareId: 'x' }, me, T + 1000), 'trajet partagé : non');
check(!canEditMessage(base, '', T + 1000), 'pas encore connecté : non');
check(canDeleteForAll({ ...base, body: null }, me, T + 1000), 'supprimer pour tous (photo, 1 s) : oui');

// ---------- Serveur ----------
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = () =>
  createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
// Même conversion que toMessage (lib/messages.ts)
const toMessage = (r) => ({
  senderId: r.sender_id,
  body: r.body,
  createdAt: r.created_at,
  kind: r.kind ?? 'user',
  tripShareId: r.trip_share_id ?? null,
  deletedAt: r.deleted_at ?? null,
});

async function account(tag) {
  const c = client();
  const email = `passeryder+test-msg-${tag}-${Date.now()}@gmail.com`;
  const password = `Test-${Math.random().toString(36).slice(2)}-9aA`;
  const { data, error } = await c.auth.signUp({ email, password, options: { data: { terms_version: '2026-09-27' } } });
  if (error) throw error;
  const id = data.user.id;
  await sql(`update auth.users set email_confirmed_at = now() where id = '${id}' and email like 'passeryder+test-msg-%'`);
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const p = await c.from('profiles').upsert({ id, username: `ed${tag}${Date.now().toString(36).slice(-5)}`, avatar_path: `${id}/a.jpg` });
  if (p.error) throw p.error;
  c.realtime.setAuth(s.data.session.access_token);
  return { c, id };
}

async function scenario(label, a, b, conv) {
  const live = [];
  const channel = a.c
    .channel(`chat:${conv}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv}` }, (p) =>
      live.push(p.new),
    );
  await new Promise((res) => channel.subscribe((s) => s === 'SUBSCRIBED' && res()));
  await sleep(1200);
  const ins = await a.c.from('messages').insert({ conversation_id: conv, sender_id: a.id, body: 'v0' }).select('id').single();
  if (ins.error) throw ins.error;
  const id = ins.data.id;
  await sleep(2000);
  const states = [
    ['envoyé', async () => {}],
    ['reçu', async () => b.c.rpc('mark_delivered')],
    [
      'vu',
      async () =>
        b.c.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conv).eq('user_id', b.id),
    ],
  ];
  for (const [i, [state, apply]] of states.entries()) {
    await apply();
    await sleep(800);
    const { data: other } = await a.c
      .from('conversation_members')
      .select('last_read_at, delivered_at')
      .eq('conversation_id', conv)
      .eq('user_id', b.id)
      .single();
    const { data: row } = await a.c.from('messages').select('*').eq('id', id).single();
    const rt = [...live].reverse().find((r) => r.id === id);
    const statusOk =
      state === 'envoyé'
        ? (!other.delivered_at || other.delivered_at < row.created_at) && other.last_read_at < row.created_at
        : state === 'reçu'
          ? other.delivered_at >= row.created_at && other.last_read_at < row.created_at
          : other.last_read_at >= row.created_at;
    check(statusOk, `${label} · ${state} : statut réel = ${state}`);
    check(canEditMessage(toMessage(row), a.id), `${label} · ${state} : ✏️ Modifier proposé (message lu par REST)`);
    check(!!rt && canEditMessage(toMessage(rt), a.id), `${label} · ${state} : ✏️ Modifier proposé (message reçu en temps réel)`);
    check(!canEditMessage(toMessage(row), b.id), `${label} · ${state} : pas de Modifier chez l’autre`);
    const ed = await a.c.rpc('edit_message', { p_id: id, p_body: `v${i + 1}` });
    check(!ed.error, `${label} · ${state} : modification acceptée par le serveur ${ed.error?.message ?? ''}`);
    await sleep(1200);
    const after = [...live].reverse().find((r) => r.id === id);
    check(after?.body === `v${i + 1}` && canEditMessage(toMessage(after), a.id), `${label} · ${state} : encore modifiable après modification`);
  }
  // Plus d'1 h : refusé (date vieillie côté base)
  await sql(`update public.messages set created_at = now() - interval '61 minutes' where id = '${id}'`);
  const { data: old } = await a.c.from('messages').select('*').eq('id', id).single();
  check(!canEditMessage(toMessage(old), a.id), `${label} · après 1 h : plus de Modifier`);
  const late = await a.c.rpc('edit_message', { p_id: id, p_body: 'trop tard' });
  check(!!late.error, `${label} · après 1 h : refusé par le serveur`);
  await a.c.removeChannel(channel);
}

const a = await account('a');
const b = await account('b');
try {
  await sql(`insert into public.friendships (requester_id, addressee_id, status) values ('${a.id}', '${b.id}', 'accepted')`);
  const direct = await a.c.rpc('get_or_create_direct_conversation', { other: b.id });
  if (direct.error) throw direct.error;
  await scenario('privé', a, b, direct.data);
  const group = await a.c.rpc('create_group', { p_title: 'Modif', p_photo_path: null, p_members: [b.id] });
  if (group.error) throw group.error;
  await scenario('groupe', a, b, group.data);
} finally {
  await sql(`delete from auth.users where id in ('${a.id}', '${b.id}') and email like 'passeryder+test-msg-%'`);
}
const ko = results.filter((r) => !r).length;
console.log(ko ? `\n${ko} échec(s)` : `\nTout est bon (${results.length} vérifications)`);
process.exit(ko ? 1 : 0);
