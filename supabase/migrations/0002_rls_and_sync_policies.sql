-- 0002: Complete RLS policies for profiles, friendships, exercise_sets, notification_settings,
-- plus privacy-preserving username lookup RPC (FR-35, FR-39, NFR-2).

-- 1. profiles policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_select_connected" on public.profiles;
create policy "profiles_select_connected" on public.profiles
  for select using (
    public.is_accepted_friend(user_id)
    or exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = profiles.user_id)
         or (f.friend_id = auth.uid() and f.user_id = profiles.user_id)
    )
  );

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Privacy-preserving friend search RPC: returns ONLY user_id, name, username, share_workout_details
-- Never exposes email, weight, height, age, or activity status (FR-39)
create or replace function public.find_member_by_username(lookup_username text)
returns table (
  user_id uuid,
  name text,
  username text,
  share_workout_details boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.name, p.username, p.share_workout_details
  from public.profiles p
  where auth.uid() is not null
    and p.suspended = false
    and lower(p.username) = lower(regexp_replace(trim(lookup_username), '^@', ''))
  limit 1;
$$;

-- 2. friendships policies (FR-35)
drop policy if exists "friendships_select_involved" on public.friendships;
create policy "friendships_select_involved" on public.friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester" on public.friendships
  for insert with check (auth.uid() = user_id);

drop policy if exists "friendships_update_involved" on public.friendships;
create policy "friendships_update_involved" on public.friendships
  for update using (auth.uid() = user_id or auth.uid() = friend_id)
  with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friendships_delete_involved" on public.friendships;
create policy "friendships_delete_involved" on public.friendships
  for delete using (auth.uid() = user_id or auth.uid() = friend_id);

-- 3. exercise_sets policies
drop policy if exists "exercise_sets_owner_write" on public.exercise_sets;
create policy "exercise_sets_owner_write" on public.exercise_sets
  for all using (
    exists (select 1 from public.exercise_logs l where l.id = exercise_sets.exercise_log_id and l.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.exercise_logs l where l.id = exercise_sets.exercise_log_id and l.user_id = auth.uid())
  );

-- 4. notification_settings policies
drop policy if exists "notif_owner_only" on public.notification_settings;
create policy "notif_owner_only" on public.notification_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. admin_emails & app_settings policies
alter table public.admin_emails enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "admin_emails_read_self_or_admin" on public.admin_emails;
create policy "admin_emails_read_self_or_admin" on public.admin_emails
  for select using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_admin()
  );

drop policy if exists "admin_emails_admin_write" on public.admin_emails;
create policy "admin_emails_admin_write" on public.admin_emails
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "app_settings_read_all" on public.app_settings;
create policy "app_settings_read_all" on public.app_settings
  for select using (true);

drop policy if exists "app_settings_admin_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());
