// Supprime définitivement le compte de l'utilisateur qui appelle et toutes ses données.
// Appelée depuis l'app (Paramètres > Supprimer mon compte), avec le jeton de session.
//
// 1. Fichiers de l'utilisateur dans les buckets photos / stories / chat (dossier <user_id>/)
// 2. Conversations privées (direct) dont il est membre, avec les photos échangées
// 3. Le compte auth : tout le reste part en cascade (profil, motos, mur, amis,
//    positions, balades créées, signalements routiers, stories, messages, blocages…)
//
// verify_jwt = false (config.toml) : le jeton est vérifié ici avec auth.getUser().
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const BUCKETS = ['photos', 'stories', 'chat'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Méthode non autorisée' }, { status: 405 });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'Non connecté' }, { status: 401 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: 'Session invalide' }, { status: 401 });
  const userId = auth.user.id;

  try {
    // 1. Ses fichiers
    for (const bucket of BUCKETS) {
      await removeFiles(admin, bucket, await listFiles(admin, bucket, userId));
    }

    // 2. Ses conversations privées (les photos de l'autre membre y compris)
    const { data: memberships, error: membersError } = await admin
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId);
    if (membersError) throw membersError;
    const { data: directs, error: directsError } = await admin
      .from('conversations')
      .select('id')
      .eq('kind', 'direct')
      .in(
        'id',
        memberships.map((m) => m.conversation_id),
      );
    if (directsError) throw directsError;
    const directIds = directs.map((c) => c.id);
    if (directIds.length) {
      const { data: images, error: imagesError } = await admin
        .from('messages')
        .select('image_path')
        .in('conversation_id', directIds)
        .not('image_path', 'is', null);
      if (imagesError) throw imagesError;
      await removeFiles(
        admin,
        'chat',
        images.map((m) => m.image_path as string),
      );
      const { error: deleteError } = await admin.from('conversations').delete().in('id', directIds);
      if (deleteError) throw deleteError;
    }

    // 3. Le compte (en dernier : si une étape échoue, l'utilisateur peut réessayer)
    const { error: userError } = await admin.auth.admin.deleteUser(userId);
    if (userError) throw userError;

    return Response.json({ deleted: true });
  } catch (e) {
    console.error('delete-account', userId, e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});

/** Tous les fichiers sous <prefix>/, sous-dossiers compris. */
async function listFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      // Un dossier n'a pas d'id
      if (item.id) paths.push(path);
      else paths.push(...(await listFiles(admin, bucket, path)));
    }
    if (data.length < 1000) return paths;
  }
}

async function removeFiles(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 1000));
    if (error) throw error;
  }
}
