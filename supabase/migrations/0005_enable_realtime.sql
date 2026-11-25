-- 0005: Enable Supabase Realtime for core tables
-- Ensures live synchronization across connected clients for:
-- 1. sessions (In the Gym status, active muscle groups, rest day)
-- 2. friendships (friend requests sent, accepted, declined)
-- 3. exercise_logs & exercise_sets (strength workout logs and sets)
-- 4. cardio_logs (cardio logs)
-- 5. effort_scores (daily and monthly effort scores)
-- 6. profiles (user details, name, username, shareWorkoutDetails)
-- 7. weight_logs (weight check-in history)
-- 8. app_settings (announcements, effort thresholds, system configs)

-- Enable REPLICA IDENTITY FULL so UPDATE and DELETE events transmit full row records
alter table public.sessions replica identity full;
alter table public.friendships replica identity full;
alter table public.exercise_logs replica identity full;
alter table public.exercise_sets replica identity full;
alter table public.cardio_logs replica identity full;
alter table public.effort_scores replica identity full;
alter table public.profiles replica identity full;
alter table public.weight_logs replica identity full;
alter table public.app_settings replica identity full;

-- Enable RLS on push_subscriptions if not already enabled and add owner policy
alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_owner'
  ) then
    create policy "push_subscriptions_owner" on public.push_subscriptions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Add tables to supabase_realtime publication safely
do $$
begin
  begin
    alter publication supabase_realtime add table public.sessions;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.friendships;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.exercise_logs;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.exercise_sets;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.cardio_logs;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.effort_scores;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.weight_logs;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.app_settings;
  exception when duplicate_object then null;
  end;
end $$;
