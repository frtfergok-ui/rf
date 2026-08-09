alter table public.site_settings
  add column if not exists opening_time time not null default '10:00',
  add column if not exists closing_time time not null default '22:00',
  add column if not exists bay_count smallint not null default 2,
  add column if not exists slot_interval_minutes smallint not null default 30,
  add column if not exists review_url text;

update public.site_settings
set
  review_url = coalesce(nullif(btrim(review_url), ''), google_maps_url),
  services = jsonb_build_array(
    services->0 || '{"duration_minutes":30,"price_amounts":{"sedan":350,"crossover":450,"van":550}}'::jsonb,
    services->1 || '{"duration_minutes":60,"price_amounts":{"sedan":790,"crossover":950,"van":1150}}'::jsonb,
    services->2 || '{"duration_minutes":180,"price_amounts":{"sedan":2900,"crossover":3500,"van":4200}}'::jsonb
  )
where id = 1;

alter table public.site_settings
  alter column review_url set not null,
  add constraint site_settings_bay_count_check check (bay_count between 1 and 10),
  add constraint site_settings_slot_interval_check check (slot_interval_minutes in (15, 30, 45, 60, 90)),
  add constraint site_settings_workday_check check (closing_time > opening_time),
  add constraint site_settings_review_url_length check (char_length(btrim(review_url)) between 8 and 500);

grant update (opening_time, closing_time, bay_count, slot_interval_minutes, review_url)
on table public.site_settings to authenticated;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  display_name text not null,
  last_car text not null,
  last_license_plate text not null,
  visits integer not null default 0 check (visits >= 0),
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  total_spent numeric(12,2) not null default 0 check (total_spent >= 0),
  last_visit_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_closures (
  id uuid primary key default gen_random_uuid(),
  closure_date date not null,
  start_time time,
  end_time time,
  reason text not null check (char_length(btrim(reason)) between 2 and 160),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint business_closures_time_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index business_closures_date_idx on public.business_closures (closure_date);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id) where actor_id is not null;

alter table public.bookings
  add column if not exists duration_minutes integer not null default 90,
  add column if not exists price_amount numeric(12,2) not null default 0,
  add column if not exists bay_number smallint,
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists management_token text not null default encode(gen_random_bytes(24), 'hex'),
  add column if not exists review_sent_at timestamptz;

alter table public.bookings
  add constraint bookings_duration_check check (duration_minutes between 15 and 480),
  add constraint bookings_price_check check (price_amount >= 0),
  add constraint bookings_bay_check check (bay_number is null or bay_number between 1 and 10),
  add constraint bookings_management_token_unique unique (management_token),
  add constraint bookings_cancel_reason_length check (cancel_reason is null or char_length(btrim(cancel_reason)) between 2 and 300);

drop index if exists public.bookings_active_slot_unique;
create index bookings_active_schedule_idx
  on public.bookings (booking_date, booking_time)
  where status in ('new', 'confirmed');
create index bookings_customer_idx on public.bookings (customer_id) where customer_id is not null;
create index bookings_assigned_to_idx on public.bookings (assigned_to) where assigned_to is not null;

create or replace function private.booking_service_duration(service_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((service_item->>'duration_minutes')::integer, 90)
  from public.site_settings s,
       jsonb_array_elements(s.services) service_item
  where s.id = 1 and service_item->>'id' = service_id
  limit 1;
$$;

create or replace function private.booking_service_price(service_id text, vehicle_id text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((service_item->'price_amounts'->>vehicle_id)::numeric, 0)
  from public.site_settings s,
       jsonb_array_elements(s.services) service_item
  where s.id = 1 and service_item->>'id' = service_id
  limit 1;
$$;

revoke all on function private.booking_service_duration(text) from public;
revoke all on function private.booking_service_price(text, text) from public;

create or replace function private.attach_customer_to_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_customer uuid;
begin
  insert into public.customers (phone, display_name, last_car, last_license_plate)
  values (new.phone, new.customer_name, new.car, new.license_plate)
  on conflict (phone) do update set
    display_name = excluded.display_name,
    last_car = excluded.last_car,
    last_license_plate = excluded.last_license_plate,
    updated_at = now()
  returning id into resolved_customer;
  new.customer_id := resolved_customer;
  return new;
end;
$$;

revoke all on function private.attach_customer_to_booking() from public;

create trigger attach_customer_to_booking
before insert on public.bookings
for each row execute function private.attach_customer_to_booking();

create or replace function private.enforce_booking_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.site_settings%rowtype;
  proposed_start timestamp;
  proposed_end timestamp;
  free_bay integer;
begin
  if new.status not in ('new', 'confirmed') then
    return new;
  end if;

  select * into settings_row from public.site_settings where id = 1;
  new.duration_minutes := coalesce(nullif(new.duration_minutes, 90), private.booking_service_duration(new.service), 90);
  if tg_op = 'INSERT' or new.price_amount = 0 then
    new.duration_minutes := coalesce(private.booking_service_duration(new.service), new.duration_minutes);
    new.price_amount := coalesce(private.booking_service_price(new.service, new.vehicle_type), 0);
  end if;

  if new.booking_date < current_date or new.booking_date > current_date + 90 then
    raise exception 'booking_date_out_of_range' using errcode = '22007';
  end if;

  proposed_start := new.booking_date + new.booking_time;
  proposed_end := proposed_start + make_interval(mins => new.duration_minutes);

  if new.booking_time < settings_row.opening_time
     or proposed_end > new.booking_date + settings_row.closing_time then
    raise exception 'outside_working_hours' using errcode = '22007';
  end if;

  if exists (
    select 1 from public.business_closures c
    where c.closure_date = new.booking_date
      and (
        c.start_time is null
        or (proposed_start < c.closure_date + c.end_time and proposed_end > c.closure_date + c.start_time)
      )
  ) then
    raise exception 'business_closed' using errcode = '22007';
  end if;

  perform pg_advisory_xact_lock(hashtext(new.booking_date::text));

  select bay into free_bay
  from generate_series(1, settings_row.bay_count) bay
  where not exists (
    select 1 from public.bookings b
    where b.id is distinct from new.id
      and b.status in ('new', 'confirmed')
      and b.booking_date = new.booking_date
      and b.bay_number = bay
      and proposed_start < b.booking_date + b.booking_time + make_interval(mins => b.duration_minutes)
      and proposed_end > b.booking_date + b.booking_time
  )
  order by bay
  limit 1;

  if free_bay is null then
    raise exception 'slot_capacity_reached' using errcode = '23505';
  end if;

  new.bay_number := free_bay;
  return new;
end;
$$;

revoke all on function private.enforce_booking_capacity() from public;

update public.bookings
set duration_minutes = coalesce(private.booking_service_duration(service), 90),
    price_amount = coalesce(private.booking_service_price(service, vehicle_type), 0),
    bay_number = 1;

create trigger enforce_booking_capacity
before insert or update of booking_date, booking_time, service, vehicle_type, status, duration_minutes
on public.bookings
for each row execute function private.enforce_booking_capacity();

create or replace function private.update_customer_loyalty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.customer_id is not null then
    update public.customers
    set visits = visits + 1,
        loyalty_points = loyalty_points + 1,
        total_spent = total_spent + new.price_amount,
        last_visit_at = now(),
        updated_at = now()
    where id = new.customer_id;
  elsif old.status = 'completed' and new.status is distinct from 'completed' and new.customer_id is not null then
    update public.customers
    set visits = greatest(visits - 1, 0),
        loyalty_points = greatest(loyalty_points - 1, 0),
        total_spent = greatest(total_spent - old.price_amount, 0),
        updated_at = now()
    where id = new.customer_id;
  end if;
  return new;
end;
$$;

revoke all on function private.update_customer_loyalty() from public;

create trigger update_customer_loyalty
after update of status on public.bookings
for each row execute function private.update_customer_loyalty();

create or replace function private.audit_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
begin
  row_id := coalesce(new.id, old.id);
  if (select auth.uid()) is not null then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      (select auth.uid()),
      lower(tg_op),
      'booking',
      row_id,
      jsonb_build_object(
        'old_status', case when tg_op = 'INSERT' then null else old.status end,
        'new_status', case when tg_op = 'DELETE' then null else new.status end,
        'customer', coalesce(new.customer_name, old.customer_name),
        'date', coalesce(new.booking_date, old.booking_date),
        'time', coalesce(new.booking_time, old.booking_time)
      )
    );
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_booking_change() from public;

create trigger audit_booking_change
after insert or update or delete on public.bookings
for each row execute function private.audit_booking_change();

create or replace function public.create_booking_secure(
  p_service text,
  p_vehicle_type text,
  p_booking_date date,
  p_booking_time time,
  p_customer_name text,
  p_phone text,
  p_car text,
  p_license_plate text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted public.bookings%rowtype;
begin
  if p_service not in ('express', 'complex', 'detailing')
     or p_vehicle_type not in ('sedan', 'crossover', 'van')
     or char_length(btrim(p_customer_name)) not between 2 and 80
     or char_length(btrim(p_phone)) not between 10 and 20
     or char_length(btrim(p_car)) not between 2 and 120
     or char_length(btrim(p_license_plate)) not between 2 and 20 then
    raise exception 'invalid_booking_data' using errcode = '22023';
  end if;

  insert into public.bookings (
    service, vehicle_type, booking_date, booking_time,
    customer_name, phone, car, license_plate, booking_source
  ) values (
    p_service, p_vehicle_type, p_booking_date, p_booking_time,
    btrim(p_customer_name), btrim(p_phone), btrim(p_car), upper(btrim(p_license_plate)), 'online'
  ) returning * into inserted;

  return jsonb_build_object(
    'id', inserted.id,
    'managementToken', inserted.management_token,
    'durationMinutes', inserted.duration_minutes,
    'bayNumber', inserted.bay_number
  );
end;
$$;

revoke all on function public.create_booking_secure(text,text,date,time,text,text,text,text) from public;
grant execute on function public.create_booking_secure(text,text,date,time,text,text,text,text) to anon, authenticated;

create or replace function public.manage_booking_secure(
  p_token text,
  p_action text,
  p_booking_date date default null,
  p_booking_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.bookings%rowtype;
begin
  select * into target from public.bookings where management_token = p_token;
  if target.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if target.status in ('completed', 'cancelled') then
    raise exception 'booking_cannot_be_changed' using errcode = '22023';
  end if;

  if p_action = 'cancel' then
    update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Отменено клиентом', updated_at = now()
    where id = target.id returning * into target;
  elsif p_action = 'reschedule' and p_booking_date is not null and p_booking_time is not null then
    update public.bookings
    set booking_date = p_booking_date, booking_time = p_booking_time, rescheduled_at = now(), updated_at = now()
    where id = target.id returning * into target;
  else
    raise exception 'invalid_management_action' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', target.id,
    'status', target.status,
    'date', target.booking_date,
    'time', target.booking_time,
    'customerName', target.customer_name,
    'phone', target.phone,
    'car', target.car,
    'licensePlate', target.license_plate
  );
end;
$$;

create or replace function public.get_booking_secure(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'service', b.service,
    'vehicleType', b.vehicle_type,
    'date', b.booking_date,
    'time', b.booking_time,
    'customerName', b.customer_name,
    'phone', b.phone,
    'car', b.car,
    'licensePlate', b.license_plate,
    'status', b.status,
    'durationMinutes', b.duration_minutes
  )
  from public.bookings b
  where b.management_token = p_token;
$$;

revoke all on function public.manage_booking_secure(text,text,date,time) from public;
revoke all on function public.get_booking_secure(text) from public;
grant execute on function public.manage_booking_secure(text,text,date,time) to anon, authenticated;
grant execute on function public.get_booking_secure(text) to anon, authenticated;

revoke insert on table public.bookings from anon;
drop policy if exists "public_can_create_valid_bookings" on public.bookings;

alter table public.customers enable row level security;
alter table public.business_closures enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.customers from anon, authenticated;
revoke all on table public.business_closures from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

grant select, update (notes) on table public.customers to authenticated;
grant select on table public.business_closures to anon, authenticated;
grant insert, update, delete on table public.business_closures to authenticated;
grant select on table public.audit_logs to authenticated;

create policy "active staff can view customers"
on public.customers for select to authenticated
using (exists (select 1 from public.staff_users s where s.id = (select auth.uid()) and s.active));

create policy "active staff can update customer notes"
on public.customers for update to authenticated
using (exists (select 1 from public.staff_users s where s.id = (select auth.uid()) and s.active))
with check (exists (select 1 from public.staff_users s where s.id = (select auth.uid()) and s.active));

create policy "closures are visible"
on public.business_closures for select to anon, authenticated using (true);

create policy "owners manage closures"
on public.business_closures for all to authenticated
using ((select private.is_active_owner()))
with check ((select private.is_active_owner()) and created_by = (select auth.uid()));

create policy "owners view audit log"
on public.audit_logs for select to authenticated
using ((select private.is_active_owner()));

grant update (
  duration_minutes, price_amount, bay_number, assigned_to, completed_by,
  rescheduled_at, cancelled_at, cancelled_by, cancel_reason, review_sent_at
) on table public.bookings to authenticated;
grant delete on table public.bookings to authenticated;

create policy "owners can delete bookings"
on public.bookings for delete to authenticated
using ((select private.is_active_owner()));

grant delete on table public.staff_users to authenticated;
create policy "owners can delete managers"
on public.staff_users for delete to authenticated
using ((select private.is_active_owner()) and role = 'manager');

update public.staff_users
set active = true
where lower(email) = 'mallautowash.md@gmail.com' and role = 'manager';

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) = 'mallautowash.md@gmail.com';
