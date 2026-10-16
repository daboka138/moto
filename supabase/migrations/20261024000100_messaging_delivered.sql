-- Messagerie v2 (suite) : « reçu » posé par le serveur, notifications lues seulement à la lecture
-- (avant : à toute modification d'une ligne de membre, y compris le « reçu »).

drop trigger notif_message_read on public.conversation_members;
create trigger notif_message_read
  after update of last_read_at on public.conversation_members
  for each row execute function public.notif_message_read();

-- ✓✓ « reçu » : mes conversations où un message est arrivé depuis mon dernier « reçu »
create function public.mark_delivered()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversation_members m set delivered_at = now()
  from public.conversations c
  where c.id = m.conversation_id and m.user_id = (select auth.uid())
    and c.last_message_at is not null and (m.delivered_at is null or m.delivered_at < c.last_message_at);
$$;

revoke all on function public.mark_delivered() from public;
grant execute on function public.mark_delivered() to authenticated;
