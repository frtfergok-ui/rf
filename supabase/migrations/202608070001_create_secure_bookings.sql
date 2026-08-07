create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('express', 'complex', 'detailing')),
  booking_date date not null,
  booking_time time not null,
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  phone text not null check (char_length(phone) between 10 and 20),
  car text not null check (char_length(car) between 2 and 120),
  status text not null default 'new' check (status in ('new', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint bookings_slot_unique unique (booking_date, booking_time)
);

alter table public.bookings enable row level security;
revoke all on table public.bookings from anon, authenticated;
grant insert on table public.bookings to anon, authenticated;
grant select, insert, update, delete on table public.bookings to service_role;

create policy "public_can_create_valid_bookings"
on public.bookings for insert to anon, authenticated
with check (
  booking_date >= current_date
  and booking_date <= current_date + 90
  and status = 'new'
);
