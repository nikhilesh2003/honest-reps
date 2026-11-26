-- 0006: Privacy-preserving member search & non-friend profile preview RPCs.
-- Never exposes email, weight, height, age, active_status, or private workout logs.

create or replace function public.search_members(query_text text)
returns table (
  user_id uuid,
  name text,
  username text,
  goal text,
  share_workout_details boolean,
  friendship_status text,
  friendship_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with cleaned as (
    select lower(regexp_replace(trim(coalesce(query_text, '')), '^@', '')) as q
  )
  select
    p.user_id,
    p.name,
    p.username,
    p.goal,
    p.share_workout_details,
    case
      when f.status = 'accepted' then 'accepted'
      when f.status = 'pending' and f.user_id = auth.uid() then 'pending_sent'
      when f.status = 'pending' and f.friend_id = auth.uid() then 'pending_received'
      else 'none'
    end as friendship_status,
    f.id as friendship_id
  from public.profiles p
  cross join cleaned c
  left join public.friendships f
    on (f.user_id = auth.uid() and f.friend_id = p.user_id)
    or (f.friend_id = auth.uid() and f.user_id = p.user_id)
  where auth.uid() is not null
    and p.suspended = false
    and p.user_id <> auth.uid()
    and length(c.q) >= 1
    and (
      lower(p.username) like '%' || c.q || '%'
      or lower(p.name) like '%' || c.q || '%'
    )
  order by
    case when lower(p.username) = c.q then 0 when lower(p.username) like c.q || '%' then 1 else 2 end,
    p.name asc
  limit 20;
$$;

create or replace function public.get_member_preview(target_user_id uuid)
returns table (
  user_id uuid,
  name text,
  username text,
  goal text,
  share_workout_details boolean,
  friendship_status text,
  friendship_id uuid,
  active_days_30d integer,
  total_workouts integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.name,
    p.username,
    p.goal,
    p.share_workout_details,
    case
      when f.status = 'accepted' then 'accepted'
      when f.status = 'pending' and f.user_id = auth.uid() then 'pending_sent'
      when f.status = 'pending' and f.friend_id = auth.uid() then 'pending_received'
      else 'none'
    end as friendship_status,
    f.id as friendship_id,
    (
      select count(distinct d)::integer
      from (
        select e.date as d
        from public.exercise_logs e
        where e.user_id = p.user_id
          and e.date >= (current_date - interval '30 days')::date::text
        union
        select c.date as d
        from public.cardio_logs c
        where c.user_id = p.user_id
          and coalesce(c.is_rest_activity, false) = false
          and c.date >= (current_date - interval '30 days')::date::text
      ) active_dates
    ) as active_days_30d,
    (
      (select count(*)::integer from public.exercise_logs e where e.user_id = p.user_id)
      + (select count(*)::integer from public.cardio_logs c where c.user_id = p.user_id and coalesce(c.is_rest_activity, false) = false)
    ) as total_workouts
  from public.profiles p
  left join public.friendships f
    on (f.user_id = auth.uid() and f.friend_id = p.user_id)
    or (f.friend_id = auth.uid() and f.user_id = p.user_id)
  where auth.uid() is not null
    and p.suspended = false
    and p.user_id = target_user_id
  limit 1;
$$;
