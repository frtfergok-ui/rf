create index staff_access_requests_reviewed_by_idx
on public.staff_access_requests (reviewed_by)
where reviewed_by is not null;

drop policy "applicants can view own request" on public.staff_access_requests;
drop policy "owners can view access requests" on public.staff_access_requests;

create policy "applicants and owners can view access requests"
on public.staff_access_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_active_owner())
);

drop policy "staff_can_view_own_access" on public.staff_users;
drop policy "owners can view all staff" on public.staff_users;

create policy "staff can view own access and owners can view all"
on public.staff_users
for select
to authenticated
using (
  (id = (select auth.uid()) and active is true)
  or (select private.is_active_owner())
);
