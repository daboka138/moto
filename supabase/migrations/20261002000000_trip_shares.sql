-- =====================================================================
-- Partage de trajet en direct : j'envoie à un ami (Messages) une fiche avec
-- ma destination, mon heure d'arrivée estimée et ma position, mises à jour
-- pendant la navigation. Le partage s'arrête à l'arrivée (ou quand j'arrête) :
-- la position est alors effacée.
-- Appliquée avec : npx supabase db push
-- =====================================================================

create table public.trip_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  destination_label text not null check (char_length(destination_label) between 1 and 200),
  -- Dernière position connue (effacée à la fin du partage)
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  eta timestamptz,
  remaining_m integer check (remaining_m >= 0),
  status text not null default 'active' check (status in ('active', 'arrived', 'stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trip_shares_user_idx on public.trip_shares (user_id);
create index trip_shares_active_idx on public.trip_shares (updated_at) where status = 'active';

alter table public.trip_shares enable row level security;

-- Lisible par moi et par les membres de la conversation (sauf blocage)
create policy "trip_shares: lecture"
  on public.trip_shares for select to authenticated
  using (user_id = (select auth.uid()) or public.can_post_message(conversation_id));

create policy "trip_shares: création"
  on public.trip_shares for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_post_message(conversation_id));

create policy "trip_shares: mise à jour du mien"
  on public.trip_shares for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "trip_shares: suppression du mien"
  on public.trip_shares for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.trip_shares from anon, authenticated;
grant update (latitude, longitude, eta, remaining_m, status) on public.trip_shares to authenticated;

-- Heure de mise à jour fixée par le serveur ; un partage terminé ne reprend pas
-- et n'a plus de position
create or replace function public.trip_shares_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'active' then
    new.status = old.status;
  end if;
  new.updated_at = now();
  if tg_op = 'INSERT' then
    new.created_at = now();
  end if;
  if new.status <> 'active' then
    new.latitude = null;
    new.longitude = null;
  end if;
  return new;
end;
$$;

create trigger trip_shares_before_write
  before insert or update on public.trip_shares
  for each row execute function public.trip_shares_before_write();

-- Message qui porte la fiche (le texte reste lisible par les anciennes versions de l'app)
alter table public.messages
  add column trip_share_id uuid references public.trip_shares (id) on delete set null;

-- Seulement mon propre partage, dans la conversation du message
create or replace function public.messages_check_trip_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.trip_share_id is not null and not exists (
    select 1 from public.trip_shares s
    where s.id = new.trip_share_id and s.user_id = new.sender_id and s.conversation_id = new.conversation_id
  ) then
    raise exception 'Partage de trajet invalide' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_check_trip_share
  before insert on public.messages
  for each row execute function public.messages_check_trip_share();

-- Toutes les 15 min : un partage sans nouvelles depuis 30 min est arrêté (app fermée,
-- plus de réseau…), position effacée ; les partages terminés depuis 24 h sont supprimés.
select cron.schedule(
  'cleanup-trip-shares',
  '*/15 * * * *',
  $$
  update public.trip_shares set status = 'stopped'
  where status = 'active' and updated_at < now() - interval '30 minutes';
  delete from public.trip_shares where updated_at < now() - interval '24 hours';
  $$
);
