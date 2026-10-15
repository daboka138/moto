-- =====================================================================
-- GPS moto (sans nouveau build) + récap des balades gardé 7 jours
-- - app_features : itineraire_plaisir (gratuit)
-- - motorcycle_garage : range_km (autonomie d'un plein, saisie directe, prioritaire sur
--   réservoir / conso) et fill_level (niveau au dernier « plein » : 1 = plein, 0,75, 0,5, 0,25)
-- - Récap « Ta sortie » des balades : à la fin de la balade (ou à sa suppression si elle a
--   démarré sans être terminée), une ligne outings par participant inscrit, avec le tracé
--   prévu (500 points au plus). Elle survit à la suppression de la balade (1 h après la fin)
--   et est purgée 7 jours après (pg_cron « ride-outings-cleanup »). Aucune vitesse.
-- Appliquée avec : npx supabase db push
-- =====================================================================

insert into public.app_features (key, name, description, status, sort) values
  ('itineraire_plaisir', 'Itinéraire Plaisir', 'Itinéraire de A à B par les routes sinueuses, sans autoroute', 'free', 15)
on conflict (key) do nothing;

alter table public.motorcycle_garage
  add column range_km integer check (range_km between 20 and 1500),
  add column fill_level numeric(3, 2) not null default 1 check (fill_level between 0.05 and 1);

-- ---------- Récap des balades ----------
create or replace function public.snapshot_ride_outings(r public.group_rides, p_ended timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  step integer;
  track jsonb;
  members integer;
begin
  if r.started_at is null or r.route is null or jsonb_array_length(r.route) < 2 then
    return;
  end if;
  n := jsonb_array_length(r.route);
  step := greatest(1, ceil(n / 500.0)::int);
  select jsonb_agg(e.value order by e.idx) into track
  from jsonb_array_elements(r.route) with ordinality as e(value, idx)
  where (e.idx - 1) % step = 0 or e.idx = n;
  select count(*) into members from public.group_ride_participants p where p.ride_id = r.id and p.status = 'joined';
  insert into public.outings (owner_id, source, kind, title, started_at, distance_m, duration_s, participants, track, hide_ends)
  select p.user_id, 'ride:' || r.id, 'ride', left(r.title, 100), r.started_at, coalesce(r.distance_m, 0),
    least(864000, greatest(0, extract(epoch from p_ended - r.started_at)::int)), members, track, false
  from public.group_ride_participants p
  where p.ride_id = r.id and p.status = 'joined'
  on conflict (owner_id, source) do nothing;
end;
$$;

revoke execute on function public.snapshot_ride_outings(public.group_rides, timestamptz) from public, anon, authenticated;

create or replace function public.group_rides_snapshot_outings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.ended_at is null and new.ended_at is not null then
      perform public.snapshot_ride_outings(new, new.ended_at);
    end if;
    return new;
  end if;
  -- Balade démarrée mais jamais terminée, supprimée par le nettoyage
  if old.ended_at is null and old.started_at is not null and old.started_at < now() - interval '30 minutes' then
    perform public.snapshot_ride_outings(old, least(now(), old.started_at + make_interval(secs => coalesce(old.duration_s, 0) + 3600)));
  end if;
  return old;
end;
$$;

revoke execute on function public.group_rides_snapshot_outings() from public, anon, authenticated;

create trigger group_rides_snapshot_outings_update
  after update of ended_at on public.group_rides
  for each row execute function public.group_rides_snapshot_outings();

create trigger group_rides_snapshot_outings_delete
  before delete on public.group_rides
  for each row execute function public.group_rides_snapshot_outings();

select cron.schedule('ride-outings-cleanup', '23 3 * * *',
  $$ delete from public.outings where kind = 'ride' and created_at < now() - interval '7 days'; $$);
