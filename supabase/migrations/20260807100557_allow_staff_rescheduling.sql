grant update (booking_date, booking_time)
  on table public.bookings to authenticated;

drop policy "staff_can_update_booking_status" on public.bookings;

create policy "staff_can_update_booking_status"
on public.bookings for update to authenticated
using (
  exists (
    select 1
    from public.staff_users
    where staff_users.id = (select auth.uid())
      and staff_users.active
  )
)
with check (
  exists (
    select 1
    from public.staff_users
    where staff_users.id = (select auth.uid())
      and staff_users.active
  )
  and (
    status in ('completed', 'cancelled')
    or booking_date between current_date and current_date + 90
  )
);
