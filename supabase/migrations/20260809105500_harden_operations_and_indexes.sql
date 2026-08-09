revoke all on function public.redeem_customer_reward(uuid) from anon, authenticated;
grant execute on function public.redeem_customer_reward(uuid) to authenticated;
alter function public.redeem_customer_reward(uuid) security invoker;
grant update (loyalty_points, updated_at) on table public.customers to authenticated;

alter function public.get_available_slots(date, text) security invoker;
grant select (duration_minutes, bay_number) on table public.bookings to anon;

drop policy if exists "owners manage closures" on public.business_closures;
create policy "owners insert closures"
on public.business_closures for insert to authenticated
with check ((select private.is_active_owner()) and created_by = (select auth.uid()));
create policy "owners update closures"
on public.business_closures for update to authenticated
using ((select private.is_active_owner()))
with check ((select private.is_active_owner()) and created_by = (select auth.uid()));
create policy "owners delete closures"
on public.business_closures for delete to authenticated
using ((select private.is_active_owner()));

create index if not exists bookings_completed_by_idx on public.bookings (completed_by) where completed_by is not null;
create index if not exists bookings_cancelled_by_idx on public.bookings (cancelled_by) where cancelled_by is not null;
create index if not exists business_closures_created_by_idx on public.business_closures (created_by);
