// Supprime les stories expirées (plus de 24 h) et leurs fichiers.
// Appelée toutes les 30 min par pg_cron (voir la migration stories_messages_infra).
// Elle ne fait que supprimer ce qui a déjà expiré : pas besoin d'authentification.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data, error } = await supabase
    .from('stories')
    .select('id, media_path')
    .lt('expires_at', new Date().toISOString())
    .limit(500);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (data.length) {
    const { error: storageError } = await supabase.storage.from('stories').remove(data.map((s) => s.media_path));
    if (storageError) return Response.json({ error: storageError.message }, { status: 500 });
    const { error: deleteError } = await supabase
      .from('stories')
      .delete()
      .in(
        'id',
        data.map((s) => s.id),
      );
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
  }

  return Response.json({ deleted: data.length });
});
