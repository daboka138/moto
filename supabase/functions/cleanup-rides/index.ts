// Supprime les balades finies depuis plus d'une heure et les photos de leur chat.
// Appelée toutes les 15 min par pg_cron (voir la migration ride_cleanup).
// Elle ne fait que supprimer ce qui est déjà fini : pas besoin d'authentification.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Balades supprimées en base (cascade : participants, conversation, messages) ; renvoie les fichiers du chat
  const { data, error } = await supabase.rpc('purge_finished_rides');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const paths = ((data ?? []) as { image_path: string }[]).map((r) => r.image_path);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('chat').remove(paths);
    if (storageError) return Response.json({ error: storageError.message }, { status: 500 });
  }

  return Response.json({ files: paths.length });
});
