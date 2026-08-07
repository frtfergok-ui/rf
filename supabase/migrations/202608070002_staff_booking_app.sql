create table public.staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.bookings add column confirmed_at timestamptz;
alter table public.bookings add column whatsapp_sent_at timestamptz;
alter table public.bookings add column updated_at timestamptz not null default now();

alter table public.staff_users enable row level security;
revoke all on table public.staff_users from anon, authenticated;
revoke select, update, delete on table public.bookings from anon;
revoke all on table public.bookings from authenticated;

grant select on table public.staff_users to authenticated;
grant select on table public.bookings to authenticated;
grant update (status, confirmed_at, whatsapp_sent_at, updated_at) on table public.bookings to authenticated;

create policy "staff_can_view_own_access"
on public.staff_users for select to authenticated
using ((select auth.uid()) = id and active);

create policy "staff_can_view_bookings"
on public.bookings for select to authenticated
using (exists (select 1 from public.staff_users where staff_users.id = (select auth.uid()) and staff_users.active));

create policy "staff_can_update_booking_status"
on public.bookings for update to authenticated
using (exists (select 1 from public.staff_users where staff_users.id = (select auth.uid()) and staff_users.active))
with check (exists (select 1 from public.staff_users where staff_users.id = (select auth.uid()) and staff_users.active));
