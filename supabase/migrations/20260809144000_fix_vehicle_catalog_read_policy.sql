drop policy if exists "public can view active vehicle models" on public.vehicle_models;

create policy "anyone can view active vehicle models"
on public.vehicle_models for select
using (active);

create policy "owners can view all vehicle models"
on public.vehicle_models for select to authenticated
using (exists (
  select 1 from public.staff_users s
  where s.id = (select auth.uid()) and s.active and s.role = 'owner'
));
