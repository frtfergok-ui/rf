create or replace function public.get_available_slots(
  p_booking_date date,
  p_service text
)
returns jsonb
language sql
stable
security definer
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
      not exists (
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
