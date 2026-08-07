alter table public.bookings
add column license_plate text;

update public.bookings
set license_plate = 'НЕ УКАЗАН'
where license_plate is null;

alter table public.bookings
alter column license_plate set not null;

alter table public.bookings
add constraint bookings_license_plate_length
check (char_length(btrim(license_plate)) between 2 and 20);
