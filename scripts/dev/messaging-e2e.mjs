// Usage (bash) : charger .env.supabase, puis node scripts/dev/messaging-e2e.mjs
// Messagerie v2 de bout en bout avec 2 comptes JETABLES (supprimés à la fin) : mêmes appels que
// l'app (lib/messages.ts) et réception en TEMPS RÉEL chez l'autre membre.
import './prod-guard.mjs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)
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
const results = [];
const check = (ok, label) => {
  results.push(ok);
  console.log(ok ? '✓' : '✗', label);
};
const client = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

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
  await c.from('profile_private').upsert({ user_id: id, first_name: 'Test', last_name: tag });
  const p = await c.from('profiles').upsert({ id, username: `msg${tag}${Date.now().toString(36).slice(-5)}`, avatar_path: `${id}/a.jpg` });
  if (p.error) throw p.error;
  c.realtime.setAuth(s.data.session.access_token);
  return { c, id };
}

const a = await account('a');
const b = await account('b');
try {
  await sql(`insert into public.friendships (requester_id, addressee_id, status) values ('${a.id}', '${b.id}', 'accepted')`);

  // Groupe créé par a
  const { data: conv, error: e1 } = await a.c.rpc('create_group', { p_title: 'E2E', p_photo_path: null, p_members: [b.id] });
  check(!e1 && conv, `création du groupe ${e1?.message ?? ''}`);

  // a écoute la conversation comme l'écran de chat
  const seen = { insert: 0, update: 0, reaction: 0, member: 0 };
  const filter = `conversation_id=eq.${conv}`;
  const channel = a.c
    .channel(`chat:${conv}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, () => seen.insert++)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, () => seen.update++)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter }, () => seen.reaction++)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter }, () => seen.member++);
  await new Promise((res) => channel.subscribe((s) => s === 'SUBSCRIBED' && res()));
  await sleep(1500);

  // b écrit, a réagit / b réagit
  const ins = await b.c.from('messages').insert({ conversation_id: conv, sender_id: b.id, body: 'salut le groupe' }).select('id').single();
  check(!ins.error, `message de b ${ins.error?.message ?? ''}`);
  const msg = ins.data.id;
  const r1 = await b.c.rpc('react_message', { p_id: msg, p_emoji: '🔥' });
  check(r1.data === '🔥', `réaction 🔥 (${r1.data ?? r1.error?.message})`);
  await sleep(3000);
  console.log('   (réactions reçues par a après 3 s :', seen.reaction, ')');
  const ed = await b.c.rpc('edit_message', { p_id: msg, p_body: 'salut le groupe !' });
  check(!ed.error, `modification ${ed.error?.message ?? ''}`);
  const { data: edited } = await a.c.from('messages').select('body, edited_at').eq('id', msg).single();
  check(edited?.body === 'salut le groupe !' && edited.edited_at, 'nouvelle version + « modifié » chez a');
  const rep = await a.c.from('messages').insert({ conversation_id: conv, sender_id: a.id, body: 'réponse', reply_to_id: msg }).select('reply_to_id').single();
  check(!rep.error && rep.data.reply_to_id === msg, `réponse à un message ${rep.error?.message ?? ''}`);
  const wp = await b.c.rpc('set_chat_wallpaper', { p_conversation: conv, p_kind: 'preset', p_value: 'nuit', p_dim: 20, p_all: false });
  check(!wp.error, `fond d'écran de b ${wp.error?.message ?? ''}`);
  const { data: wpB } = await b.c.from('chat_wallpapers').select('value');
  const { data: wpA } = await a.c.from('chat_wallpapers').select('value');
  check(wpB?.length === 1 && wpA?.length === 0, `fond de b invisible pour a (b ${wpB?.length}, a ${wpA?.length})`);
  const wpPath = `${b.id}/wp-test.jpg`;
  const up = await b.c.storage.from('wallpapers').upload(wpPath, new Uint8Array([255, 216, 255, 217]), { contentType: 'image/jpeg' });
  check(!up.error, `photo de fond envoyée ${up.error?.message ?? ''}`);
  const upA = await a.c.storage.from('wallpapers').upload(`${b.id}/intrus.jpg`, new Uint8Array([1]), { contentType: 'image/jpeg' });
  check(!!upA.error, 'a ne peut pas écrire dans le dossier de b');
  const sA = await a.c.storage.from('wallpapers').createSignedUrl(wpPath, 60);
  const sB = await b.c.storage.from('wallpapers').createSignedUrl(wpPath, 60);
  check(!!sA.error && !sB.error, 'photo de fond lisible par b seul');
  await b.c.storage.from('wallpapers').remove([wpPath]);
  const dl = await b.c.rpc('delete_message_for_all', { p_id: msg });
  check(!dl.error, `suppression pour tous ${dl.error?.message ?? ''}`);
  const md = await b.c.rpc('mark_delivered');
  check(!md.error, `« reçu » ${md.error?.message ?? ''}`);
  const rd = await b.c.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conv).eq('user_id', b.id);
  check(!rd.error, `lu ${rd.error?.message ?? ''}`);
  const mu = await b.c.rpc('set_conversation_mute', { p_conv: conv, p_until: 'infinity' });
  check(!mu.error, `sourdine ${mu.error?.message ?? ''}`);
  await sleep(4000);

  check(seen.insert >= 1, `temps réel chez a : nouveau message (${seen.insert})`);
  check(seen.reaction >= 1, `temps réel chez a : réaction (${seen.reaction})`);
  check(seen.update >= 2, `temps réel chez a : modifié + supprimé (${seen.update})`);
  check(seen.member >= 1, `temps réel chez a : lu / reçu de b (${seen.member})`);

  const { data: m2 } = await a.c.from('messages').select('body, image_path, deleted_at').eq('id', msg).single();
  check(m2 && m2.body === null && m2.deleted_at, 'contenu effacé, « Message supprimé » chez a');
  const { data: list } = await b.c.rpc('my_conversations');
  const g = list?.find((x) => x.id === conv);
  check(g && g.kind === 'group' && g.title === 'E2E' && g.muted_until, 'liste de b : groupe en sourdine');
  const { data: aList } = await a.c.rpc('my_conversations');
  check(aList?.find((x) => x.id === conv)?.muted_until === null, 'sourdine de b invisible pour a');
  const lv = await b.c.rpc('leave_group', { p_conv: conv });
  check(!lv.error, `b quitte le groupe ${lv.error?.message ?? ''}`);
  a.c.removeChannel(channel);
} finally {
  for (const u of [a, b]) {
    const { error } = await u.c.functions.invoke('delete-account', { method: 'POST' });
    if (error) await sql(`delete from auth.users where id = '${u.id}' and email like 'passeryder+test-msg-%'`);
  }
  const left = await sql(`select count(*)::int as n from auth.users where email like 'passeryder+test-msg-%'`);
  console.log('comptes de test restants :', left[0].n);
  console.log(results.every(Boolean) ? 'TOUT OK' : 'ÉCHECS');
  process.exit(0);
}
