alter table public.bookings
  add column booking_source text not null default 'online'
    check (booking_source in ('online', 'walk_in')),
  add column created_by uuid references auth.users(id) on delete set null;

alter table public.bookings
  alter column phone drop not null;

drop policy "public_can_create_valid_bookings" on public.bookings;

create policy "public_can_create_valid_bookings"
on public.bookings for insert to anon
with check (
  booking_date >= current_date
  and booking_date <= current_date + 90
  and status = 'new'
  and booking_source = 'online'
  and created_by is null
);

grant insert (
  service,
  booking_date,
  booking_time,
  customer_name,
  phone,
  car,
  license_plate,
  booking_source,
  created_by
) on table public.bookings to authenticated;

create policy "staff_can_create_walk_in_bookings"
on public.bookings for insert to authenticated
with check (
  (select auth.uid()) is not null
  and created_by = (select auth.uid())
  and booking_source = 'walk_in'
  and status = 'new'
  and booking_date >= current_date
  and booking_date <= current_date + 90
  and exists (
    select 1
    from public.staff_users
    where staff_users.id = (select auth.uid())
      and staff_users.active
  )
);
