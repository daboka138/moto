-- =====================================================================
-- Contacts d'urgence v2
-- - sms_log : type 'test' (bouton « Envoyer un SMS de test », compté dans le quota 10 / 24 h)
-- - « Je rentre » : choix des amis prévenus (homecomings.notify_members, null = tous mes
--   contacts d'urgence), comme les numéros cochés côté app
-- Appliquée avec : npx supabase db push
-- =====================================================================

alter table public.sms_log drop constraint sms_log_type_check;
alter table public.sms_log add constraint sms_log_type_check check (type in ('sos', 'chute', 'je_rentre', 'test'));

alter table public.homecomings add column notify_members uuid[] check (cardinality(notify_members) <= 10);

-- raise_sos : nouveau paramètre « only » (null = tous les contacts d'urgence)
drop function public.raise_sos(uuid, text, double precision, double precision);

create function public.raise_sos(owner uuid, sos_kind text, lat double precision, lng double precision, only_contacts uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sos uuid;
  contact uuid;
  recipients uuid[] := '{}';
  who text := public.username_of(owner);
  what text := case sos_kind
    when 'fall' then 'Chute détectée, sans réponse de sa part'
    when 'homecoming' then 'N''est pas arrivé(e) à l''heure prévue (« Je rentre »)'
    else 'Demande d''aide'
  end;
  place text := case
    when lat is null then 'Position inconnue.'
    else 'Position : https://maps.google.com/?q=' || round(lat::numeric, 6) || ',' || round(lng::numeric, 6)
  end;
begin
  insert into public.sos_events (user_id, kind, latitude, longitude)
  values (owner, sos_kind, lat, lng) returning id into sos;

  -- Message dans la conversation privée (pas de 2e notification « message »)
  perform set_config('passeryder.sos_message', '1', true);
  for contact in
    select c.contact_id from public.emergency_contacts c
    where c.user_id = owner and not public.is_blocked_between(owner, c.contact_id)
      and (only_contacts is null or c.contact_id = any (only_contacts))
  loop
    recipients := recipients || contact;
    insert into public.messages (conversation_id, sender_id, body)
    values (public.direct_conversation_between(owner, contact), owner, '🆘 SOS — ' || what || '. ' || place);
  end loop;
  perform set_config('passeryder.sos_message', '0', true);

  perform public.send_push(recipients, 'sos', '🆘 SOS de ' || who, what || '. Touche pour voir sa position.',
    jsonb_build_object('url', '/sos/' || sos));
  return sos;
end;
$$;

revoke execute on function public.raise_sos(uuid, text, double precision, double precision, uuid[]) from public, anon, authenticated;

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
    -- Dernière position connue : la plus récente des deux ; seulement les amis cochés
    if h.last_latitude is not null and (h.live_at is null or h.last_at >= h.live_at) then
      sos := public.raise_sos(h.user_id, 'homecoming', h.last_latitude, h.last_longitude, h.notify_members);
    else
      sos := public.raise_sos(h.user_id, 'homecoming', h.live_lat, h.live_lng, h.notify_members);
    end if;
    update public.homecomings set status = 'alerted', sos_id = sos where id = h.id;
    perform public.send_push(array[h.user_id], 'sos', 'Alerte envoyée à tes contacts',
      'Tu n''es pas arrivé(e) à l''heure. Si tout va bien, ouvre l''app pour les rassurer.',
      jsonb_build_object('url', '/sos/' || sos));
    -- SMS aux numéros cochés : l'Edge Function relit les données avec claim_homecoming_sms
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
