-- =====================================================================
-- Infrastructure Supabase des stories et messages : buckets privés,
-- temps réel, nettoyage planifié des stories expirées.
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Buckets privés ----------
-- Les fichiers ne sont lisibles (URL signées) que si la story / le message
-- correspondant l'est : ce sont les RLS de public.stories et public.messages
-- qui décident, via les sous-requêtes ci-dessous.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('stories', 'stories', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']),
  ('chat', 'chat', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "stories (fichiers) : envoi dans son dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "stories (fichiers) : lecture si la story est visible"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'stories' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.stories s where s.media_path = storage.objects.name)
    )
  );

create policy "stories (fichiers) : suppression dans son dossier"
  on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "chat (fichiers) : envoi dans son dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "chat (fichiers) : lecture par les membres de la conversation"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.messages m where m.image_path = storage.objects.name)
    )
  );

-- ---------- Temps réel ----------
-- Supabase Realtime applique les RLS : chacun ne reçoit que les messages
-- des conversations dont il est membre.
alter publication supabase_realtime add table public.messages, public.conversation_members;

-- ---------- Nettoyage des stories expirées ----------
-- Toutes les 30 min, la fonction Edge « cleanup-stories » supprime les stories
-- expirées et leurs fichiers (l'API Storage est nécessaire pour les fichiers).
-- Elle ne fait que supprimer ce qui a déjà expiré : l'appeler n'expose rien.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cleanup-expired-stories',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://yfewldnhnnrzzscmfjsd.supabase.co/functions/v1/cleanup-stories',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
