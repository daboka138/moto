-- =====================================================================
-- SMS automatiques (Brevo) pour SOS, chute et « Je rentre »
-- - sms_log : un envoi par destinataire, numéro masqué (336****78), lisible par son seul
--   auteur, écrit uniquement par l'Edge Function send-sms (service_role). Purgé après 30 jours
-- - Quota : 10 SMS envoyés (ou en cours) par utilisateur sur 24 h glissantes (reserve_sms)
-- - « Je rentre » : les numéros (contacts hors app) sont gardés sur le serveur UNIQUEMENT
--   pendant le « Je rentre » actif, pour pouvoir envoyer le SMS de retard même app fermée.
--   Effacés à l'arrivée / l'annulation, ou dès l'envoi de l'alerte
-- - Alerte de retard : heure prévue + 15 min de marge
-- Appliquée avec : npx supabase db push
-- =====================================================================

create table public.sms_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('sos', 'chute', 'je_rentre')),
  -- Numéro masqué, jamais le numéro complet
  recipient text not null check (char_length(recipient) <= 20),
  status text not null default 'pending' check (status in ('pending', 'sent', 'error', 'refused')),
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);

create index sms_log_user_idx on public.sms_log (user_id, created_at desc);

alter table public.sms_log enable row level security;

create policy "sms_log: lecture des miens"
  on public.sms_log for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.sms_log from anon, authenticated;

-- Réserve jusqu'à n envois dans le quota (10 / 24 h). Une ligne par destinataire :
-- 'pending' si autorisé, 'refused' (quota) sinon. Verrou par utilisateur : pas de dépassement
-- avec deux appels simultanés.
create or replace function public.reserve_sms(p_user uuid, p_type text, p_recipients text[])
returns table (id uuid, recipient text, allowed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  used integer;
  r text;
  i integer := 0;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('sms:' || p_user::text));
  select count(*) into used from public.sms_log s
  where s.user_id = p_user and s.status in ('pending', 'sent') and s.created_at > now() - interval '24 hours';
  foreach r in array p_recipients loop
    i := i + 1;
    if used < 10 then
      insert into public.sms_log (user_id, type, recipient, status)
      values (p_user, p_type, r, 'pending') returning sms_log.id into new_id;
      used := used + 1;
      id := new_id; recipient := r; allowed := true;
    else
      insert into public.sms_log (user_id, type, recipient, status, error)
      values (p_user, p_type, r, 'refused', 'Limite de 10 SMS par 24 h atteinte') returning sms_log.id into new_id;
      id := new_id; recipient := r; allowed := false;
    end if;
    return next;
  end loop;
end;
$$;

revoke execute on function public.reserve_sms(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.reserve_sms(uuid, text, text[]) to service_role;

-- ---------- « Je rentre » : numéros pour le SMS de retard ----------
create table public.homecoming_sms (
  homecoming_id uuid primary key references public.homecomings (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  phones text[] not null check (cardinality(phones) between 1 and 5),
  created_at timestamptz not null default now()
);

alter table public.homecoming_sms enable row level security;

create policy "homecoming_sms: lecture des miens"
  on public.homecoming_sms for select to authenticated
  using (user_id = (select auth.uid()));

-- Uniquement pour mon « Je rentre » en cours
create policy "homecoming_sms: création"
  on public.homecoming_sms for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.homecomings h
      where h.id = homecoming_id and h.user_id = (select auth.uid()) and h.status = 'active'
    )
  );

create policy "homecoming_sms: suppression des miens"
  on public.homecoming_sms for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.homecoming_sms from anon, authenticated;

create or replace function public.homecoming_sms_check_phones()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from unnest(new.phones) p where p !~ '^\+?[0-9]{6,15}$') then
    raise exception 'Numéro de téléphone invalide' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger homecoming_sms_check_phones
  before insert on public.homecoming_sms
  for each row execute function public.homecoming_sms_check_phones();

-- Arrivé(e) ou annulé : les numéros sont effacés tout de suite
create or replace function public.homecomings_forget_phones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('arrived', 'cancelled') then
    delete from public.homecoming_sms where homecoming_id = new.id;
  end if;
  return new;
end;
$$;

create trigger homecomings_forget_phones
  after update of status on public.homecomings
  for each row execute function public.homecomings_forget_phones();

-- Appelée par send-sms (service_role) pour un « Je rentre » en alerte : renvoie (une seule fois)
-- les numéros, le pseudo et la dernière position connue, puis efface les numéros.
create or replace function public.claim_homecoming_sms(p_homecoming uuid)
returns table (
  user_id uuid,
  username text,
  phones text[],
  deadline timestamptz,
  latitude double precision,
  longitude double precision,
  position_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  nums text[];
begin
  select hc.*, l.latitude as live_lat, l.longitude as live_lng, l.updated_at as live_at
  into h
  from public.homecomings hc
  left join public.live_positions l on l.user_id = hc.user_id
  where hc.id = p_homecoming and hc.status = 'alerted';
  if not found then
    return;
  end if;
  delete from public.homecoming_sms s where s.homecoming_id = p_homecoming returning s.phones into nums;
  if nums is null then
    return;
  end if;
  user_id := h.user_id;
  username := public.username_of(h.user_id);
  phones := nums;
  deadline := h.deadline;
  if h.last_latitude is not null and (h.live_at is null or h.last_at >= h.live_at) then
    latitude := h.last_latitude; longitude := h.last_longitude; position_at := h.last_at;
  else
    latitude := h.live_lat; longitude := h.live_lng; position_at := h.live_at;
  end if;
  return next;
end;
$$;

revoke execute on function public.claim_homecoming_sms(uuid) from public, anon, authenticated;
grant execute on function public.claim_homecoming_sms(uuid) to service_role;

-- ---------- Alerte de retard : heure prévue + 15 min, puis SMS ----------
create or replace function public.check_homecomings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  sos uuid;
begin
  for h in
    select * from public.homecomings
    where status = 'active' and deadline between now() and now() + interval '10 minutes'
  loop
    insert into public.push_log (key) values ('homecoming-soon:' || h.id || ':' || h.deadline) on conflict do nothing;
    if found then
      perform public.send_push(array[h.user_id], 'sos', 'Bientôt l''heure prévue',
        'Tu n''es pas encore arrivé(e) à ' || h.destination_label || '. Prolonge si besoin, sinon tes contacts seront prévenus à ' ||
          to_char((h.deadline + interval '15 minutes') at time zone 'Europe/Paris', 'HH24"h"MI') || '.',
        jsonb_build_object('url', '/homecoming'));
    end if;
  end loop;

  for h in
    select hc.*, l.latitude as live_lat, l.longitude as live_lng, l.updated_at as live_at
    from public.homecomings hc
    left join public.live_positions l on l.user_id = hc.user_id
    where hc.status = 'active' and hc.deadline + interval '15 minutes' < now()
  loop
    -- Dernière position connue : la plus récente des deux
    if h.last_latitude is not null and (h.live_at is null or h.last_at >= h.live_at) then
      sos := public.raise_sos(h.user_id, 'homecoming', h.last_latitude, h.last_longitude);
    else
      sos := public.raise_sos(h.user_id, 'homecoming', h.live_lat, h.live_lng);
    end if;
    update public.homecomings set status = 'alerted', sos_id = sos where id = h.id;
    perform public.send_push(array[h.user_id], 'sos', 'Alerte envoyée à tes contacts',
      'Tu n''es pas arrivé(e) à l''heure. Si tout va bien, ouvre l''app pour les rassurer.',
      jsonb_build_object('url', '/sos/' || sos));
    -- SMS aux numéros (contacts hors app) : l'Edge Function récupère elle-même les données
    -- avec claim_homecoming_sms (une seule fois, seulement pour un « Je rentre » en alerte)
    if exists (select 1 from public.homecoming_sms s where s.homecoming_id = h.id) then
      perform net.http_post(
        url := 'https://yfewldnhnnrzzscmfjsd.supabase.co/functions/v1/send-sms',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object('homecoming_id', h.id)
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.check_homecomings() from public, anon, authenticated;

-- ---------- Purges ----------
select cron.schedule(
  'sms-cleanup',
  '27 3 * * *',
  $$
  delete from public.sms_log where created_at < now() - interval '30 days';
  -- Numéros restés après une alerte dont l'envoi a échoué
  delete from public.homecoming_sms s
  using public.homecomings h
  where h.id = s.homecoming_id and h.status <> 'active' and s.created_at < now() - interval '1 day';
  $$
);
