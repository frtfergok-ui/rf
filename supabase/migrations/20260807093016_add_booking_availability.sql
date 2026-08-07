alter table public.bookings
  drop constraint bookings_slot_unique;

create unique index bookings_active_slot_unique
  on public.bookings (booking_date, booking_time)
  where status in ('new', 'confirmed');

grant select (booking_date, booking_time, status)
  on table public.bookings to anon;

create policy "public_can_view_occupied_slots"
on public.bookings for select to anon
using (
  booking_date >= current_date
  and booking_date <= current_date + 90
  and status in ('new', 'confirmed')
);
