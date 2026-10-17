-- Note 23 : options d'itinéraire d'une balade et préférences de route mémorisées par membre.
--
-- group_rides.route_options : options choisies par l'organisateur (éviter autoroute / péages / villes)
-- et points évités pour sortir des villes (exclude, [[lat, lng], ...], 50 max) : les participants
-- recalculent exactement le même tracé quand ils lancent la navigation.
alter table public.group_rides
  add column if not exists route_options jsonb not null default '{}'::jsonb;

alter table public.group_rides
  drop constraint if exists group_rides_route_options_check;
alter table public.group_rides
  add constraint group_rides_route_options_check check (
    jsonb_typeof(route_options) = 'object'
    and pg_column_size(route_options) <= 4096
    and (not route_options ? 'exclude'
         or (jsonb_typeof(route_options -> 'exclude') = 'array'
             and jsonb_array_length(route_options -> 'exclude') <= 50))
  );

-- Préférences de route du membre (cases cochées), lisibles et modifiables par lui seul (RLS existante)
alter table public.profile_private
  add column if not exists route_prefs jsonb not null default '{}'::jsonb;

alter table public.profile_private
  drop constraint if exists profile_private_route_prefs_check;
alter table public.profile_private
  add constraint profile_private_route_prefs_check check (
    jsonb_typeof(route_prefs) = 'object' and pg_column_size(route_prefs) <= 512
  );
