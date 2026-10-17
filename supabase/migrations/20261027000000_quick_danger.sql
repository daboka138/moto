-- =====================================================================
-- Signalement « noté en roulant » (note 19, point 4)
-- En roulant, un seul tap sur ⚠️ crée tout de suite un signalement générique « danger » (les autres
-- motards sont prévenus sans attendre) marqué quick = true. À l'arrêt, son auteur choisit le type
-- (set_road_report_type, 35 min max) ou le supprime ; sans réponse, il reste « Zone de danger ».
-- LÉGAL : les types restent ceux de road_report_lifetime (jamais radar / police / contrôle).
-- =====================================================================

alter table public.road_reports add column if not exists quick boolean not null default false;

-- Type choisi à l'arrêt : auteur seulement, signalement « noté en roulant », dans les 35 min
create or replace function public.set_road_report_type(p_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.road_reports%rowtype;
begin
  if public.road_report_lifetime(p_type) is null then
    raise exception 'Type de signalement non autorisé : %', p_type using errcode = 'P0001';
  end if;
  select * into r from public.road_reports where id = p_id for update;
  if not found or r.created_by is distinct from auth.uid() then
    raise exception 'Signalement introuvable' using errcode = 'P0001';
  end if;
  if not r.quick or r.created_at < now() - interval '35 minutes' then
    raise exception 'Trop tard pour changer le type de ce signalement' using errcode = 'P0001';
  end if;
  -- Même expiration que s'il avait été créé avec ce type (+ les prolongations « toujours là »)
  update public.road_reports
  set type = p_type,
      quick = false,
      expires_at = greatest(
        now() + interval '5 minutes',
        r.created_at + public.road_report_lifetime(p_type)
          + greatest(interval '0', r.expires_at - (r.created_at + public.road_report_lifetime(r.type)))
      )
  where id = p_id;
end;
$$;

revoke all on function public.set_road_report_type(uuid, text) from public, anon;
grant execute on function public.set_road_report_type(uuid, text) to authenticated;
