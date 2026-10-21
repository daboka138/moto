-- Note 33 C : préparation du premium. TOUT RESTE GRATUIT ET DÉSACTIVÉ : aucun paiement, aucun écran
-- de paiement. Règle : plus tard, le premium = UNIQUEMENT de nouvelles fonctions avancées ; la
-- sécurité (SOS, dangers, chute, « Je rentre ») reste gratuite pour toujours.
-- - Interrupteur global app_settings.premium_active ('off') : tant qu'il est off, une fonction
--   « premium » est accessible à tous (app : canUse ; serveur : feature_allowed).
-- - Catalogue : app_features.premium_planned (fonction prévue en premium, piloté par la console).
-- - Tarifs prévus : premium_config (admin seulement, rien n'est affiché aux membres).
-- - Membres fondateurs : inscrits AVANT l'activation (founding_members, badge public).

insert into public.app_settings (key, value) values
  ('premium_active', 'off'),
  -- Date de la PREMIÈRE activation (vide = jamais) : fige la liste des fondateurs
  ('premium_activated_at', '')
on conflict (key) do nothing;

create or replace function public.premium_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value = 'on' from public.app_settings s where s.key = 'premium_active'), false);
$$;
grant execute on function public.premium_is_active() to anon, authenticated;

-- Même règle que canUse() : premium inactif = tout le monde y a droit
create or replace function public.feature_allowed(p_key text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select f.status from public.app_features f where f.key = p_key), 'free')
    when 'free' then true
    when 'premium' then not public.premium_is_active() or public.has_premium(p_user)
    else false
  end;
$$;
revoke execute on function public.feature_allowed(text, uuid) from public, anon, authenticated;

-- ---------- Catalogue des fonctions prévues en premium ----------
alter table public.app_features add column premium_planned boolean not null default false;

-- Statut « free » : rien ne change pour personne. premium_planned = au catalogue du futur premium.
insert into public.app_features (key, name, description, status, sort, premium_planned) values
  ('weather_detail', 'Météo détaillée sur le trajet', 'Heure par heure tous les ~20 km (le résumé et les alertes restent gratuits)', 'free', 35, true),
  ('unlimited_stops', 'Étapes illimitées', 'Plus de 3 étapes par itinéraire ou balade (gratuit : 3 une fois le premium actif)', 'free', 36, true),
  ('offline_maps', 'Cartes hors ligne', 'Télécharger une région (build 1.3.0)', 'free', 37, true),
  ('loop_advanced', 'Boucles avancées', 'Choix des cols, type de route, durée précise', 'free', 38, true),
  ('full_stats', 'Statistiques complètes', 'Statistiques détaillées et historique illimité des trajets', 'free', 39, true),
  ('multi_garage', 'Carnet d’entretien multi-motos', 'Carnet et rappels pour plusieurs motos (futur)', 'free', 40, true),
  ('supporter_badge', 'Badge « Soutien »', 'Badge sur le profil des membres premium', 'free', 41, true)
on conflict (key) do nothing;

update public.app_features set premium_planned = true where key = 'gpx';

-- ---------- Tarifs prévus (jamais affichés aux membres tant que le premium est inactif) ----------
create table public.premium_config (
  id smallint primary key default 1 check (id = 1),
  monthly_eur numeric(6, 2) not null default 3.99 check (monthly_eur > 0),
  yearly_eur numeric(6, 2) not null default 29.99 check (yearly_eur > 0),
  -- Offre de lancement « membres fondateurs » : -50 % la 1re année
  founder_discount_pct smallint not null default 50 check (founder_discount_pct between 0 and 100),
  founder_offer_months smallint not null default 12 check (founder_offer_months between 1 and 36),
  updated_at timestamptz not null default now()
);

insert into public.premium_config (id) values (1) on conflict do nothing;

alter table public.premium_config enable row level security;

create policy "premium_config: lecture par l'admin"
  on public.premium_config for select to authenticated
  using ((select public.is_admin()));

create policy "premium_config: modification par l'admin"
  on public.premium_config for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create trigger premium_config_set_updated_at
  before update on public.premium_config
  for each row execute function public.set_updated_at();

-- Offre affichée par l'écran Premium : rien tant que le premium est inactif (sauf l'admin, aperçu)
create or replace function public.premium_offer()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.premium_is_active() or public.is_admin() then (
    select jsonb_build_object(
      'active', public.premium_is_active(),
      'monthly', c.monthly_eur,
      'yearly', c.yearly_eur,
      'founderDiscountPct', c.founder_discount_pct,
      'founderOfferMonths', c.founder_offer_months
    ) from public.premium_config c where c.id = 1
  ) end;
$$;
revoke execute on function public.premium_offer() from public, anon;
grant execute on function public.premium_offer() to authenticated;

-- ---------- Membres fondateurs ----------
create table public.founding_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  since timestamptz not null default now()
);

alter table public.founding_members enable row level security;

-- Badge public (comme le profil) ; aucune écriture possible depuis l'app
create policy "founding_members: lecture par les membres"
  on public.founding_members for select to authenticated
  using (true);

-- Tous les inscrits d'aujourd'hui sont fondateurs (date d'inscription = création du profil)
insert into public.founding_members (user_id, since)
select p.id, p.created_at from public.profiles p
on conflict do nothing;

-- Nouveaux inscrits : fondateurs tant que le premium n'a jamais été activé
create or replace function public.profiles_after_insert_founder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select s.value from public.app_settings s where s.key = 'premium_activated_at'), '') = '' then
    insert into public.founding_members (user_id) values (new.id) on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger profiles_after_insert_founder
  after insert on public.profiles
  for each row execute function public.profiles_after_insert_founder();

create or replace function public.is_founder(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.founding_members f where f.user_id = coalesce(p_user, (select auth.uid())));
$$;
grant execute on function public.is_founder(uuid) to authenticated;

-- ---------- Console › Fonctions › Premium ----------
create or replace function public.admin_premium()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return (
    select jsonb_build_object(
      'active', public.premium_is_active(),
      'activatedAt', nullif((select s.value from public.app_settings s where s.key = 'premium_activated_at'), ''),
      'monthly', c.monthly_eur,
      'yearly', c.yearly_eur,
      'founderDiscountPct', c.founder_discount_pct,
      'founderOfferMonths', c.founder_offer_months,
      'founders', (select count(*) from public.founding_members),
      'members', (select count(*) from public.profiles)
    ) from public.premium_config c where c.id = 1
  );
end;
$$;
revoke execute on function public.admin_premium() from public, anon;
grant execute on function public.admin_premium() to authenticated;

create or replace function public.admin_set_premium_config(
  p_monthly numeric, p_yearly numeric, p_discount integer, p_months integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.premium_config
  set monthly_eur = p_monthly, yearly_eur = p_yearly, founder_discount_pct = p_discount, founder_offer_months = p_months
  where id = 1;
end;
$$;
revoke execute on function public.admin_set_premium_config(numeric, numeric, integer, integer) from public, anon;
grant execute on function public.admin_set_premium_config(numeric, numeric, integer, integer) to authenticated;

-- Interrupteur global. La 1re activation fige la liste des fondateurs (date gardée ensuite).
create or replace function public.admin_set_premium_active(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.app_settings set value = case when p_on then 'on' else 'off' end where key = 'premium_active';
  if p_on then
    update public.app_settings set value = now()::text where key = 'premium_activated_at' and value = '';
  end if;
end;
$$;
revoke execute on function public.admin_set_premium_active(boolean) from public, anon;
grant execute on function public.admin_set_premium_active(boolean) to authenticated;
