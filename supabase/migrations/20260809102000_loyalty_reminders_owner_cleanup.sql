alter table public.bookings
  add column if not exists reminder_sent_at timestamptz;

grant update (reminder_sent_at) on table public.bookings to authenticated;

grant delete on table public.customers to authenticated;

create policy "owners can delete customers"
on public.customers for delete to authenticated
using ((select private.is_active_owner()));

create or replace function public.redeem_customer_reward(p_customer_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  if not exists (
    select 1 from public.staff_users s
    where s.id = (select auth.uid()) and s.active
  ) then
    raise exception 'staff_access_required' using errcode = '42501';
  end if;

  update public.customers
  set loyalty_points = loyalty_points - 5,
      updated_at = now()
  where id = p_customer_id and loyalty_points >= 5
  returning loyalty_points into remaining;

  if remaining is null then
    raise exception 'reward_not_available' using errcode = '22023';
  end if;
  return remaining;
end;
$$;

revoke all on function public.redeem_customer_reward(uuid) from public;
grant execute on function public.redeem_customer_reward(uuid) to authenticated;
