-- Fiche balade inaccessible : dire POURQUOI au lieu de « introuvable ou réservée à ses invités ».
-- 'ok' : visible ; 'private' : existe mais réservée (invités / amis de l'organisateur) ; 'missing' :
-- supprimée ou purgée après la fin. Ne renvoie rien d'autre (ni titre, ni organisateur, ni lieu).
create or replace function public.ride_access(p_ride uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.group_rides r where r.id = p_ride) then 'missing'
    when public.can_see_ride(p_ride) then 'ok'
    else 'private'
  end;
$$;

revoke execute on function public.ride_access(uuid) from public, anon;
grant execute on function public.ride_access(uuid) to authenticated;
