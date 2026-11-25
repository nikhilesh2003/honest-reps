-- 0004: Ensure primary owner admin email is registered in public.admin_emails
-- so public.is_admin() RLS policy permits admin notification broadcasts to public.app_settings.
insert into public.admin_emails (email, added_by)
values ('mailbox2249@gmail.com', 'system')
on conflict (email) do nothing;
