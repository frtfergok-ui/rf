-- Expand the service catalog with owner-editable extra services.
alter table public.bookings drop constraint if exists bookings_service_check;

alter table public.bookings
  add constraint bookings_service_check check (service in ('express', 'complex', 'detailing', 'wheel_cleaning', 'leather_conditioning', 'hydropolymer'));

alter table public.site_settings drop constraint if exists site_settings_three_services;

alter table public.site_settings
  add constraint site_settings_services_check check (jsonb_typeof(services) = 'array' and jsonb_array_length(services) >= 3);

update public.site_settings
set services = services || jsonb_build_array(
  jsonb_build_object('id','wheel_cleaning','name','Химчистка дисков','note','Глубокая очистка дисков','prices',jsonb_build_object('sedan','от 250 MDL','crossover','от 300 MDL','van','от 350 MDL'),'price_amounts',jsonb_build_object('sedan',250,'crossover',300,'van',350),'time','30 мин','duration_minutes',30),
  jsonb_build_object('id','leather_conditioning','name','Чистка кондиционера и кожи','note','Для салона 5 мест / 7 мест','prices',jsonb_build_object('sedan','от 600 MDL','crossover','от 750 MDL','van','от 900 MDL'),'price_amounts',jsonb_build_object('sedan',600,'crossover',750,'van',900),'time','45 мин','duration_minutes',45),
  jsonb_build_object('id','hydropolymer','name','Гидрополимер','note','Защитное гидрополимерное покрытие','prices',jsonb_build_object('sedan','от 450 MDL','crossover','от 550 MDL','van','от 650 MDL'),'price_amounts',jsonb_build_object('sedan',450,'crossover',550,'van',650),'time','25 мин','duration_minutes',25)
)
where id = 1
  and not exists (select 1 from jsonb_array_elements(services) item where item->>'id' = 'wheel_cleaning');

create or replace function public.create_booking_secure(
  p_service text, p_vehicle_type text, p_booking_date date, p_booking_time time,
  p_customer_name text, p_phone text, p_car text, p_license_plate text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare inserted public.bookings%rowtype;
begin
  if p_service not in ('express','complex','detailing','wheel_cleaning','leather_conditioning','hydropolymer')
     or p_vehicle_type not in ('sedan','crossover','suv','van')
     or char_length(btrim(p_customer_name)) not between 2 and 80
     or char_length(btrim(p_phone)) not between 10 and 20
     or char_length(btrim(p_car)) not between 2 and 120
     or char_length(btrim(p_license_plate)) not between 2 and 20 then
    raise exception 'invalid_booking_data' using errcode = '22023';
  end if;
  insert into public.bookings (service,vehicle_type,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source)
  values (p_service,p_vehicle_type,p_booking_date,p_booking_time,btrim(p_customer_name),btrim(p_phone),btrim(p_car),upper(btrim(p_license_plate)),'online')
  returning * into inserted;
  return jsonb_build_object('id',inserted.id,'managementToken',inserted.management_token,'durationMinutes',inserted.duration_minutes,'bayNumber',inserted.bay_number);
end; $$;

grant execute on function public.create_booking_secure(text,text,date,time,text,text,text,text) to anon, authenticated;
