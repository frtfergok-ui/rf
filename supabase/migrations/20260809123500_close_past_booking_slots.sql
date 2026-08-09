create or replace function public.get_available_slots(
  p_booking_date date,
  p_service text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with settings as (
    select
      s.opening_time,
      s.closing_time,
      s.slot_interval_minutes,
      s.bay_count,
      coalesce((service_item->>'duration_minutes')::integer, 90) as duration_minutes
    from public.site_settings s,
         jsonb_array_elements(s.services) service_item
    where s.id = 1 and service_item->>'id' = p_service
  ),
  candidate_slots as (
    select slot_start
    from settings s,
         generate_series(
           p_booking_date + s.opening_time,
           p_booking_date + s.closing_time - make_interval(mins => s.duration_minutes),
           make_interval(mins => s.slot_interval_minutes)
         ) slot_start
  ),
  capacity as (
    select
      to_char(c.slot_start, 'HH24:MI') as slot,
      greatest(
        s.bay_count - count(distinct b.bay_number) filter (
          where b.id is not null
            and c.slot_start < b.booking_date + b.booking_time + make_interval(mins => b.duration_minutes)
            and c.slot_start + make_interval(mins => s.duration_minutes) > b.booking_date + b.booking_time
        ),
        0
      )::integer as available_bays,
      c.slot_start > timezone('Europe/Chisinau', now())
      and not exists (
        select 1 from public.business_closures cl
        where cl.closure_date = p_booking_date
          and (
            cl.start_time is null
            or (
              c.slot_start < cl.closure_date + cl.end_time
              and c.slot_start + make_interval(mins => s.duration_minutes) > cl.closure_date + cl.start_time
            )
          )
      ) as is_open
    from candidate_slots c
    cross join settings s
    left join public.bookings b
      on b.booking_date = p_booking_date and b.status in ('new', 'confirmed')
    group by c.slot_start, s.bay_count, s.duration_minutes
    order by c.slot_start
  )
  select jsonb_build_object(
    'durationMinutes', (select duration_minutes from settings),
    'bayCount', (select bay_count from settings),
    'slots', coalesce(jsonb_agg(jsonb_build_object(
      'time', slot,
      'availableBays', case when is_open then available_bays else 0 end
    )), '[]'::jsonb)
  )
  from capacity;
$$;

revoke all on function public.get_available_slots(date, text) from public;
grant execute on function public.get_available_slots(date, text) to anon, authenticated;

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
  local_now timestamp := timezone('Europe/Chisinau', now());
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

  if new.booking_date < local_now::date or new.booking_date > local_now::date + 90 then
    raise exception 'booking_date_out_of_range' using errcode = '22007';
  end if;

  proposed_start := new.booking_date + new.booking_time;
  proposed_end := proposed_start + make_interval(mins => new.duration_minutes);

  if proposed_start <= local_now then
    raise exception 'booking_time_has_passed' using errcode = '22007';
  end if;

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
