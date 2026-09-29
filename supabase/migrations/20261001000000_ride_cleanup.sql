-- =====================================================================
-- Suppression automatique des balades 1 h après leur fin.
-- Fin = heure de fin si la balade a été terminée, sinon heure de départ
-- (démarrage réel s'il est plus tard que le RDV) + durée estimée du tracé.
-- Appliquée avec : npx supabase db push
-- =====================================================================

create index if not exists group_rides_ended_at_idx on public.group_rides (ended_at);

-- Supprime les balades finies depuis plus d'une heure (participants, conversation
-- et messages partent en cascade) et renvoie les photos du chat à effacer du
-- bucket privé « chat » : seule l'API Storage peut supprimer les fichiers, c'est
-- l'Edge Function « cleanup-rides » qui s'en charge.
create or replace function public.purge_finished_rides()
returns table (image_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(r.id), '{}') into ids
  from public.group_rides r
  where r.meeting_at is not null
    and coalesce(
          r.ended_at,
          greatest(r.meeting_at, coalesce(r.started_at, r.meeting_at))
            + make_interval(secs => coalesce(r.duration_s, 0))
        ) < now() - interval '1 hour';

  if cardinality(ids) = 0 then
    return;
  end if;

  return query
    select m.image_path
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.ride_id = any (ids) and m.image_path is not null;

  delete from public.group_rides r where r.id = any (ids);
end;
$$;

revoke execute on function public.purge_finished_rides() from public, anon, authenticated;
grant execute on function public.purge_finished_rides() to service_role;

-- Toutes les 15 min. La fonction ne supprime que des balades déjà finies : l'appeler n'expose rien.
select cron.schedule(
  'cleanup-finished-rides',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://yfewldnhnnrzzscmfjsd.supabase.co/functions/v1/cleanup-rides',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
