-- 0003: Enforce strictly one account per email (case-insensitive) + shared friend read access on exercise_sets
create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(trim(email)));

drop policy if exists "exercise_sets_shared_friend_read" on public.exercise_sets;
create policy "exercise_sets_shared_friend_read" on public.exercise_sets
  for select using (
    exists (
      select 1
      from public.exercise_logs l
      join public.profiles p on p.user_id = l.user_id
      where l.id = exercise_sets.exercise_log_id
        and (
          l.user_id = auth.uid()
          or (public.is_accepted_friend(l.user_id) and p.share_workout_details = true)
        )
    )
  );
