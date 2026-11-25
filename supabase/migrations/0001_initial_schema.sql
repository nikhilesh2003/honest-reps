-- Honest Reps — Supabase PostgreSQL Schema & Row-Level Security
-- Derived from Gym Tracker Requirements Specification v0.3 / v0.4 (Section 5)

create extension if not exists "pgcrypto";

-- 1. profiles (FR-2 to FR-4, FR-65, FR-69)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  username text not null unique,
  height_cm numeric(5,2),
  active_status text not null default 'Moderately active'
    check (active_status in ('Sedentary', 'Lightly active', 'Moderately active', 'Very active')),
  weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  height_unit text not null default 'cm' check (height_unit in ('cm', 'ft-in')),
  age integer,
  sex text,
  goal text,
  share_workout_details boolean not null default false,
  onboarding_complete boolean not null default false,
  suspended boolean not null default false,
  first_log_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. weight_logs (FR-5)
create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2) not null,
  created_at timestamptz not null default now()
);

-- 3. muscle_groups (FR-7, FR-49, FR-67)
create table if not exists public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  display_order integer not null default 0,
  owner_id uuid references public.profiles(user_id) on delete cascade
);

-- 4. exercise_library (FR-10, FR-49, FR-67)
create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group_id uuid not null references public.muscle_groups(id) on delete cascade,
  enabled boolean not null default true,
  display_order integer not null default 0,
  owner_id uuid references public.profiles(user_id) on delete cascade
);

-- 5. hidden_exercises (FR-10, FR-67)
create table if not exists public.hidden_exercises (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  exercise_id uuid not null references public.exercise_library(id) on delete cascade,
  primary key (user_id, exercise_id)
);

-- 6. sessions (FR-6 to FR-8)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_date date not null,
  muscle_group_names text[] not null default '{}',
  is_rest boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, session_date)
);

-- 7. exercise_logs (FR-11, FR-18, FR-66, FR-74)
create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  log_date date not null,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  muscle_group text not null,
  optional_minutes integer,
  source text not null default 'manual' check (source in ('manual', 'text-parsed', 'image-parsed')),
  added_later boolean not null default false,
  created_at timestamptz not null default now()
);

-- 8. exercise_sets (FR-11)
create table if not exists public.exercise_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_log_id uuid not null references public.exercise_logs(id) on delete cascade,
  set_number integer not null,
  weight_kg numeric(6,2) not null,
  reps integer not null
);

-- 9. cardio_logs (FR-12 to FR-21, FR-74)
create table if not exists public.cardio_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  log_date date not null,
  activity_type text not null,
  distance_km numeric(6,2),
  minutes integer not null check (minutes > 0),
  avg_heart_rate integer,
  kcal integer,
  kcal_is_estimated boolean not null default false,
  source text not null default 'text-parsed' check (source in ('manual', 'text-parsed', 'image-parsed')),
  added_later boolean not null default false,
  is_rest_activity boolean not null default false,
  created_at timestamptz not null default now()
);

-- 10. effort_scores (FR-28 to FR-33, FR-62 to FR-64, FR-70 to FR-76)
create table if not exists public.effort_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  log_date date not null,
  log_type text not null check (log_type in ('exercise', 'cardio', 'day')),
  log_reference uuid,
  work numeric(12,4) not null,
  usual_used numeric(12,4),
  score integer check (score between 0 and 100),
  status text not null check (status in ('Calibrating', 'Scored', 'Rest')),
  scoring_settings_version integer not null default 1,
  created_at timestamptz not null default now()
);

-- 11. friendships (FR-35)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  friend_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

-- 12. notification_settings (FR-41, FR-43, FR-44)
create table if not exists public.notification_settings (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  daily_prompt_enabled boolean not null default true,
  daily_prompt_time text not null default '17:30',
  weekly_weight_enabled boolean not null default true,
  weekly_weight_time text not null default '09:00',
  friend_requests_enabled boolean not null default true,
  summaries_enabled boolean not null default true,
  quiet_hours_start text not null default '22:00',
  quiet_hours_end text not null default '07:00',
  email_fallback_enabled boolean not null default true
);

-- 13. push_subscriptions (FR-40)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  device_endpoint text not null,
  p256dh text,
  auth_key text,
  created_at timestamptz not null default now()
);

-- 14. user_roles & 15. admin_emails (FR-46, FR-68)
create table if not exists public.user_roles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin'))
);

create table if not exists public.admin_emails (
  email text primary key,
  added_by text not null,
  added_at timestamptz not null default now()
);

-- 16. app_settings (FR-50, FR-54)
create table if not exists public.app_settings (
  id integer primary key default 1,
  version integer not null default 1,
  ai_provider text not null default 'gemini' check (ai_provider in ('gemini', 'openrouter')),
  ai_model text not null default 'gemini-2.5-flash',
  ai_rate_limit_per_day integer not null default 30,
  max_image_size_mb numeric(4,1) not null default 5.0,
  above_usual_slope numeric(6,2) not null default 12.5,
  below_usual_root numeric(4,2) not null default 4.0,
  backfill_window_days integer not null default 2,
  grid_thresholds jsonb not null default '{"veryLowMax":24,"lowMax":44,"steadyMax":55,"highMax":75}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 17. audit_log (FR-55)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

-- Enable Row-Level Security (NFR-2)
alter table public.profiles enable row level security;
alter table public.weight_logs enable row level security;
alter table public.sessions enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.exercise_sets enable row level security;
alter table public.cardio_logs enable row level security;
alter table public.effort_scores enable row level security;
alter table public.friendships enable row level security;
alter table public.notification_settings enable row level security;

-- Helper: check if caller is an accepted friend
create or replace function public.is_accepted_friend(target_uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.user_id = auth.uid() and f.friend_id = target_uid)
        or (f.friend_id = auth.uid() and f.user_id = target_uid))
  );
$$;

-- Helper: check if caller is admin via admin_emails (FR-68)
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.admin_emails ae
    where lower(ae.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- RLS Policies: Owner always accesses own data; private weight_logs strictly owner-only (FR-39, FR-48)
create policy "weight_owner_only" on public.weight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sessions_owner_or_friend" on public.sessions
  for select using (auth.uid() = user_id or public.is_accepted_friend(user_id));
create policy "sessions_owner_write" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "exercise_logs_owner_or_shared_friend" on public.exercise_logs
  for select using (
    auth.uid() = user_id or (
      public.is_accepted_friend(user_id)
      and exists (select 1 from public.profiles p where p.user_id = exercise_logs.user_id and p.share_workout_details = true)
    )
  );
create policy "exercise_logs_owner_write" on public.exercise_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cardio_logs_owner_or_shared_friend" on public.cardio_logs
  for select using (
    auth.uid() = user_id or (
      public.is_accepted_friend(user_id)
      and exists (select 1 from public.profiles p where p.user_id = cardio_logs.user_id and p.share_workout_details = true)
    )
  );
create policy "cardio_logs_owner_write" on public.cardio_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "effort_owner_or_friend" on public.effort_scores
  for select using (auth.uid() = user_id or public.is_accepted_friend(user_id));
create policy "effort_owner_write" on public.effort_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
