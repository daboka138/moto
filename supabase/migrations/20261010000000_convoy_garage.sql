-- =====================================================================
-- Lot 2 : mode convoi des balades (rôles, check-in au RDV) et garage
-- (kilométrage, carburant, carnet d'entretien avec rappels).
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Convoi : ouvreur / serre-file, check-in au RDV ----------
alter table public.group_ride_participants
  add column role text check (role in ('leader', 'sweeper')),
  add column checked_in_at timestamptz;

-- Un seul ouvreur et un seul serre-file par balade
create unique index group_ride_participants_one_leader on public.group_ride_participants (ride_id) where role = 'leader';
create unique index group_ride_participants_one_sweeper on public.group_ride_participants (ride_id) where role = 'sweeper';

-- L'organisateur donne (ou retire, p_role null) un rôle à un participant inscrit.
-- Le rôle passe d'un participant à l'autre : l'ancien titulaire le perd.
create or replace function public.set_ride_role(p_ride uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_ride_creator(p_ride) then
    raise exception 'Seul l''organisateur peut attribuer les rôles' using errcode = 'P0001';
  end if;
  if p_role is not null and p_role not in ('leader', 'sweeper') then
    raise exception 'Rôle inconnu' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.group_ride_participants p
    where p.ride_id = p_ride and p.user_id = p_user and p.status = 'joined'
  ) then
    raise exception 'Ce motard ne participe pas à la balade' using errcode = 'P0001';
  end if;
  if p_role is not null then
    update public.group_ride_participants set role = null
    where ride_id = p_ride and role = p_role and user_id <> p_user;
  end if;
  update public.group_ride_participants set role = p_role where ride_id = p_ride and user_id = p_user;
end;
$$;

revoke execute on function public.set_ride_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_ride_role(uuid, uuid, text) to authenticated;

-- Check-in au RDV : chacun se pointe lui-même, l'organisateur peut pointer un inscrit.
-- Seulement le jour J (de 2 h avant le RDV à 12 h après), balade pas terminée.
-- p_user null = moi ; p_present false = annuler le pointage.
create or replace function public.ride_check_in(p_ride uuid, p_user uuid default null, p_present boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid := coalesce(p_user, me);
  ride record;
begin
  if me is null then
    raise exception 'Non connecté' using errcode = 'P0001';
  end if;
  select r.created_by, r.meeting_at, r.ended_at into ride from public.group_rides r where r.id = p_ride;
  if not found then
    raise exception 'Balade introuvable' using errcode = 'P0001';
  end if;
  if target <> me and ride.created_by <> me then
    raise exception 'Seul l''organisateur peut pointer un autre participant' using errcode = 'P0001';
  end if;
  if ride.ended_at is not null
     or ride.meeting_at is null
     or now() < ride.meeting_at - interval '2 hours'
     or now() > ride.meeting_at + interval '12 hours' then
    raise exception 'Le pointage n''est possible que le jour J, autour de l''heure du RDV' using errcode = 'P0001';
  end if;
  update public.group_ride_participants
  set checked_in_at = case when p_present then coalesce(checked_in_at, now()) else null end
  where ride_id = p_ride and user_id = target and status = 'joined';
  if not found then
    raise exception 'Ce motard n''est pas inscrit à la balade' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.ride_check_in(uuid, uuid, boolean) from public, anon;
grant execute on function public.ride_check_in(uuid, uuid, boolean) to authenticated;

-- ---------- Garage : compteur et carburant (privé) ----------
-- Une ligne par moto, lisible et modifiable uniquement par son propriétaire.
create table public.motorcycle_garage (
  motorcycle_id uuid primary key references public.motorcycles (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  odometer_km integer not null default 0 check (odometer_km between 0 and 2000000),
  -- Capacité du réservoir (L) et consommation moyenne (L/100 km)
  tank_l numeric(4, 1) check (tank_l > 0 and tank_l <= 60),
  consumption_l100 numeric(4, 1) check (consumption_l100 > 0 and consumption_l100 <= 30),
  -- Compteur au dernier plein (null = inconnu : pas d'estimation d'autonomie)
  fill_odometer_km integer check (fill_odometer_km between 0 and 2000000),
  filled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index motorcycle_garage_owner_idx on public.motorcycle_garage (owner_id);

create trigger motorcycle_garage_set_updated_at
  before insert or update on public.motorcycle_garage
  for each row execute function public.set_updated_at();

-- La moto doit m'appartenir
create or replace function public.owns_motorcycle(moto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.motorcycles m where m.id = moto and m.owner_id = (select auth.uid()));
$$;

revoke execute on function public.owns_motorcycle(uuid) from public, anon;
grant execute on function public.owns_motorcycle(uuid) to authenticated;

alter table public.motorcycle_garage enable row level security;

create policy "motorcycle_garage: propriétaire"
  on public.motorcycle_garage for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_motorcycle(motorcycle_id));

-- Kilomètres d'un trajet ajoutés au compteur (uniquement si le compteur est renseigné)
create or replace function public.add_motorcycle_km(moto uuid, km numeric)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.motorcycle_garage
  set odometer_km = least(2000000, odometer_km + greatest(0, least(round(km), 3000))::integer)
  where motorcycle_id = moto and owner_id = (select auth.uid());
$$;

revoke execute on function public.add_motorcycle_km(uuid, numeric) from public, anon;
grant execute on function public.add_motorcycle_km(uuid, numeric) to authenticated;

-- ---------- Carnet d'entretien ----------
create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('oil', 'tires', 'chain', 'service', 'brakes', 'other')),
  done_on date not null default current_date,
  odometer_km integer check (odometer_km between 0 and 2000000),
  cost_eur numeric(8, 2) check (cost_eur >= 0),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index maintenance_records_moto_idx on public.maintenance_records (motorcycle_id, done_on desc);
create index maintenance_records_owner_idx on public.maintenance_records (owner_id);

alter table public.maintenance_records enable row level security;

create policy "maintenance_records: propriétaire"
  on public.maintenance_records for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_motorcycle(motorcycle_id));

-- Rappels : un par type d'entretien et par moto, tous les X km et/ou tous les X mois,
-- à partir de la dernière fois (base_km / base_on, mise à jour par le carnet).
create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('oil', 'tires', 'chain', 'service', 'brakes')),
  every_km integer check (every_km between 100 and 100000),
  every_months smallint check (every_months between 1 and 120),
  base_km integer check (base_km between 0 and 2000000),
  base_on date not null default current_date,
  -- Dernière notification envoyée (étape + cycle), pour ne pas la répéter
  notified_key text,
  created_at timestamptz not null default now(),
  unique (motorcycle_id, kind),
  check (every_km is not null or every_months is not null)
);

create index maintenance_plans_owner_idx on public.maintenance_plans (owner_id);

alter table public.maintenance_plans enable row level security;

create policy "maintenance_plans: propriétaire"
  on public.maintenance_plans for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_motorcycle(motorcycle_id));

-- Un entretien noté dans le carnet relance le cycle du rappel correspondant
create or replace function public.maintenance_records_update_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.maintenance_plans p
  set base_on = new.done_on,
      base_km = coalesce(new.odometer_km, p.base_km),
      notified_key = null
  where p.motorcycle_id = new.motorcycle_id and p.kind = new.kind and new.done_on >= p.base_on;
  return null;
end;
$$;

create trigger maintenance_records_update_plan
  after insert on public.maintenance_records
  for each row execute function public.maintenance_records_update_plan();

-- ---------- Rappels d'entretien par notification ----------
alter table public.notification_prefs add column garage boolean not null default true;

create or replace function public.send_push(recipients uuid[], category text, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch jsonb;
begin
  -- L'API Expo accepte 100 notifications par requête
  for batch in
    select jsonb_agg(m.msg)
    from (
      select
        jsonb_build_object(
          'to', t.token,
          'title', left(p_title, 100),
          'body', left(p_body, 300),
          'data', coalesce(p_data, '{}'::jsonb) || jsonb_build_object('type', category),
          'sound', 'default',
          'priority', 'high',
          'channelId', category
        ) as msg,
        (row_number() over () - 1) / 100 as grp
      from public.push_tokens t
      left join public.notification_prefs p on p.user_id = t.user_id
      where t.user_id = any (recipients)
        and case category
          when 'messages' then coalesce(p.messages, true)
          when 'rides' then coalesce(p.rides, true)
          when 'friends' then coalesce(p.friends, true)
          when 'dangers' then coalesce(p.dangers, true)
          when 'garage' then coalesce(p.garage, true)
          else true
        end
    ) m
    group by m.grp
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := batch,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end loop;
exception when others then
  -- Une notification ratée ne doit jamais bloquer l'action (message, SOS…)
  raise warning 'send_push: %', sqlerrm;
end;
$$;

revoke execute on function public.send_push(uuid[], text, text, text, jsonb) from public, anon, authenticated;

-- Tous les jours : entretien bientôt dû (500 km ou 15 jours) puis dû. Une notification par étape et par cycle.
create or replace function public.check_maintenance_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan record;
  stage text;
  key text;
  label text;
  detail text;
begin
  for plan in
    select
      p.id, p.owner_id, p.motorcycle_id, p.kind, p.base_on, p.base_km, p.notified_key,
      m.brand, m.model,
      case when p.every_km is not null and p.base_km is not null and g.odometer_km is not null
        then p.base_km + p.every_km - g.odometer_km end as km_left,
      case when p.every_months is not null
        then ((p.base_on + make_interval(months => p.every_months))::date - current_date) end as days_left
    from public.maintenance_plans p
    join public.motorcycles m on m.id = p.motorcycle_id
    left join public.motorcycle_garage g on g.motorcycle_id = p.motorcycle_id
  loop
    if plan.km_left <= 0 or plan.days_left <= 0 then
      stage := 'due';
    elsif plan.km_left <= 500 or plan.days_left <= 15 then
      stage := 'soon';
    else
      continue;
    end if;
    key := stage || ':' || plan.base_on || ':' || coalesce(plan.base_km::text, '');
    if plan.notified_key is not distinct from key then
      continue;
    end if;
    update public.maintenance_plans set notified_key = key where id = plan.id;
    label := case plan.kind
      when 'oil' then 'Vidange'
      when 'tires' then 'Pneus'
      when 'chain' then 'Chaîne'
      when 'service' then 'Révision'
      else 'Freins'
    end;
    detail := case
      when stage = 'due' then 'à faire maintenant'
      when plan.km_left is not null and plan.km_left <= 500 then 'dans ' || plan.km_left || ' km'
      else 'dans ' || plan.days_left || ' jours'
    end;
    perform public.send_push(array[plan.owner_id], 'garage',
      'Entretien : ' || label || ' ' || detail,
      plan.brand || ' ' || plan.model || ' · ouvre le carnet d''entretien',
      jsonb_build_object('url', '/garage/' || plan.motorcycle_id));
  end loop;
end;
$$;

revoke execute on function public.check_maintenance_reminders() from public, anon, authenticated;

select cron.schedule('garage-reminders', '0 8 * * *', $$ select public.check_maintenance_reminders(); $$);
