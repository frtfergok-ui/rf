revoke insert on table public.bookings from anon;

grant insert (
  service,
  booking_date,
  booking_time,
  customer_name,
  phone,
  car,
  license_plate
) on table public.bookings to anon;
