alter table public.staff_users
  add column if not exists role text not null default 'worker'
  constraint staff_users_role_check check (role in ('owner', 'worker'));

-- The project currently has one approved staff account: make it the first owner.
update public.staff_users
set role = 'owner'
where active is true;

alter table public.bookings
  add column if not exists vehicle_type text not null default 'sedan'
  constraint bookings_vehicle_type_check check (vehicle_type in ('sedan', 'crossover', 'van'));

grant insert (vehicle_type) on table public.bookings to anon, authenticated;

create table public.site_settings (
  id smallint primary key default 1 constraint site_settings_singleton check (id = 1),
  phone text not null constraint site_settings_phone_length check (char_length(btrim(phone)) between 5 and 30),
  address text not null constraint site_settings_address_length check (char_length(btrim(address)) between 3 and 160),
  hours text not null constraint site_settings_hours_length check (char_length(btrim(hours)) between 3 and 80),
  telegram_url text not null constraint site_settings_telegram_length check (char_length(btrim(telegram_url)) between 8 and 200),
  services jsonb not null constraint site_settings_three_services check (
    jsonb_typeof(services) = 'array' and jsonb_array_length(services) = 3
  ),
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, phone, address, hours, telegram_url, services)
values (
  1,
  '+7 999 123-45-67',
  'ул. Автомобильная, 12',
  'Ежедневно 08:00–22:00',
  'https://t.me/',
  '[
    {"id":"express","name":"Экспресс","note":"Кузов · диски · сушка","prices":{"sedan":"350 ₽","crossover":"450 ₽","van":"550 ₽"},"time":"25 мин"},
    {"id":"complex","name":"Комплекс","note":"Кузов · салон · стёкла","prices":{"sedan":"790 ₽","crossover":"950 ₽","van":"1 150 ₽"},"time":"55 мин"},
    {"id":"detailing","name":"Детейлинг","note":"Глубокая чистка и защита","prices":{"sedan":"от 2 900 ₽","crossover":"от 3 500 ₽","van":"от 4 200 ₽"},"time":"2–3 часа"}
  ]'::jsonb
)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

revoke all on table public.site_settings from anon, authenticated;
grant select on table public.site_settings to anon, authenticated;
grant update (phone, address, hours, telegram_url, services, updated_at) on table public.site_settings to authenticated;

create policy "site settings are public"
on public.site_settings
for select
to anon, authenticated
using (true);

create policy "owners can update site settings"
on public.site_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.staff_users
    where staff_users.id = (select auth.uid())
      and staff_users.active is true
      and staff_users.role = 'owner'
  )
)
with check (
  id = 1
  and exists (
    select 1
    from public.staff_users
    where staff_users.id = (select auth.uid())
      and staff_users.active is true
      and staff_users.role = 'owner'
  )
);
