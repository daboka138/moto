-- Note 39 : carnet d'entretien v2 (gratuit, UNE moto : la moto principale)
--
-- - Types d'entretien détaillés (vidange, filtre à huile, pneus AV / AR, chaîne graissage /
--   tension / kit, plaquettes, disques, liquide de frein, liquide de refroidissement, bougies,
--   révision, contrôle technique, assurance). Anciens codes (tires, chain, brakes) gardés pour
--   l'historique, plus proposés par l'app.
-- - Entretien : garage (facultatif) et photo de facture (bucket PRIVÉ `invoices`, <uid>/…).
-- - Rappel : date d'échéance explicite facultative (due_on : contrôle technique, assurance),
--   effacée par le prochain entretien du même type (le cycle repart de cette date).
-- - Carnet et rappels : écriture limitée à la moto PRINCIPALE (le carnet multi-motos est prévu en
--   premium : rien de créé maintenant). Les anciennes données d'autres motos restent lisibles.
-- - Notifications : seulement pour la moto principale ; 30 jours avant pour contrôle technique
--   et assurance, sinon 500 km ou 15 jours.
-- Appliquée avec : npx supabase db push

-- ---------- Types ----------
alter table public.maintenance_records drop constraint maintenance_records_kind_check;
alter table public.maintenance_records add constraint maintenance_records_kind_check check (kind in (
  'oil', 'oil_filter', 'tire_front', 'tire_rear', 'chain_lube', 'chain_tension', 'chain_kit',
  'brake_pads', 'brake_discs', 'brake_fluid', 'coolant', 'spark_plugs', 'service', 'inspection',
  'insurance', 'other', 'tires', 'chain', 'brakes'));

alter table public.maintenance_plans drop constraint maintenance_plans_kind_check;
alter table public.maintenance_plans add constraint maintenance_plans_kind_check check (kind in (
  'oil', 'oil_filter', 'tire_front', 'tire_rear', 'chain_lube', 'chain_tension', 'chain_kit',
  'brake_pads', 'brake_discs', 'brake_fluid', 'coolant', 'spark_plugs', 'service', 'inspection',
  'insurance', 'tires', 'chain', 'brakes'));

-- ---------- Nouveaux champs ----------
alter table public.maintenance_records
  add column garage_name text check (char_length(garage_name) <= 100),
  add column invoice_path text check (char_length(invoice_path) <= 200);

alter table public.maintenance_plans
  add column due_on date;

-- ---------- Une seule moto : la principale ----------
create or replace function public.is_main_motorcycle(moto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.motorcycles m
    where m.id = moto and m.owner_id = (select auth.uid()) and m.is_main
  );
$$;

revoke execute on function public.is_main_motorcycle(uuid) from public, anon;
grant execute on function public.is_main_motorcycle(uuid) to authenticated;

drop policy "maintenance_records: propriétaire" on public.maintenance_records;

create policy "maintenance_records: lecture du propriétaire"
  on public.maintenance_records for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "maintenance_records: suppression du propriétaire"
  on public.maintenance_records for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "maintenance_records: ajout sur la moto principale"
  on public.maintenance_records for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_main_motorcycle(motorcycle_id)
    and (invoice_path is null or split_part(invoice_path, '/', 1) = (select auth.uid())::text)
  );

create policy "maintenance_records: modification sur la moto principale"
  on public.maintenance_records for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.is_main_motorcycle(motorcycle_id)
    and (invoice_path is null or split_part(invoice_path, '/', 1) = (select auth.uid())::text)
  );

drop policy "maintenance_plans: propriétaire" on public.maintenance_plans;

create policy "maintenance_plans: lecture du propriétaire"
  on public.maintenance_plans for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "maintenance_plans: suppression du propriétaire"
  on public.maintenance_plans for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "maintenance_plans: ajout sur la moto principale"
  on public.maintenance_plans for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_main_motorcycle(motorcycle_id));

create policy "maintenance_plans: modification sur la moto principale"
  on public.maintenance_plans for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_main_motorcycle(motorcycle_id));

-- Un entretien noté relance le cycle du rappel du même type (et efface l'échéance saisie)
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
      due_on = null,
      notified_key = null
  where p.motorcycle_id = new.motorcycle_id and p.kind = new.kind and new.done_on >= p.base_on;
  return null;
end;
$$;

-- ---------- Factures : bucket privé ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "invoices (fichiers) : lecture des miens"
  on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "invoices (fichiers) : envoi dans son dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "invoices (fichiers) : suppression des miens"
  on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Rappels par notification ----------
create or replace function public.maintenance_label(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'oil' then 'Vidange'
    when 'oil_filter' then 'Filtre à huile'
    when 'tire_front' then 'Pneu avant'
    when 'tire_rear' then 'Pneu arrière'
    when 'tires' then 'Pneus'
    when 'chain_lube' then 'Graissage de la chaîne'
    when 'chain_tension' then 'Tension de la chaîne'
    when 'chain_kit' then 'Kit chaîne'
    when 'chain' then 'Chaîne'
    when 'brake_pads' then 'Plaquettes de frein'
    when 'brake_discs' then 'Disques de frein'
    when 'brake_fluid' then 'Liquide de frein'
    when 'brakes' then 'Freins'
    when 'coolant' then 'Liquide de refroidissement'
    when 'spark_plugs' then 'Bougies'
    when 'service' then 'Révision'
    when 'inspection' then 'Contrôle technique'
    when 'insurance' then 'Assurance'
    else 'Entretien'
  end;
$$;

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
  soon_days integer;
begin
  for plan in
    select
      p.id, p.owner_id, p.motorcycle_id, p.kind, p.base_on, p.base_km, p.due_on, p.notified_key,
      m.brand, m.model,
      case when p.every_km is not null and p.base_km is not null and g.odometer_km is not null
        then p.base_km + p.every_km - g.odometer_km end as km_left,
      case
        when p.due_on is not null then p.due_on - current_date
        when p.every_months is not null then ((p.base_on + make_interval(months => p.every_months))::date - current_date)
      end as days_left
    from public.maintenance_plans p
    join public.motorcycles m on m.id = p.motorcycle_id and m.is_main
    left join public.motorcycle_garage g on g.motorcycle_id = p.motorcycle_id
  loop
    soon_days := case when plan.kind in ('inspection', 'insurance') then 30 else 15 end;
    if plan.km_left <= 0 or plan.days_left <= 0 then
      stage := 'due';
    elsif plan.km_left <= 500 or plan.days_left <= soon_days then
      stage := 'soon';
    else
      continue;
    end if;
    key := stage || ':' || plan.base_on || ':' || coalesce(plan.base_km::text, '') || ':' || coalesce(plan.due_on::text, '');
    if plan.notified_key is not distinct from key then
      continue;
    end if;
    update public.maintenance_plans set notified_key = key where id = plan.id;
    label := public.maintenance_label(plan.kind);
    detail := case
      when stage = 'due' and plan.kind in ('inspection', 'insurance') then ': échéance dépassée'
      when stage = 'due' then ' à faire maintenant'
      when plan.km_left is not null and plan.km_left <= 500 then ' dans ' || plan.km_left || ' km'
      when plan.kind in ('inspection', 'insurance') then ' : échéance dans ' || plan.days_left || ' jours'
      else ' dans ' || plan.days_left || ' jours'
    end;
    perform public.send_push(array[plan.owner_id], 'garage',
      label || detail,
      plan.brand || ' ' || plan.model || ' · ouvre le carnet d''entretien',
      jsonb_build_object('url', '/garage/' || plan.motorcycle_id));
  end loop;
end;
$$;

revoke execute on function public.check_maintenance_reminders() from public, anon, authenticated;
