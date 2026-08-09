alter table public.vehicle_models drop constraint vehicle_models_vehicle_type_check;
alter table public.vehicle_models add constraint vehicle_models_vehicle_type_check
  check (vehicle_type in ('sedan', 'crossover', 'suv', 'van'));

alter table public.bookings drop constraint bookings_vehicle_type_check;
alter table public.bookings add constraint bookings_vehicle_type_check
  check (vehicle_type in ('sedan', 'crossover', 'suv', 'van'));

update public.vehicle_models
set vehicle_type = 'suv', updated_at = now()
where active and vehicle_type = 'crossover' and (
  (brand, model) in (
    ('Acura','MDX'),('Aston Martin','DBX'),('Audi','Q7'),('Audi','Q8'),
    ('Bentley','Bentayga'),('BMW','iX'),('BMW','X5'),('BMW','X6'),('BMW','X7'),
    ('Byd','Tang'),('Cadillac','Escalade'),('Chevrolet','Tahoe'),
    ('Chery','Tiggo 8'),('Dodge','Durango'),('Exeed','VX'),('Ferrari','Purosangue'),
    ('Ford','Ranger'),('GAC','GS8'),('Geely','Monjaro'),('Genesis','GV80'),
    ('GMC','Sierra'),('GMC','Yukon'),('Great Wall','Hover'),('Great Wall','Poer'),('Great Wall','Wingle'),
    ('Haval','Dargo'),('Hongqi','E-HS9'),('Hyundai','Palisade'),('Hyundai','Santa Fe'),
    ('Infiniti','QX70'),('Isuzu','D-Max'),('Isuzu','MU-X'),('Jac','T8'),('Jaecoo','J8'),
    ('Jeep','Grand Cherokee'),('Jeep','Wrangler'),('Jetour','T2'),('Jetour','X90 Plus'),
    ('KIA','Sorento'),('Land Rover','Discovery'),('Land Rover','Range Rover'),('Land Rover','Range Rover Sport'),
    ('Lexus','GX'),('Lexus','LX'),('Lincoln','Navigator'),('Maserati','Levante'),('Mazda','CX-9'),
    ('Mercedes','G-Class'),('Mercedes','GLE'),('Mercedes','GLS'),
    ('Mitsubishi','L200'),('Mitsubishi','Pajero'),('NIO','EL8'),
    ('Nissan','Navara'),('Nissan','Pathfinder'),('Porsche','Cayenne'),
    ('RAM','1500'),('RAM','2500'),('Rolls-Royce','Cullinan'),('Ssangyong','Rexton'),
    ('Tesla','Model X'),('Toyota','Highlander'),('Toyota','Hilux'),
    ('Toyota','Land Cruiser 300'),('Toyota','Land Cruiser Prado'),
    ('Volkswagen','Amarok'),('Volkswagen','Touareg'),('Volvo','XC90'),('Xpeng','G9')
  )
  or brand in ('ARO','BAW','Hummer','Polar Stone','Rivian','Tank','УАЗ')
);

with van_tariffs as (
  select
    max(case when service->>'id' = 'express' then (service->'price_amounts'->>'van')::numeric end) as express_price,
    max(case when service->>'id' = 'complex' then (service->'price_amounts'->>'van')::numeric end) as complex_price,
    max(case when service->>'id' = 'detailing' then (service->'price_amounts'->>'van')::numeric end) as detailing_price
  from public.site_settings s
  cross join lateral jsonb_array_elements(s.services) service
  where s.id = 1
)
update public.vehicle_models v
set express_price = t.express_price,
    complex_price = t.complex_price,
    detailing_price = t.detailing_price,
    updated_at = now()
from van_tariffs t
where v.vehicle_type = 'suv';

create or replace function private.booking_service_price(service_id text, vehicle_id text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((service_item->'price_amounts'->>(case when vehicle_id = 'suv' then 'van' else vehicle_id end))::numeric, 0)
  from public.site_settings s,
       jsonb_array_elements(s.services) service_item
  where s.id = 1 and service_item->>'id' = service_id
  limit 1;
$$;

revoke all on function private.booking_service_price(text, text) from public;

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
     or p_vehicle_type not in ('sedan', 'crossover', 'suv', 'van')
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
