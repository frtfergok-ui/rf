create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_users
    where id = (select auth.uid())
      and active is true
      and role = 'owner'
  );
$$;

revoke all on function private.is_active_owner() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_owner() to authenticated;

alter table public.staff_users add column email text;

update public.staff_users
set email = auth.users.email
from auth.users
where auth.users.id = public.staff_users.id;

alter table public.staff_users
  alter column email set not null,
  add constraint staff_users_email_unique unique (email);

create table public.staff_access_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null constraint staff_access_requests_name_length check (char_length(btrim(display_name)) between 2 and 80),
  status text not null default 'pending' constraint staff_access_requests_status_check check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.staff_access_requests enable row level security;
revoke all on table public.staff_access_requests from anon, authenticated;
grant select on table public.staff_access_requests to authenticated;
grant update (status, reviewed_at, reviewed_by) on table public.staff_access_requests to authenticated;

create policy "applicants can view own request"
on public.staff_access_requests
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "owners can view access requests"
on public.staff_access_requests
for select
to authenticated
using ((select private.is_active_owner()));

create policy "owners can review access requests"
on public.staff_access_requests
for update
to authenticated
using ((select private.is_active_owner()))
with check (
  (select private.is_active_owner())
  and status in ('approved', 'rejected')
  and reviewed_by = (select auth.uid())
  and reviewed_at is not null
);

create or replace function private.handle_new_staff_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  staff_name text;
begin
  if new.email is null then
    return new;
  end if;
  staff_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 80);
  if char_length(staff_name) < 2 then
    staff_name := 'Сотрудник';
  end if;
  insert into public.staff_access_requests (user_id, email, display_name)
  values (new.id, new.email, staff_name);
  return new;
end;
$$;

revoke all on function private.handle_new_staff_request() from public;

create trigger create_staff_access_request
after insert on auth.users
for each row execute function private.handle_new_staff_request();

grant insert (id, email, display_name, active, role) on table public.staff_users to authenticated;
grant update (display_name, active, role) on table public.staff_users to authenticated;

create policy "owners can view all staff"
on public.staff_users
for select
to authenticated
using ((select private.is_active_owner()));

create policy "owners can add workers"
on public.staff_users
for insert
to authenticated
with check (
  (select private.is_active_owner())
  and role = 'worker'
  and active is true
);

create policy "owners can manage workers"
on public.staff_users
for update
to authenticated
using ((select private.is_active_owner()))
with check (
  (select private.is_active_owner())
  and (id = (select auth.uid()) or role = 'worker')
);
