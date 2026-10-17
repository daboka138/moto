-- Histoire de la moto : lecture sans compte (pages publiques possibles) sans appeler is_admin(),
-- qui n'est pas exécutable par le rôle anon. Membres : masqués visibles par l'admin seulement.
drop policy if exists "history_chapters: lecture" on public.history_chapters;
drop policy if exists "history_brands: lecture" on public.history_brands;
drop policy if exists "history_facts: lecture" on public.history_facts;

create policy "history_chapters: lecture (anon)" on public.history_chapters for select to anon using (hidden_at is null);
create policy "history_chapters: lecture (membres)" on public.history_chapters for select to authenticated
  using (hidden_at is null or (select public.is_admin()));

create policy "history_brands: lecture (anon)" on public.history_brands for select to anon using (hidden_at is null);
create policy "history_brands: lecture (membres)" on public.history_brands for select to authenticated
  using (hidden_at is null or (select public.is_admin()));

create policy "history_facts: lecture (anon)" on public.history_facts for select to anon using (hidden_at is null);
create policy "history_facts: lecture (membres)" on public.history_facts for select to authenticated
  using (hidden_at is null or (select public.is_admin()));
