alter table public.staff_users
  drop constraint if exists staff_users_role_check;

update public.staff_users
set role = 'manager'
where role = 'worker';

alter table public.staff_users
  add constraint staff_users_role_check
  check (role in ('owner', 'manager'));

drop policy if exists "owners can add workers" on public.staff_users;
drop policy if exists "owners can manage workers" on public.staff_users;

create policy "owners can add managers"
on public.staff_users for insert to authenticated
with check (
  (select private.is_active_owner())
  and role = 'manager'
  and active is true
);

create policy "owners can manage managers"
on public.staff_users for update to authenticated
using ((select private.is_active_owner()))
with check (
  (select private.is_active_owner())
  and (id = (select auth.uid()) or role = 'manager')
);

alter table public.site_settings
  add column if not exists instagram_url text,
  add column if not exists whatsapp_url text,
  add column if not exists tiktok_url text,
  add column if not exists google_maps_url text;

update public.site_settings
set
  instagram_url = coalesce(nullif(btrim(instagram_url), ''), 'https://www.instagram.com/'),
  whatsapp_url = coalesce(nullif(btrim(whatsapp_url), ''), 'https://wa.me/' || regexp_replace(phone, '[^0-9]', '', 'g')),
  tiktok_url = coalesce(nullif(btrim(tiktok_url), ''), 'https://www.tiktok.com/'),
  google_maps_url = coalesce(nullif(btrim(google_maps_url), ''), 'https://www.google.com/maps/search/?api=1&query=' || replace(address, ' ', '+'))
where id = 1;

alter table public.site_settings
  alter column instagram_url set not null,
  alter column whatsapp_url set not null,
  alter column tiktok_url set not null,
  alter column google_maps_url set not null;

alter table public.site_settings
  add constraint site_settings_instagram_url_length check (char_length(btrim(instagram_url)) between 8 and 300),
  add constraint site_settings_whatsapp_url_length check (char_length(btrim(whatsapp_url)) between 8 and 300),
  add constraint site_settings_tiktok_url_length check (char_length(btrim(tiktok_url)) between 8 and 300),
  add constraint site_settings_google_maps_url_length check (char_length(btrim(google_maps_url)) between 8 and 500);

grant update (instagram_url, whatsapp_url, tiktok_url, google_maps_url)
on table public.site_settings
to authenticated;
