-- partner_links : is_admin() n'est pas exécutable par anon → règle de lecture séparée
drop policy "partner_links: lecture des liens actifs" on public.partner_links;

create policy "partner_links: lecture des liens actifs (anon)"
  on public.partner_links for select to anon
  using (active);

create policy "partner_links: lecture des liens actifs (membres, tout pour l'admin)"
  on public.partner_links for select to authenticated
  using (active or (select public.is_admin()));
