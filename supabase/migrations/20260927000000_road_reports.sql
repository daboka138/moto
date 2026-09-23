-- =====================================================================
-- Signalements routiers communautaires (style Waze)
-- À coller dans Supabase : SQL Editor > New query > Run
-- (après 20260926000000_social.sql)
--
-- LÉGAL (France) : aucun type "radar", "police" ou "contrôle" n'existe ni
-- ne doit être ajouté. La contrainte sur "type" l'interdit côté serveur.
-- =====================================================================

-- ---------- Durée de vie par type ----------
create or replace function public.road_report_lifetime(report_type text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case report_type
    when 'accident'        then interval '2 hours'
    when 'gravel'          then interval '2 days'
    when 'oil'             then interval '12 hours'
    when 'roadworks'       then interval '7 days'
    when 'object'          then interval '2 hours'
    when 'animal'          then interval '1 hour'
    when 'traffic_jam'     then interval '1 hour'
    when 'stopped_vehicle' then interval '2 hours'
    when 'danger'          then interval '1 day'
  end;
$$;

-- ---------- Signalements ----------
create table public.road_reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'accident', 'gravel', 'oil', 'roadworks', 'object', 'animal', 'traffic_jam', 'stopped_vehicle', 'danger'
  )),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now(),
  confirmations integer not null default 0,
  removals integer not null default 0
);

create index road_reports_active_idx on public.road_reports (expires_at, latitude, longitude);

-- Valeurs fixées par le serveur à la création : heure, expiration, compteurs.
-- Limite anti-spam : 20 signalements par heure et par personne.
create or replace function public.road_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Type inconnu (radar, police, contrôle... sont interdits) : refus explicite
  if public.road_report_lifetime(new.type) is null then
    raise exception 'Type de signalement non autorisé : %', new.type using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.road_reports r
    where r.created_by = new.created_by and r.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Trop de signalements en peu de temps, réessaie plus tard' using errcode = 'P0001';
  end if;
  new.created_at = now();
  new.expires_at = now() + public.road_report_lifetime(new.type);
  new.confirmations = 0;
  new.removals = 0;
  return new;
end;
$$;

create trigger road_reports_before_insert
  before insert on public.road_reports
  for each row execute function public.road_reports_before_insert();

alter table public.road_reports enable row level security;

-- Lecture : tous les membres connectés, signalements encore actifs uniquement
create policy "road_reports: lecture des signalements actifs"
  on public.road_reports for select to authenticated
  using (expires_at > now());

create policy "road_reports: création par soi-même"
  on public.road_reports for insert to authenticated
  with check (created_by = (select auth.uid()));

-- L'auteur peut retirer son signalement
create policy "road_reports: suppression par l'auteur"
  on public.road_reports for delete to authenticated
  using (created_by = (select auth.uid()));

-- Aucune modification directe : expiration et compteurs sont gérés par les votes
revoke update on public.road_reports from anon, authenticated;

-- ---------- Votes « toujours là » / « plus là » ----------
create table public.road_report_votes (
  report_id uuid not null references public.road_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('still_there', 'gone')),
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

alter table public.road_report_votes enable row level security;

-- Chacun ne voit que ses propres votes (les totaux sont sur le signalement)
create policy "road_report_votes: lecture des siens"
  on public.road_report_votes for select to authenticated
  using (user_id = (select auth.uid()));

-- Vote sur un signalement encore actif
create policy "road_report_votes: vote par soi-même"
  on public.road_report_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.road_reports r where r.id = report_id and r.expires_at > now())
  );

create policy "road_report_votes: changement de son vote"
  on public.road_report_votes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.road_report_votes from anon, authenticated;
grant update (vote) on public.road_report_votes to authenticated;

-- Après chaque vote : recalcul des compteurs et de l'expiration.
-- « Toujours là » prolonge d'une demi-durée de vie ; le signalement disparaît
-- après 3 « plus là » (ou 2 s'ils sont plus nombreux que les confirmations),
-- ou tout de suite si c'est son auteur qui dit « plus là ».
create or replace function public.road_report_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.road_reports%rowtype;
  n_still integer;
  n_gone integer;
begin
  select * into report from public.road_reports where id = new.report_id for update;
  if not found then
    return null;
  end if;

  select
    count(*) filter (where vote = 'still_there'),
    count(*) filter (where vote = 'gone')
  into n_still, n_gone
  from public.road_report_votes where report_id = new.report_id;

  update public.road_reports r set
    confirmations = n_still,
    removals = n_gone,
    expires_at = case
      when new.vote = 'gone' and new.user_id = report.created_by then now()
      when n_gone >= 3 or (n_gone >= 2 and n_gone > n_still) then now()
      when new.vote = 'still_there'
        then greatest(r.expires_at, now() + public.road_report_lifetime(r.type) / 2)
      else r.expires_at
    end
  where r.id = new.report_id;
  return null;
end;
$$;

create trigger road_report_votes_after_change
  after insert or update on public.road_report_votes
  for each row execute function public.road_report_votes_after_change();
