// Usage (bash) : charger .env.supabase (voir CLAUDE.md), puis node scripts/dev/onboarding-test.mjs
// l'Edge Function delete-account) : création, photo, profil comme dans l'app, moto, suppression.
// « Confirm email » étant activé, le compte est confirmé par l'API de gestion (SUPABASE_ACCESS_TOKEN).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const env = Object.fromEntries(
  readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => /^EXPO_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]),
);
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const step = async (name, fn) => {
  try { const r = await fn(); console.log('✓', name); return r; } catch (e) { console.log('✗', name, '→', e?.message ?? e); throw e; }
};
const REF = 'yfewldnhnnrzzscmfjsd';
export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`API de gestion ${r.status} : ${await r.text()}`);
  return r.json();
}
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('Charger .env.supabase avant (SUPABASE_ACCESS_TOKEN)');
const email = `passeryder+test-inscription-${Date.now()}@gmail.com`;
const password = `Test-${Math.random().toString(36).slice(2)}-9aA`;
const { data: created } = await step('création du compte', async () => {
  const r = await supabase.auth.signUp({ email, password, options: { data: { terms_version: '2026-09-27' } } });
  if (r.error) throw r.error; return r;
});
const uid = created.user.id;
await step('confirmation du compte de test (API de gestion)', () =>
  sql(`update auth.users set email_confirmed_at = now() where id = '${uid}' and email like 'passeryder+test-inscription-%'`));
await step('connexion', async () => { const r = await supabase.auth.signInWithPassword({ email, password }); if (r.error) throw r.error; });
try {
  // JPEG minimal (1×1)
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const path = `${uid}/avatar-${Date.now()}.jpg`;
  await step('envoi de la photo de profil', async () => { const { error } = await supabase.storage.from('photos').upload(path, jpeg, { contentType: 'image/jpeg' }); if (error) throw error; });
  await step('identité privée', async () => { const { error } = await supabase.from('profile_private').upsert({ user_id: uid, first_name: 'Test', last_name: 'Inscription' }); if (error) throw error; });
  await step('profil (Modéré, semaine + week-end, Balade + Road trip, Voyage, Rassemblements, Équitation)', async () => {
    const { error } = await supabase.from('profiles').upsert({
      id: uid, username: `test_${Date.now().toString(36)}`, avatar_path: path, bio: null,
      riding_styles: ['balade', 'road_trip'], license_year: null, city: 'Marseille',
      interests: ['Voyage', 'Rassemblements', 'Équitation'], pace: 'modere', availability: ['semaine', 'weekend'],
    });
    if (error) throw error;
  });
  await step('moto', async () => {
    const { data: m, error } = await supabase.from('motorcycles').insert({ owner_id: uid, brand: 'Yamaha', model: 'MT-07', year: 2020, displacement_cc: 689, color: null, photo_path: null, category: 'a2' }).select('id').single();
    if (error) throw error;
    const { error: e2 } = await supabase.rpc('set_main_motorcycle', { moto: m.id }); if (e2) throw e2;
  });
} finally {
  await step('suppression du compte de test (delete-account)', async () => {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) await sql(`delete from auth.users where id = '${uid}' and email like 'passeryder+test-inscription-%'`);
  });
  const left = await sql(`select count(*)::int as n from auth.users where email like 'passeryder+test-inscription-%'`);
  console.log('comptes de test restants :', left[0].n);
}
